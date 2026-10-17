const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { normalizePhone } = require("../utils/phone");
const { rateLimit, getIp } = require("../middleware/rateLimit");
const { periodRange, PERIOD_KEYS, zeroFillDates, storeDate, addDays, parseItems, itemQuantity, orderDiscount, reportRange, zeroFillMonths } = require("../utils/analyticsPeriods");
const { isIP } = require("node:net");

const router = express.Router();
const trackingLimiter = rateLimit({ windowMs: 60000, max: 300 });
const LIVE_WINDOW_SECONDS = 30;

// ---------------------------------------------------------------------
// Visitor IP + geolocation (for the admin "Live Activity" panel).
//
// getClientIp() reads the real client address from X-Forwarded-For when
// the app is behind a reverse proxy (nginx / Cloudflare / load balancer —
// the normal production setup), same pattern already used in metaAds.js,
// falling back to the raw socket address for local/dev.
//
// resolveLocation() turns an IP into a city/region/country using the free
// ip-api.com lookup (no key required). Results are cached in memory per IP
// for a few hours so repeat heartbeats from the same visitor (every ~15s)
// never re-hit the external API — only the first sighting of a given IP
// does a lookup. Private/local IPs (dev, LAN) are skipped entirely.
// ---------------------------------------------------------------------
const ipLocationCache = new Map(); // ip -> { city, region, country, ts }
const LOCATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getClientIp(req) {
  return getIp(req);
}

function isPrivateIp(ip) {
  if (!ip) return true;
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

async function resolveLocation(ip) {
  if (!isIP(ip) || isPrivateIp(ip)) return null;
  const cached = ipLocationCache.get(ip);
  if (cached && Date.now() - cached.ts < LOCATION_CACHE_TTL_MS) return cached;
  try {
    const resp = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    if (!data || data.status !== "success") return null;
    const loc = { city: data.city || null, region: data.regionName || null, country: data.country || null, ts: Date.now() };
    if (ipLocationCache.size >= 1000) ipLocationCache.delete(ipLocationCache.keys().next().value);
    ipLocationCache.set(ip, loc);
    return loc;
  } catch {
    return null; // never let a lookup failure break visitor tracking
  }
}


// Classifies a raw document.referrer URL into a human-friendly traffic source
// label for the admin Visitors analytics tab (Google Search, Instagram, etc.)
function classifyTrafficSource(referrer) {
  if (!referrer) return "Direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    const domain = (name) => host === name || host.endsWith(`.${name}`);
    const localized = (name) => new RegExp(`(^|\\.)${name}\\.(com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})$`).test(host);
    if (localized("google")) return "Google Search";
    if (domain("bing.com")) return "Bing Search";
    if (localized("yahoo")) return "Yahoo Search";
    if (domain("duckduckgo.com")) return "DuckDuckGo Search";
    if (domain("instagram.com")) return "Instagram";
    if (domain("facebook.com") || domain("fb.com")) return "Facebook";
    if (domain("wa.me") || domain("whatsapp.com")) return "WhatsApp";
    if (domain("youtube.com") || domain("youtu.be")) return "YouTube";
    if (domain("t.co") || domain("twitter.com") || domain("x.com")) return "Twitter / X";
    if (localized("pinterest")) return "Pinterest";
    if (domain("linkedin.com")) return "LinkedIn";
    return host; // some other referring website — show its domain
  } catch {
    return "Direct";
  }
}

// POST /api/analytics/heartbeat - public, called every ~15s by frontend (feature 10 & 13)
router.post("/heartbeat", trackingLimiter, async (req, res) => {
  const { sessionId, page, cartCount, pageLabel, referrer } = req.body || {};
  if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) return res.status(400).json({ error: "Valid sessionId required" });
  if (page != null && (typeof page !== "string" || page.length > 255)) return res.status(400).json({ error: "Invalid page" });
  if (pageLabel != null && (typeof pageLabel !== "string" || pageLabel.length > 255)) return res.status(400).json({ error: "Invalid page label" });
  if (referrer != null && typeof referrer !== "string") return res.status(400).json({ error: "Invalid referrer" });
  const count = Number(cartCount || 0);
  if (!Number.isInteger(count) || count < 0 || count > 2500) return res.status(400).json({ error: "Invalid cart count" });
  try {
    const clientIp = getClientIp(req);
    await pool.query(
      `INSERT INTO live_visitors (session_id, page, page_label, cart_count, ip_address, first_seen)
       VALUES (?,?,?,?,?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE page = VALUES(page), page_label = VALUES(page_label),
         cart_count = VALUES(cart_count), ip_address = VALUES(ip_address), last_seen = CURRENT_TIMESTAMP`,
      [sessionId, page || "/", pageLabel || null, count, clientIp || null]
    );
    // Resolve city/region/country in the background — never block the
    // heartbeat response on an external API call. The in-memory cache in
    // resolveLocation() means this only actually hits the network the
    // first time a given IP shows up.
    if (clientIp) {
      resolveLocation(clientIp)
        .then((loc) => {
          if (!loc) return;
          return pool.query(
            `UPDATE live_visitors SET city = ?, region = ?, country = ? WHERE session_id = ?`,
            [loc.city, loc.region, loc.country, sessionId]
          );
        })
        .catch(() => {});
    }
    // Persist one row per (day, session) so total-visitor counts survive
    // even after the live_visitors row gets cleaned up for inactivity.
    // landing_page/traffic_source are only set on first INSERT (a visitor's
    // entry point that day); last_page/last_page_label update on every beat
    // so it always reflects the most recent page they were seen on —
    // effectively "which page they left off at" for that session/day.
    const source = classifyTrafficSource(referrer);
    await pool.query(
      `INSERT INTO visitor_daily_log
         (visit_date, session_id, landing_page, landing_page_label, traffic_source, referrer_raw, last_page, last_page_label)
       VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_page = VALUES(last_page), last_page_label = VALUES(last_page_label)`,
      [sessionId, page || "/", pageLabel || null, source, (referrer || "").slice(0, 500), page || "/", pageLabel || null]
    );
    // opportunistically clean up stale sessions (>2 min inactive)
    await pool.query("DELETE FROM live_visitors WHERE last_seen < (NOW() - INTERVAL 2 MINUTE)");
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Heartbeat failed" });
  }
});

