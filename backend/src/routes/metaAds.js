const express = require("express");
const crypto = require("crypto");
const { requireAdmin } = require("../middleware/auth");
const { getMetaCredentials } = require("../config/metaCredentials");
const pool = require("../config/db");
const { hasOrderAccess } = require("../utils/orderAccess");
const { parseItems, itemQuantity } = require("../utils/analyticsPeriods");
const { rateLimit, getIp } = require("../middleware/rateLimit");

const router = express.Router();
// Matches Meta's current official Business SDK; allow a tested version override.
const GRAPH_VERSION = /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION || "") ? process.env.META_GRAPH_VERSION : "v26.0";
const capiLimiter = rateLimit({ windowMs: 60000, max: 120 });

function normalizeAdAccountId(id) {
  if (!id) return null;
  const trimmed = String(id).trim();
  if (!trimmed) return null;
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

/** SHA-256 hash a string (Meta requires hashed PII for CAPI) */
function sha256(value) {
  return crypto.createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex");
}

// ── GET /api/meta-ads/pixel-config (public) ─────────────────────────────────
// Storefront reads this to decide whether/with-which-ID to boot the browser
// pixel. Only ever exposes the Pixel ID (that ID is meant to be public - it's
// the same ID that ships inside the fbevents.js snippet on every site that
// uses Meta Pixel). The access token NEVER appears in this response.
router.get("/pixel-config", async (req, res) => {
  try {
    const creds = await getMetaCredentials();
    res.json({ enabled: creds.enabled, pixelId: creds.enabled ? creds.pixelId : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load pixel config" });
  }
});

// ── GET /api/meta-ads/insights (admin only) ─────────────────────────────────
// Proxies Meta Marketing API's Ad Account Insights for the admin dashboard.
// ?range= one of today | yesterday | last_7d | last_14d | last_30d | last_90d
router.get("/insights", requireAdmin, async (req, res) => {
  try {
    const creds = await getMetaCredentials();
    if (!creds.enabled || !creds.accessToken || !creds.adAccountId) {
      return res.status(400).json({
        error: "Meta Ads isn't fully configured yet — set META_PIXEL_ID, META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in the backend environment.",
      });
    }

    const allowedPresets = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d"];
    const datePreset = allowedPresets.includes(req.query.range) ? req.query.range : "last_30d";

    const actAccount = normalizeAdAccountId(creds.adAccountId);
    const fields = "spend,impressions,clicks,ctr,cpc,cpm,reach,actions,action_values";

    const url =
      `https://graph.facebook.com/${GRAPH_VERSION}/${actAccount}/insights` +
      `?fields=${fields}&date_preset=${datePreset}&level=account&access_token=${encodeURIComponent(creds.accessToken)}`;

    const campaignsUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/${actAccount}/insights` +
      `?fields=campaign_name,spend,impressions,clicks,ctr,actions&date_preset=${datePreset}&level=campaign&limit=25&access_token=${encodeURIComponent(
        creds.accessToken
      )}`;

    const [accountRes, campaignsRes] = await Promise.all([fetch(url, { signal: AbortSignal.timeout(15000) }), fetch(campaignsUrl, { signal: AbortSignal.timeout(15000) })]);
    const accountData = await accountRes.json();
    const campaignsData = await campaignsRes.json();

    if (accountData.error) {
      console.error("[Meta Insights] Graph API error:", JSON.stringify(accountData.error));
      return res.status(502).json({ error: accountData.error.message || "Meta API request failed" });
    }

    const summary = (accountData.data && accountData.data[0]) || {
      spend: "0", impressions: "0", clicks: "0", ctr: "0", cpc: "0", cpm: "0", reach: "0", actions: [], action_values: [],
    };

    const findAction = (arr, type) => {
      const hit = (arr || []).find((a) => a.action_type === type);
      return hit ? Number(hit.value) : 0;
    };

    const purchases = findAction(summary.actions, "purchase") || findAction(summary.actions, "offsite_conversion.fb_pixel_purchase");
    const purchaseValue =
      findAction(summary.action_values, "purchase") || findAction(summary.action_values, "offsite_conversion.fb_pixel_purchase");
    const spend = Number(summary.spend || 0);
    const roas = spend > 0 ? purchaseValue / spend : 0;

    const campaigns = (campaignsData.data || []).map((c) => ({
      name: c.campaign_name,
      spend: Number(c.spend || 0),
      impressions: Number(c.impressions || 0),
      clicks: Number(c.clicks || 0),
      ctr: Number(c.ctr || 0),
      purchases: findAction(c.actions, "purchase") || findAction(c.actions, "offsite_conversion.fb_pixel_purchase"),
    }));

    res.json({
      datePreset,
      spend,
      impressions: Number(summary.impressions || 0),
      clicks: Number(summary.clicks || 0),
      ctr: Number(summary.ctr || 0),
      cpc: Number(summary.cpc || 0),
      cpm: Number(summary.cpm || 0),
      reach: Number(summary.reach || 0),
      purchases,
      purchaseValue,
      roas,
      campaigns,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Meta Insights] error:", err);
    res.status(500).json({ error: "Failed to fetch Meta Ads insights" });
  }
});

// ── Shared CAPI sender ───────────────────────────────────────────────────
// Used by the POST /capi route below (browser-triggered) AND directly by
// server-triggered CAPI calls (no HTTP
// round-trip needed since it's the same process). `ipAddress`/`userAgent`
// are optional since the webhook fallback often won't have the customer's
// original browser context.
async function sendCapiEvent({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  orderId,
  total,
  currency,
  contentIds,
  numItems,
  customerEmail,
  customerPhone,
  customerName,
  fbp,
  fbc,
  ipAddress,
  userAgent,
}) {
  const creds = await getMetaCredentials();
  if (!creds.enabled || !creds.accessToken || !creds.pixelId) {
    return { skipped: true };
  }
  if (!eventName || !eventId) {
    throw new Error("eventName and eventId are required");
  }

  const userData = {};
  if (customerEmail) userData.em = sha256(customerEmail);
  if (customerPhone) {
    const cleaned = String(customerPhone).replace(/\D/g, "");
    const withCountry = cleaned.startsWith("91") ? cleaned : `91${cleaned}`;
    userData.ph = sha256(withCountry);
  }
  if (customerName) {
    const parts = String(customerName).trim().split(" ");
    userData.fn = sha256(parts[0] || "");
    if (parts.length > 1) userData.ln = sha256(parts.slice(1).join(" "));
  }
  if (ipAddress) userData.client_ip_address = ipAddress;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const capiEvent = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl || "https://3dcasemakers.com",
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: currency || "INR",
          value: total,
          content_ids: contentIds || [],
          content_type: "product",
          num_items: numItems,
          order_id: orderId,
        },
      },
    ],
  };

  const capiUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.pixelId}/events?access_token=${encodeURIComponent(
    creds.accessToken
  )}`;
  const capiRes = await fetch(capiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(capiEvent),
    signal: AbortSignal.timeout(15000),
  });
  const capiData = await capiRes.json();
  if (!capiRes.ok) {
    console.error("[Meta CAPI] error:", JSON.stringify(capiData));
    throw new Error("Meta CAPI call failed");
  }
  return { success: true, meta: capiData };
}

// ── POST /api/meta-ads/capi (public) ────────────────────────────────────────
// Server-side Conversions API mirror of a browser pixel event, deduplicated
// via the shared eventId (same one the storefront's fbq() call uses).
router.post("/capi", capiLimiter, async (req, res) => {
  try {
    const {
      eventName, eventId, eventTime, eventSourceUrl, orderId, total, currency,
      contentIds, numItems, customerEmail, customerPhone, customerName, fbp, fbc,
    } = req.body || {};

    const allowedEvents = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase", "Search", "Lead", "Contact"];
    if (!allowedEvents.includes(eventName) || typeof eventId !== "string" || eventId.length > 200) return res.status(400).json({ error: "Invalid analytics event" });
    const clientIp = getIp(req);
    let purchase = {};
    if (eventName === "Purchase") {
      if (typeof orderId !== "string" || !hasOrderAccess(orderId, req.headers["x-order-access"])) return res.status(403).json({ error: "Verify the order before recording a purchase" });
      const [[order]] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
      if (!order || order.source === "manual" || ["cancelled", "returned"].includes(order.status)) return res.status(400).json({ error: "Order cannot be recorded as a storefront purchase" });
      const items = parseItems(order.items_json);
      purchase = {
        eventId: `purchase_${order.id}`, eventTime: Math.floor(Date.parse(String(order.created_at).replace(" ", "T") + "+05:30") / 1000),
        orderId: order.id, total: Number(order.total), currency: "INR", contentIds: items.map((i) => i.product?.id).filter(Boolean),
        numItems: items.reduce((sum, item) => sum + itemQuantity(item), 0),
        customerName: order.customer_name, customerPhone: order.customer_phone, customerEmail: order.customer_email,
      };
    }

    const result = await sendCapiEvent({
      eventName, eventId, eventTime, eventSourceUrl, orderId, total, currency,
      contentIds, numItems, customerEmail, customerPhone, customerName, fbp, fbc,
      ipAddress: clientIp,
      userAgent: req.headers["user-agent"],
      ...purchase,
    });
    res.json(result);
  } catch (err) {
    console.error("[Meta CAPI] error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

module.exports = router;
module.exports.sendCapiEvent = sendCapiEvent;