// GET /api/analytics/visitor-stats - admin: distinct visitor totals for Today / Yesterday / Last 7 Days
router.get("/visitor-stats", requireAdmin, async (req, res) => {
  try {
    const [[{ todayCount }]] = await pool.query(
      "SELECT COUNT(DISTINCT session_id) as todayCount FROM visitor_daily_log WHERE visit_date = CURDATE()"
    );
    const [[{ yesterdayCount }]] = await pool.query(
      "SELECT COUNT(DISTINCT session_id) as yesterdayCount FROM visitor_daily_log WHERE visit_date = (CURDATE() - INTERVAL 1 DAY)"
    );
    const [[{ last7Count }]] = await pool.query(
      "SELECT COUNT(DISTINCT session_id) as last7Count FROM visitor_daily_log WHERE visit_date > (CURDATE() - INTERVAL 7 DAY)"
    );
    res.json({ today: todayCount, yesterday: yesterdayCount, last7Days: last7Count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch visitor stats" });
  }
});

// GET /api/analytics/visitor-analytics - admin: detailed Views/Analytics tab data
// ?period= today | yesterday | 7d | 28d (default: today)
// Returns total unique visitors for the period, a 28-day daily trend, top
// landing pages (where visitors arrived), top last-seen/exit pages (where
// they left off), and a breakdown of traffic sources (Google, Instagram, etc.)
function visitorRange(key) {
  const aliases = { "7d": 7, "28d": 28, "30d": 30, "90d": 90 };
  if (aliases[key]) {
    const end = addDays(storeDate(), 1);
    const start = addDays(end, -aliases[key]);
    return { start, end, where: `visit_date >= '${start}' AND visit_date < '${end}'` };
  }
  const range = periodRange(key);
  return { ...range, where: range.where.replaceAll("created_at", "visit_date") };
}

router.get("/visitor-analytics", requireAdmin, async (req, res) => {
  try {
    const periodKey = PERIOD_KEYS.has(req.query.period) || ["7d", "28d", "30d", "90d"].includes(req.query.period) ? req.query.period : "today";
    const range = visitorRange(periodKey);
    const where = range.where;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT session_id) as total FROM visitor_daily_log WHERE ${where}`
    );

    const [dailyRows] = await pool.query(
      `SELECT visit_date as date, COUNT(DISTINCT session_id) as count
       FROM visitor_daily_log WHERE ${where}
       GROUP BY visit_date ORDER BY date ASC`
    );
    const counts = new Map(dailyRows.map((row) => [String(row.date).slice(0, 10), Number(row.count) || 0]));
    const byDay = zeroFillDates(dailyRows.map((r) => ({ day: r.date })), range.start, range.end)
      .map((r) => ({ date: r.day, count: counts.get(r.day) || 0 }));
    const firstVisits = `FROM visitor_daily_log v JOIN
      (SELECT session_id, MIN(visit_date) as visit_date FROM visitor_daily_log WHERE ${where} GROUP BY session_id) chosen
      USING (session_id, visit_date)`;
    const lastVisits = `FROM visitor_daily_log v JOIN
      (SELECT session_id, MAX(visit_date) as visit_date FROM visitor_daily_log WHERE ${where} GROUP BY session_id) chosen
      USING (session_id, visit_date)`;

    const [landingPages] = await pool.query(
      `SELECT COALESCE(NULLIF(landing_page_label, ''), landing_page, '/') as label, COUNT(*) as count
       ${firstVisits}
       GROUP BY label ORDER BY count DESC LIMIT 10`
    );

    const [exitPages] = await pool.query(
      `SELECT COALESCE(NULLIF(last_page_label, ''), last_page, '/') as label, COUNT(*) as count
       ${lastVisits}
       GROUP BY label ORDER BY count DESC LIMIT 10`
    );

    const [sources] = await pool.query(
      `SELECT COALESCE(traffic_source, 'Direct') as source, COUNT(*) as count
       ${firstVisits}
       GROUP BY source ORDER BY count DESC LIMIT 15`
    );

    res.json({ period: periodKey, total, byDay, landingPages, exitPages, sources });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch visitor analytics" });
  }
});


router.get("/live-visitors", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT lv.session_id, lv.page, lv.page_label, lv.cart_count, lv.last_seen, lv.first_seen,
              lv.ip_address, lv.city, lv.region, lv.country,
              ac.customer_name, ac.customer_phone, ac.customer_alt_phone, ac.customer_email,
              ac.shipping_address, ac.apartment, ac.city as checkout_city, ac.state, ac.pincode, ac.items_json, ac.total
       FROM live_visitors lv
       LEFT JOIN abandoned_carts ac ON ac.session_id = lv.session_id
       WHERE lv.last_seen > (NOW() - INTERVAL ${LIVE_WINDOW_SECONDS} SECOND)
       ORDER BY lv.last_seen DESC`
    );
    res.json(
      rows.map((r) => ({
        id: r.session_id,
        page: r.page,
        pageLabel: r.page_label || null,
        isCheckout: (r.page || "").startsWith("/checkout"),
        cartCount: r.cart_count,
        lastSeen: r.last_seen,
        firstSeen: r.first_seen || r.last_seen,
        // Visitor's IP + geolocation, resolved in the background on
        // heartbeat (see resolveLocation above) — city/region/country are
        // null until the first lookup for that IP completes, and stay null
        // for local/private IPs (dev, LAN). Kept separate from the
        // checkout-form "city" field below (that one is the shipping
        // address the customer typed in, not their IP location).
        ipAddress: r.ip_address || null,
        geoCity: r.city || null,
        geoRegion: r.region || null,
        geoCountry: r.country || null,
        geoLocation: [r.city, r.region, r.country].filter(Boolean).join(", ") || null,
        // Captured only once a visitor has typed something into the checkout
        // form — lets the admin see who a live session belongs to, if known.
        customerName: r.customer_name || null,
        customerPhone: r.customer_phone || null,
        customerAltPhone: r.customer_alt_phone || null,
        customerEmail: r.customer_email || null,
        shippingAddress: r.shipping_address || null,
        apartment: r.apartment || null,
        city: r.checkout_city || null,
        state: r.state || null,
        pincode: r.pincode || null,
        checkoutItems: parseItems(r.items_json),
        checkoutTotal: r.total != null ? Number(r.total) : null,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch live visitors" });
  }
});

// POST /api/analytics/abandoned-cart - public, debounced from checkout form as soon as any field is filled
router.post("/abandoned-cart", trackingLimiter, async (req, res) => {
  const {
    sessionId, customerName, customerPhone, customerAltPhone, customerEmail,
    shippingAddress, apartment, city, state, pincode, items, total,
  } = req.body || {};
  if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId)) return res.status(400).json({ error: "Valid sessionId required" });
  if (!Array.isArray(items) || items.length > 50 || JSON.stringify(items).length > 200000) return res.status(400).json({ error: "Invalid cart items" });
  if (total != null && (!Number.isFinite(Number(total)) || Number(total) < 0)) return res.status(400).json({ error: "Invalid cart total" });
  const text = (value, max) => String(value || "").trim().slice(0, max);
  try {
    if (!items || items.length === 0) {
      await pool.query("DELETE FROM abandoned_carts WHERE session_id = ?", [sessionId]);
      return res.json({ ok: true });
    }
    await pool.query(
      `INSERT INTO abandoned_carts
         (session_id, customer_name, customer_phone, customer_alt_phone, customer_email,
          shipping_address, apartment, city, state, pincode, items_json, total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), customer_phone = VALUES(customer_phone),
         customer_alt_phone = VALUES(customer_alt_phone), customer_email = VALUES(customer_email),
         shipping_address = VALUES(shipping_address), apartment = VALUES(apartment),
         city = VALUES(city), state = VALUES(state), pincode = VALUES(pincode),
         items_json = VALUES(items_json), total = VALUES(total), updated_at = CURRENT_TIMESTAMP`,
      [
        sessionId, text(customerName, 255), normalizePhone(customerPhone), normalizePhone(customerAltPhone), text(customerEmail, 255),
        text(shippingAddress, 500), text(apartment, 255), text(city, 100), text(state, 100), text(pincode, 10),
        JSON.stringify(items), Number(total) || 0,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save abandoned cart" });
  }
});

// GET /api/analytics/abandoned-carts - admin: carts left behind at checkout.
// Returns everything from the last 90 days (raised from a hard 7-day window)
// so the admin panel's Today/Yesterday/This Week/Last Week/This Month filters
// have something to filter against — filtering itself happens client-side.
router.get("/abandoned-carts", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM abandoned_carts WHERE updated_at > (NOW() - INTERVAL 90 DAY) ORDER BY updated_at DESC`
    );
    res.json(
      rows.map((r) => ({
        id: r.session_id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        customerAltPhone: r.customer_alt_phone,
        customerEmail: r.customer_email,
        shippingAddress: r.shipping_address,
        apartment: r.apartment,
        city: r.city,
        state: r.state,
        pincode: r.pincode,
        items: parseItems(r.items_json),
        total: Number(r.total),
        updatedAt: r.updated_at,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch abandoned carts" });
  }
});

// DELETE /api/analytics/abandoned-carts/:sessionId - admin: dismiss one
router.delete("/abandoned-carts/:sessionId", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM abandoned_carts WHERE session_id = ?", [req.params.sessionId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove abandoned cart" });
  }
});

// GET /api/analytics/live - public: "X viewing / Y sold today" (feature 10)
router.get("/live", async (req, res) => {
  try {
    const [[{ viewing }]] = await pool.query(
      `SELECT COUNT(*) as viewing FROM live_visitors WHERE last_seen > (NOW() - INTERVAL ${LIVE_WINDOW_SECONDS} SECOND)`
    );
    const [orders] = await pool.query(
      `SELECT items_json FROM orders WHERE DATE(created_at) = CURDATE() AND status NOT IN ('cancelled', 'returned')`
    );
    const soldToday = orders.reduce((sum, o) => sum + parseItems(o.items_json).reduce((n, item) => n + itemQuantity(item), 0), 0);
    res.json({ viewing, soldToday });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch live stats" });
  }
});

// Maps a period key to a SQL WHERE fragment (on created_at) + a day-window for the chart

// Human labels for the period keys above — shared by the dashboard KPI
// strip and the Sales/Customer report exporters below.
const PERIOD_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 Days",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  last_6_months: "Last 6 Months",
  this_year: "This Year",
  last_1_year: "Last 1 Year",
  all_time: "All Time",
};

// GET /api/analytics/dashboard - admin: sales summary + top products (feature 16)
// ?period= one of today|yesterday|this_week|last_week|this_month|last_month|last_3_months|last_6_months|last_1_year (default: today)
router.get("/dashboard", requireAdmin, async (req, res) => {
  try {
    const periodKey = PERIOD_KEYS.has(req.query.period) ? req.query.period : "today";
    const range = periodRange(periodKey);

    const [[totals]] = await pool.query(
      `SELECT COUNT(*) as totalOrders, COALESCE(SUM(total),0) as totalRevenue
       FROM orders WHERE status NOT IN ('cancelled', 'returned')`
    );
    const [[today]] = await pool.query(
      `SELECT COUNT(*) as ordersToday, COALESCE(SUM(total),0) as revenueToday
       FROM orders WHERE DATE(created_at) = CURDATE() AND status NOT IN ('cancelled', 'returned')`
    );
    // Selected-period figures — this is what the KPI cards show, default = today
    const [[period]] = await pool.query(
      `SELECT COUNT(*) as ordersInPeriod, COALESCE(SUM(total),0) as revenueInPeriod
       FROM orders WHERE status NOT IN ('cancelled', 'returned') AND ${range.where}`
    );
    const [[periodPending]] = await pool.query(
      `SELECT COUNT(*) as pendingInPeriod FROM orders WHERE status = 'pending' AND ${range.where}`
    );
    const [dailyRevenueRaw] = await pool.query(
      `SELECT DATE(created_at) as day, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
       FROM orders WHERE status NOT IN ('cancelled', 'returned') AND ${range.where}
       GROUP BY DATE(created_at) ORDER BY day ASC`
    );
    // Zero-fill missing days so charts/sparklines show real gaps (a day
    // with no orders used to simply vanish and the line jumped across it).
    const dailyRevenue = zeroFillDates(dailyRevenueRaw, range.start, range.end);
    // Always-7-day series for the KPI sparklines, independent of the period.
    const [last7Raw] = await pool.query(
      `SELECT DATE(created_at) as day, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
       FROM orders WHERE status NOT IN ('cancelled', 'returned') AND created_at >= (CURDATE() - INTERVAL 6 DAY)
       GROUP BY DATE(created_at) ORDER BY day ASC`
    );
    const sparkRange = periodRange("last_7_days");
    const last7Days = zeroFillDates(last7Raw, sparkRange.start, sparkRange.end);
    const [statusBreakdown] = await pool.query(
      `SELECT status, COUNT(*) as count FROM orders WHERE ${range.where} GROUP BY status`
    );
    const [orders] = await pool.query(`SELECT items_json FROM orders WHERE status NOT IN ('cancelled', 'returned') AND ${range.where}`);
    const productCounts = Object.create(null);
    orders.forEach((o) => {
      try {
        const items = JSON.parse(o.items_json || "[]");
        items.forEach((it) => {
          const key = it.product?.id || it.productId;
          const title = it.product?.title || it.title || "Unknown";
          if (!key) return;
          productCounts[key] = productCounts[key] || { title, qty: 0 };
          productCounts[key].qty += itemQuantity(it);
        });
      } catch {}
    });
    const topProducts = Object.entries(productCounts)
      .map(([id, v]) => ({ id, title: v.title, qty: v.qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    res.json({
      totals,
      today,
      period: { key: periodKey, ...period, pendingInPeriod: periodPending.pendingInPeriod },
      dailyRevenue,
      last7Days,
      statusBreakdown,
      topProducts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch dashboard analytics" });
  }
});


// GET /api/analytics/insights?period= — admin: the extra breakdowns behind
// the Home dashboard's detailed charts (weekday / hour-of-day / state /
// order source / new-vs-returning / AOV), for the same period keys as
// /dashboard. Computed from the orders table in one pass.
router.get("/insights", requireAdmin, async (req, res) => {
  try {
    const periodKey = PERIOD_KEYS.has(req.query.period) ? req.query.period : "this_month";
    const range = periodRange(periodKey);

    const [rows] = await pool.query(
      `SELECT id, total, shipping, status, state, source, customer_phone, items_json, created_at,
              DAYOFWEEK(created_at) AS dow, HOUR(created_at) AS hr
       FROM orders WHERE ${range.where}`
    );

    // Phones that had at least one (non-cancelled) order BEFORE this period
    // started are "returning" customers; everyone else is new.
    let returningSet = new Set();
    if (range.start) {
      const [prevPhones] = await pool.query(
        `SELECT DISTINCT customer_phone FROM orders
         WHERE status NOT IN ('cancelled', 'returned') AND customer_phone IS NOT NULL AND customer_phone != '' AND created_at < ?`,
        [range.start]
      );
      returningSet = new Set(prevPhones.map((r) => normalizePhone(r.customer_phone)));
    }

    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const byWeekday = WEEKDAYS.map((d) => ({ label: d, revenue: 0, orders: 0 }));
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
    const states = Object.create(null);
    const sources = { website: { revenue: 0, orders: 0 }, manual: { revenue: 0, orders: 0 } };
    const brands = Object.create(null);
    const seenPhones = new Set();
    let newCustomers = 0;
    let returningCustomers = 0;
    let revenue = 0;
    let shipping = 0;
    let orders = 0;
    let units = 0;
    let cancelled = 0;
    let cancelledValue = 0;
    let returned = 0;
    let returnedValue = 0;
    let delivered = 0;

    for (const o of rows) {
      const total = Number(o.total) || 0;
      if (o.status === "returned") {
        returned++;
        returnedValue += total;
        continue;
      }
      if (o.status === "cancelled") {
        cancelled++;
        cancelledValue += total;
        continue;
      }
      if (o.status === "delivered") delivered++;
      orders++;
      revenue += total;
      shipping += Number(o.shipping) || 0;

      const dow = Math.max(1, Math.min(7, Number(o.dow) || 1)) - 1;
      byWeekday[dow].revenue += total;
      byWeekday[dow].orders += 1;
      const hr = Math.max(0, Math.min(23, Number(o.hr) || 0));
      byHour[hr].revenue += total;
      byHour[hr].orders += 1;

      const st = String(o.state || "").trim() || "Unknown";
      states[st] = states[st] || { revenue: 0, orders: 0 };
      states[st].revenue += total;
      states[st].orders += 1;

      const src = o.source === "manual" ? "manual" : "website";
      sources[src].revenue += total;
      sources[src].orders += 1;

      const phone = normalizePhone(o.customer_phone);
      if (phone && !seenPhones.has(phone)) {
        seenPhones.add(phone);
        if (returningSet.has(phone)) returningCustomers++;
        else newCustomers++;
      }

      try {
        const items = JSON.parse(o.items_json || "[]");
        items.forEach((it) => {
          const q = itemQuantity(it);
          units += q;
          const sel = String(it.selectedModel || "");
          // Photo Frame lines carry "Size: 8x12", not a phone model.
          const brand = /^size:/i.test(sel) ? "Photo Frames" : sel.split(" - ")[0].trim() || "Other";
          brands[brand] = (brands[brand] || 0) + q;
        });
      } catch {
        /* ignore malformed rows */
      }
    }

    const allStates = Object.entries(states)
      .map(([state, v]) => ({ state, revenue: v.revenue, orders: v.orders }))
      .sort((a, b) => b.revenue - a.revenue);
    const byState = allStates.slice(0, 8);
    const rest = allStates.slice(8);
    if (rest.length) {
      byState.push({ state: "Others", revenue: rest.reduce((s, x) => s + x.revenue, 0), orders: rest.reduce((s, x) => s + x.orders, 0) });
    }

    const byBrand = Object.entries(brands)
      .map(([brand, qty]) => ({ brand, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    const allOrders = orders + cancelled + returned;
    res.json({
      period: periodKey,
      summary: {
        revenue,
        orders,
        units,
        shipping,
        avgOrderValue: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
        unitsPerOrder: orders ? Math.round((units / orders) * 100) / 100 : 0,
        cancelled,
        cancelledValue,
        returned,
        returnedValue,
        cancellationRate: allOrders ? Math.round((cancelled / allOrders) * 1000) / 10 : 0,
        delivered,
        deliveryRate: orders ? Math.round((delivered / orders) * 1000) / 10 : 0,
        newCustomers,
        returningCustomers,
      },
      byWeekday,
      byHour,
      byState,
      bySource: [
        { source: "Online store", revenue: sources.website.revenue, orders: sources.website.orders },
        { source: "Manual orders", revenue: sources.manual.revenue, orders: sources.manual.orders },
      ],
      byBrand,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch insights" });
  }
});

// GET /api/analytics/export-data - admin: everything needed to build the
// downloadable Sales Report and Customer Report (Excel/PDF) for a given
// period. ?period= any key from PERIOD_RANGES above (default: this_month).
// Kept as one endpoint so both exports always reflect the exact same
// period window and order set.
router.get("/export-data", requireAdmin, async (req, res) => {
  try {
    const periodKey = PERIOD_KEYS.has(req.query.period) ? req.query.period : "this_month";
    const range = periodRange(periodKey);

    // Discounts are recoverable from stored subtotal + shipping - total;
    // the schema has no separate discount column.
    const [orders] = await pool.query(
      `SELECT id, created_at, customer_name, customer_phone, customer_alt_phone, customer_email,
              shipping_address, city, state, pincode, items_json, subtotal, shipping, total,
              payment_method, status
       FROM orders WHERE ${range.where} ORDER BY created_at DESC`
    );

    const salesRows = orders.map((o) => {
      let itemsCount = 0;
      try {
        itemsCount = parseItems(o.items_json).reduce((s, it) => s + itemQuantity(it), 0);
      } catch {}
      return {
        id: o.id,
        date: o.created_at,
        customerName: o.customer_name || "",
        customerPhone: o.customer_phone || "",
        city: o.city || "",
        state: o.state || "",
        itemsCount,
        subtotal: Number(o.subtotal) || 0,
        shipping: Number(o.shipping) || 0,
        discount: orderDiscount(o),
        total: Number(o.total) || 0,
        paymentMethod: o.payment_method || "online",
        status: o.status || "pending",
      };
    });

    // Per-customer aggregation, scoped to this same period/order set only
    // (a customer who ordered in an earlier period won't show up here).
    const byPhone = Object.create(null);
    for (const o of orders) {
      if (o.status === "cancelled" || o.status === "returned") continue;
      const phone = normalizePhone(o.customer_phone);
      if (!phone) continue;
      if (!byPhone[phone]) {
        byPhone[phone] = {
          phone,
          name: o.customer_name || "",
          email: o.customer_email || "",
          city: o.city || "",
          state: o.state || "",
          orderCount: 0,
          totalSpent: 0,
          lastOrderAt: o.created_at,
        };
      }
      byPhone[phone].orderCount += 1;
      byPhone[phone].totalSpent += Number(o.total) || 0;
      if (new Date(o.created_at) > new Date(byPhone[phone].lastOrderAt)) byPhone[phone].lastOrderAt = o.created_at;
    }
    const customerRows = Object.values(byPhone).sort((a, b) => b.totalSpent - a.totalSpent);

    const validOrders = orders.filter((o) => o.status !== "cancelled" && o.status !== "returned");
    const summary = {
      periodKey,
      periodLabel: PERIOD_LABELS[periodKey] || periodKey,
      totalOrders: validOrders.length,
      cancelledOrders: orders.filter((o) => o.status === "cancelled").length,
      returnedOrders: orders.filter((o) => o.status === "returned").length,
      totalRevenue: validOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
      avgOrderValue: validOrders.length ? validOrders.reduce((s, o) => s + (Number(o.total) || 0), 0) / validOrders.length : 0,
      uniqueCustomers: customerRows.length,
      generatedAt: new Date().toISOString(),
    };

    res.json({ summary, salesRows, customerRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build export data" });
  }
});

// GET /api/analytics/top-selling - admin: all-time units-sold ranking, used to
// auto-populate the "Best Sell" home page section with real sales data
router.get("/top-selling", requireAdmin, async (req, res) => {
  try {
    const [orders] = await pool.query(`SELECT items_json FROM orders WHERE status NOT IN ('cancelled', 'returned')`);
    const productCounts = Object.create(null);
    orders.forEach((o) => {
      try {
        const items = JSON.parse(o.items_json || "[]");
        items.forEach((it) => {
          const key = it.product?.id || it.productId;
          if (!key) return;
          productCounts[key] = (productCounts[key] || 0) + itemQuantity(it);
        });
      } catch {}
    });
    const ranked = Object.entries(productCounts)
      .map(([id, qty]) => ({ id, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20);
    res.json(ranked);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch top-selling products" });
  }
});

// GET /api/analytics/top-phone-models - admin: best-selling phone models
// (the "selectedModel" a customer picked at checkout, e.g. "iPhone 15 Pro"),
// ranked by units sold over the requested time interval. Used by the
// "Best Selling Phone Models" tab under Analytics.
// ?period= today | 7d | 30d | 90d | 1y | all (default: 30d)
const PHONE_MODEL_PERIOD_WHERE = {
  today: "created_at >= CURDATE()",
  "7d": "created_at > (NOW() - INTERVAL 7 DAY)",
  "30d": "created_at > (NOW() - INTERVAL 30 DAY)",
  "90d": "created_at > (NOW() - INTERVAL 90 DAY)",
  "1y": "created_at > (NOW() - INTERVAL 1 YEAR)",
  all: "1=1",
};

router.get("/top-phone-models", requireAdmin, async (req, res) => {
  try {
    const periodKey = Object.hasOwn(PHONE_MODEL_PERIOD_WHERE, req.query.period) ? req.query.period : "30d";
    const where = PHONE_MODEL_PERIOD_WHERE[periodKey];

    const [orders] = await pool.query(
      `SELECT items_json FROM orders WHERE status NOT IN ('cancelled', 'returned') AND ${where}`
    );

    const modelStats = Object.create(null);
    orders.forEach((o) => {
      const seenModels = new Set();
      try {
        const items = JSON.parse(o.items_json || "[]");
        items.forEach((it) => {
          const model = (it.selectedModel || "").trim();
          if (!model || /^size:/i.test(model)) return;
          const qty = itemQuantity(it);
          const price = Number(it.product?.price ?? it.price ?? 0);
          if (!modelStats[model]) modelStats[model] = { model, qty: 0, revenue: 0, orders: 0 };
          modelStats[model].qty += qty;
          modelStats[model].revenue += qty * price;
          if (!seenModels.has(model)) {
            modelStats[model].orders += 1;
            seenModels.add(model);
          }
        });
      } catch {}
    });

    const ranked = Object.values(modelStats).sort((a, b) => b.qty - a.qty);
    const totalUnits = ranked.reduce((s, m) => s + m.qty, 0);

    res.json({
      periodKey,
      generatedAt: new Date().toISOString(),
      totalUnits,
      models: ranked,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch top-selling phone models" });
  }
});

// GET /api/analytics/report - admin: full Report Analysis tool
// Detailed, accurate sales/revenue/product breakdown for the last 1 year (monthly),
// used by the dedicated "Report Analysis" admin tab. All figures exclude cancelled orders.
router.get("/report", requireAdmin, async (req, res) => {
  try {
    const range = reportRange(req.query.months);
    const [monthlyRaw] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders,
              COALESCE(SUM(subtotal),0) as grossSales, COALESCE(SUM(shipping),0) as totalShipping
       FROM orders
       WHERE status NOT IN ('cancelled', 'returned') AND created_at >= ? AND created_at < ?
       GROUP BY month ORDER BY month ASC`
      , [range.historyStart, range.end]
    );
    const monthly = zeroFillMonths(monthlyRaw, range.historyStart, range.end);

    const [[yearTotals]] = await pool.query(
      `SELECT COUNT(*) as totalOrders, COALESCE(SUM(total),0) as totalRevenue,
              COALESCE(AVG(total),0) as avgOrderValue,
              COALESCE(SUM(subtotal),0) as grossSales,
              COALESCE(SUM(shipping),0) as totalShipping
       FROM orders WHERE status NOT IN ('cancelled', 'returned') AND ${range.where}`
    );

    const [[allTimeTotals]] = await pool.query(
      `SELECT COUNT(*) as totalOrders, COALESCE(SUM(total),0) as totalRevenue
       FROM orders WHERE status NOT IN ('cancelled', 'returned')`
    );

    const [statusBreakdownYear] = await pool.query(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(total),0) as revenue FROM orders
       WHERE ${range.where} GROUP BY status`
    );

    const [ordersYear] = await pool.query(
      `SELECT items_json FROM orders WHERE status NOT IN ('cancelled', 'returned') AND ${range.where}`
    );
    const [productRows] = await pool.query(
      `SELECT p.id, p.title, p.brand, c.name as collectionName, p.is_trending, p.is_best_seller
       FROM products p LEFT JOIN collections c ON c.id = p.collection_id`
    );
    const productMeta = Object.create(null);
    productRows.forEach((p) => { productMeta[p.id] = p; });

    const productStats = Object.create(null);
    const brandStats = Object.create(null);
    const collectionStats = Object.create(null);
    ordersYear.forEach((o) => {
      try {
        const items = JSON.parse(o.items_json || "[]");
        items.forEach((it) => {
          const key = it.product?.id || it.productId;
          if (!key) return;
          const qty = itemQuantity(it);
          const price = Number(it.product?.price ?? it.price ?? 0);
          const revenue = qty * price;
          const meta = productMeta[key];
          const title = meta?.title || it.product?.title || it.title || "Unknown";
          const brand = meta?.brand || "Unbranded";
          const collectionName = meta?.collectionName || "Uncategorized";

          productStats[key] = productStats[key] || { id: key, title, qty: 0, revenue: 0, isTrending: !!meta?.is_trending, isBestSeller: !!meta?.is_best_seller };
          productStats[key].qty += qty;
          productStats[key].revenue += revenue;

          brandStats[brand] = brandStats[brand] || { brand, qty: 0, revenue: 0 };
          brandStats[brand].qty += qty;
          brandStats[brand].revenue += revenue;

          collectionStats[collectionName] = collectionStats[collectionName] || { collection: collectionName, qty: 0, revenue: 0 };
          collectionStats[collectionName].qty += qty;
          collectionStats[collectionName].revenue += revenue;
        });
      } catch {}
    });

    const topProductsByQty = Object.values(productStats).sort((a, b) => b.qty - a.qty).slice(0, 20);
    const topProductsByRevenue = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    const brandBreakdown = Object.values(brandStats).sort((a, b) => b.revenue - a.revenue);
    const collectionBreakdown = Object.values(collectionStats).sort((a, b) => b.revenue - a.revenue);

    const [customerOrders] = await pool.query(
      `SELECT customer_phone, COUNT(*) as orderCount, COALESCE(SUM(total),0) as totalSpent
       FROM orders WHERE status NOT IN ('cancelled', 'returned') AND ${range.where} AND customer_phone IS NOT NULL AND customer_phone != ''
       GROUP BY customer_phone`
    );
    const [previousCustomers] = await pool.query("SELECT DISTINCT customer_phone FROM orders WHERE status NOT IN ('cancelled', 'returned') AND created_at < ? AND customer_phone IS NOT NULL AND customer_phone != ''", [range.start]);
    const previousPhones = new Set(previousCustomers.map((c) => normalizePhone(c.customer_phone)));
    const returningCustomers = customerOrders.filter((c) => previousPhones.has(normalizePhone(c.customer_phone))).length;
    const newCustomers = customerOrders.length - returningCustomers;
    const topCustomers = [...customerOrders].sort((a, b) => Number(b.totalSpent) - Number(a.totalSpent)).slice(0, 10);

    res.json({
      generatedAt: new Date().toISOString(),
      windowLabel: `Last ${range.months} Months`,
      periodMonths: range.months,
      periodStart: range.start,
      periodEnd: range.end,
      yearTotals,
      allTimeTotals,
      monthlyRevenue: monthly,
      statusBreakdownYear,
      topProductsByQty,
      topProductsByRevenue,
      brandBreakdown,
      collectionBreakdown,
      customerInsights: { newCustomers, returningCustomers, topCustomers },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// GET /api/analytics/growth - admin: data for the Growth overview tab
// (sessions by traffic channel + total store sales trend for the same
// window). Revenue-per-channel / conversion-rate isn't computed here since
// orders aren't linked to a session_id anywhere in the schema — showing a
// made-up number would be worse than not showing one, so channel cards
// report real session counts and each channel's share of total sessions
// only, same honesty rule the Settings tab already follows.
const GROWTH_WINDOW_DAYS = { "7": 7, "30": 30, "90": 90 };

router.get("/growth", requireAdmin, async (req, res) => {
  try {
    const days = Object.hasOwn(GROWTH_WINDOW_DAYS, req.query.days) ? GROWTH_WINDOW_DAYS[req.query.days] : 30;

    const [sources] = await pool.query(
      `SELECT COALESCE(traffic_source, 'Direct') as source, COUNT(*) as sessions
       FROM visitor_daily_log
       WHERE visit_date > (CURDATE() - INTERVAL ? DAY)
       GROUP BY source ORDER BY sessions DESC`,
      [days]
    );

    const [[{ totalSessions }]] = await pool.query(
      `SELECT COUNT(*) as totalSessions FROM visitor_daily_log
       WHERE visit_date > (CURDATE() - INTERVAL ? DAY)`,
      [days]
    );

    const [dailySalesRows] = await pool.query(
      `SELECT DATE(created_at) as date, COALESCE(SUM(total),0) as revenue
       FROM orders WHERE status NOT IN ('cancelled', 'returned') AND created_at >= (CURDATE() - INTERVAL ? DAY)
       GROUP BY date ORDER BY date ASC`,
      [days - 1]
    );
    const end = addDays(storeDate(), 1);
    const dailySales = zeroFillDates(dailySalesRows.map((r) => ({ day: r.date, revenue: r.revenue })), addDays(end, -days), end)
      .map((r) => ({ date: r.day, revenue: r.revenue }));

    const [[salesTotals]] = await pool.query(
      `SELECT COUNT(*) as totalOrders, COALESCE(SUM(total),0) as totalRevenue
       FROM orders WHERE status NOT IN ('cancelled', 'returned') AND created_at >= (CURDATE() - INTERVAL ? DAY)`,
      [days - 1]
    );

    // Traffic-type grouping mirrors Shopify's Paid / Direct / Organic / Unknown buckets
    const classify = (s) => {
      if (s === "Direct") return "Direct";
      if (["Instagram", "Facebook", "WhatsApp", "Pinterest", "YouTube", "Twitter / X", "LinkedIn"].includes(s)) return "Social";
      if (["Google Search", "Bing Search", "Yahoo Search", "DuckDuckGo Search"].includes(s)) return "Organic";
      return "Unknown";
    };
    const byType = {};
    sources.forEach((s) => {
      const type = classify(s.source);
      byType[type] = (byType[type] || 0) + Number(s.sessions);
    });

    res.json({
      generatedAt: new Date().toISOString(),
      windowDays: days,
      totalSessions,
      sessionsByType: Object.entries(byType).map(([type, sessions]) => ({ type, sessions })),
      channels: sources.map((s) => ({
        source: s.source,
        sessions: Number(s.sessions),
        sharePct: totalSessions > 0 ? Math.round((Number(s.sessions) / totalSessions) * 1000) / 10 : 0,
      })),
      dailySales,
      salesTotals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch growth data" });
  }
});

// GET /api/analytics/feed.xml - Google Shopping / Meta catalog feed (feature 15)
router.get("/feed.xml", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products WHERE stock_status != 'out_of_stock'");
    const siteUrl = (process.env.CLIENT_URL || "https://3dcasemakers.com").split(",")[0].trim().replace(/\/$/, "");
    const apiUrl = (process.env.BACKEND_PUBLIC_URL || "https://api.3dcasemakers.com").replace(/\/$/, "");
    const xmlEscape = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    const items = rows
      .map((p) => {
        let images = [];
        try { const parsed = JSON.parse(p.images || "[]"); if (Array.isArray(parsed)) images = parsed; } catch {}
        const image = typeof images[0] === "string" ? (/^https?:\/\//i.test(images[0]) ? images[0] : `${apiUrl}${images[0]}`) : "";
        return `
    <item>
      <g:id>${xmlEscape(p.id)}</g:id>
      <title>${xmlEscape(p.title)}</title>
      <description>${xmlEscape((p.description || "").slice(0, 5000))}</description>
      <link>${xmlEscape(`${siteUrl}/product/${encodeURIComponent(p.id)}`)}</link>
      <g:image_link>${xmlEscape(image)}</g:image_link>
      <g:availability>${p.stock_status === "out_of_stock" ? "out of stock" : "in stock"}</g:availability>
      <g:price>${Number(p.price).toFixed(2)} INR</g:price>
      <g:brand>3DCaseMakers</g:brand>
      <g:condition>new</g:condition>
    </item>`;
      })
      .join("");
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>3DCaseMakers Product Feed</title>
    <link>${xmlEscape(siteUrl)}</link>
    <description>3DCaseMakers Google Shopping / Meta catalog feed</description>${items}
  </channel>
</rss>`;
    res.set("Content-Type", "application/xml");
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate feed" });
  }
});

module.exports = router;
