// Order-confirmation email — sent server-side, right after an order is
// successfully saved to the database (see routes/orders.js). Never triggered
// from the frontend, so a customer refreshing the order-confirmed page can
// never cause a duplicate send: it fires exactly once per DB insert.
//
// Gmail SMTP via Nodemailer. Credentials come ONLY from environment
// variables (EMAIL_USER / EMAIL_PASS in .env) — never hardcoded, never sent
// to or read from the frontend.
const nodemailer = require("nodemailer");
const pool = require("../config/db");

// Used to build absolute links/images in emails (storefront pages, product
// thumbnails). Falls back to the production domains if not set in .env.
const FRONTEND_URL = (process.env.CLIENT_URL || "https://3dcasemakers.in").split(",")[0].trim();
const BACKEND_URL = process.env.BACKEND_PUBLIC_URL || "https://api.3dcasemakers.in";

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    // Not configured — caller checks isEmailConfigured() first, so this is
    // just a safety net.
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cachedTransporter;
}

function isEmailConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

// Records one successful send in email_send_log (see Admin -> Gmail Manager).
// Fire-and-forget by design — a logging hiccup must never affect the actual
// email send/order flow, so failures are swallowed after a console warning.
async function logEmailSend(mailbox, category) {
  try {
    await pool.query(`INSERT INTO email_send_log (mailbox, category) VALUES (?, ?)`, [mailbox, category]);
  } catch (err) {
    console.warn(`[email] Failed to log send (${mailbox}/${category}):`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Owner "new order" notification — a SEPARATE Gmail account/transporter from
// the customer-facing one above. Sends FROM the orders mailbox
// (ORDERS_EMAIL_USER / ORDERS_EMAIL_PASS in .env) TO the owner's inbox
// (OWNER_EMAIL in .env) every time a new order is placed, with the order's
// details plus a running "today" count/report. Never throws — logs and
// resolves so a failed notification never blocks or affects order placement.
let cachedOwnerTransporter = null;

function isOwnerNotifyConfigured() {
  return !!(process.env.ORDERS_EMAIL_USER && process.env.ORDERS_EMAIL_PASS && process.env.OWNER_EMAIL);
}

function getOwnerTransporter() {
  if (cachedOwnerTransporter) return cachedOwnerTransporter;

  const user = process.env.ORDERS_EMAIL_USER;
  const pass = process.env.ORDERS_EMAIL_PASS;
  if (!user || !pass) return null;

  cachedOwnerTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cachedOwnerTransporter;
}

// Counts today's orders and today's total order value (Asia/Kolkata "today",
// same as the timestamps shown elsewhere) directly from the orders table.
async function getTodayReport() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS orderCount, COALESCE(SUM(total), 0) AS totalAmount
     FROM orders
     WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))`
  );
  return {
    orderCount: rows[0]?.orderCount || 0,
    totalAmount: Number(rows[0]?.totalAmount || 0),
  };
}

// "1st", "2nd", "3rd", "4th", "11th", "21st" ... — used to label each order
// notification subject with its position in today's order count (1st order
// of today, 2nd order of today, etc).
function ordinal(n) {
  const num = Number(n) || 0;
  const rem100 = num % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

function buildOwnerNewOrderHtml({ brandName, order, report }) {
  const { orderId, customerName, customerPhone, totalAmount, orderDate, items, subtotal, shipping, shippingAddress, city, state, pincode } = order;
  const label = ordinal(report.orderCount); // e.g. "1st", "2nd", "3rd"
  const itemsRows = buildItemsRows(items);
  const courier = getCourierInfo(state);
  const addressLine = [shippingAddress, city, state, pincode].filter(Boolean).map(escapeHtml).join(", ");
  const shippingValue = shipping === 0 ? "Free" : shipping !== undefined ? `₹${shipping}` : "₹0.00";
  const subtotalValue = subtotal !== undefined ? subtotal : totalAmount;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(label)} Order of Today — ${escapeHtml(orderId)}</title>
  </head>
  <body style="margin:0;padding:0;">
  <div style="background:#f4f4f5;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div style="background:#18181b;padding:24px 24px;text-align:center;">
        <p style="margin:0 0 4px;color:#a1a1aa;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(brandName)} &middot; New Order</p>
        <h1 style="margin:0;color:#ffffff;font-size:19px;font-weight:800;">🛎️ ${escapeHtml(label)} Order of Today</h1>
      </div>

      <div style="padding:24px 24px 8px;">
        <p style="margin:0 0 4px;color:#18181b;font-size:15px;line-height:1.5;">
          <strong>${escapeHtml(customerName || "A customer")}</strong> placed order <strong>#${escapeHtml(String(orderId).replace(/^\D+/, ""))}</strong> on ${escapeHtml(formatDate(orderDate))}.
        </p>

        <a href="${FRONTEND_URL}/admin" style="display:inline-block;margin:14px 0 4px;background:#008060;color:#fff;text-decoration:none;font-weight:700;padding:11px 26px;border-radius:8px;font-size:13.5px;">View order</a>

        <hr style="border:none;border-top:1px solid #eee;margin:22px 0 18px;" />

        <h3 style="margin:0 0 10px;color:#18181b;font-size:13px;text-transform:uppercase;letter-spacing:0.4px;">Order Summary</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
          <tbody>${itemsRows}</tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:10px 0 4px;">
          <tr><td style="padding:5px 8px;font-size:13px;color:#71717a;">Subtotal</td><td style="padding:5px 8px;font-size:13px;color:#18181b;text-align:right;">₹${subtotalValue}</td></tr>
          <tr>
            <td style="padding:5px 8px;font-size:13px;color:#71717a;vertical-align:top;">Shipping</td>
            <td style="padding:5px 8px;font-size:13px;color:#18181b;text-align:right;">
              ${shippingValue}
              <div style="font-size:11px;color:#a1a1aa;margin-top:2px;">(${escapeHtml(courier.name)} — 1–2 days inside Tamil Nadu, no home-delivery guarantee outside)</div>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 8px;font-size:15px;font-weight:800;color:#18181b;border-top:2px solid #e4e4e7;">Total</td>
            <td style="padding:10px 8px;font-size:15px;font-weight:800;color:#18181b;text-align:right;border-top:2px solid #e4e4e7;">₹${totalAmount}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:18px 0 4px;">
          <tr>
            <td style="padding:6px 0;font-size:12px;color:#71717a;width:50%;vertical-align:top;">
              <div style="font-weight:700;color:#18181b;font-size:12.5px;margin-bottom:2px;">Payment processing method</div>
              Cash on Delivery (COD)
            </td>
            <td style="padding:6px 0;font-size:12px;color:#71717a;width:50%;vertical-align:top;">
              <div style="font-weight:700;color:#18181b;font-size:12.5px;margin-bottom:2px;">Delivery method</div>
              <span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:800;margin-bottom:3px;${
                courier.name === "ST Courier"
                  ? "background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;"
                  : "background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;"
              }">${escapeHtml(courier.name)}</span><br/>
              1–2 days inside Tamil Nadu, no guarantee on home delivery
            </td>
          </tr>
        </table>

        <h3 style="margin:18px 0 8px;color:#18181b;font-size:13px;text-transform:uppercase;letter-spacing:0.4px;">Shipping Address</h3>
        <div style="background:#fafafa;border:1px solid #f0f0f1;border-radius:8px;padding:12px 14px;font-size:13px;color:#3f3f46;line-height:1.7;margin-bottom:6px;">
          ${customerName ? `<div style="font-weight:700;color:#18181b;">${escapeHtml(customerName)}</div>` : ""}
          ${addressLine || "-"}
          ${customerPhone ? `<div style="margin-top:4px;"><a href="tel:${escapeHtml(customerPhone)}" style="color:#2c6ecb;text-decoration:none;font-weight:600;">${escapeHtml(customerPhone)}</a></div>` : ""}
        </div>

        <div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:10px;padding:14px 16px;margin:22px 0 4px;">
          <h4 style="margin:0 0 8px;color:#166534;font-size:11.5px;text-transform:uppercase;letter-spacing:0.4px;">📊 Today's Report</h4>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:2px 0;font-size:12.5px;color:#3f6212;">Orders today (incl. this one)</td>
              <td style="padding:2px 0;font-size:14px;font-weight:800;color:#18181b;text-align:right;">${report.orderCount}</td>
            </tr>
            <tr>
              <td style="padding:2px 0;font-size:12.5px;color:#3f6212;">Total order value today</td>
              <td style="padding:2px 0;font-size:14px;font-weight:800;color:#18181b;text-align:right;">₹${report.totalAmount}</td>
            </tr>
          </table>
        </div>
      </div>

      <div style="padding:16px 24px 24px;border-top:1px solid #eee;text-align:center;">
        <p style="margin:0;color:#a1a1aa;font-size:11px;">Automated notification from ${escapeHtml(brandName)} Orders — do not reply to this email.</p>
      </div>
    </div>
  </div>
  </body>
  </html>`;
}

// order: { orderId, customerName, customerPhone, totalAmount, orderDate }
async function sendOwnerNewOrderNotification(order) {
  try {
    if (!isOwnerNotifyConfigured()) {
      console.warn("[email] ORDERS_EMAIL_USER/ORDERS_EMAIL_PASS/OWNER_EMAIL not set in .env — owner order notifications are disabled.");
      return { sent: false, reason: "not_configured" };
    }

    const transporter = getOwnerTransporter();
    const brand = await getBrandInfo();
    const report = await getTodayReport();
    const html = buildOwnerNewOrderHtml({ brandName: brand.brandName, order, report });
    const label = ordinal(report.orderCount); // "1st", "2nd", "3rd" ...

    await transporter.sendMail({
      from: `"${brand.brandName} Orders" <${process.env.ORDERS_EMAIL_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: `${label} Order of Today — ${order.orderId} | ${brand.brandName}`,
      html,
      encoding: "utf-8",
    });

    console.log(`[email] Owner notified of ${label} order of today: ${order.orderId} (today's count: ${report.orderCount})`);
    await logEmailSend(process.env.ORDERS_EMAIL_USER, "owner_new_order");
    return { sent: true };
  } catch (err) {
    console.error(`[email] Failed to send owner notification for ${order?.orderId || "unknown order"}:`, err.message);
    return { sent: false, reason: "send_failed" };
  }
}

// Pulls brand name + support contact details from the same store_settings
// row the admin panel edits (Admin -> Content -> Branding), so the email
// template stays in sync with the storefront without a second place to
// configure it. Falls back to sensible defaults if settings are empty.
async function getBrandInfo() {
  try {
    const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
    const s = rows.length ? JSON.parse(rows[0].settings_json || "{}") : {};
    return {
      brandName: s.logoText || "3DCaseMakers",
      supportEmail: s.contactEmail || process.env.EMAIL_USER || "",
      supportPhone: s.contactPhone || "",
      whatsappNumber: (s.whatsappNumber || "").replace(/[^\d]/g, ""),
    };
  } catch {
    return { brandName: "3DCaseMakers", supportEmail: process.env.EMAIL_USER || "", supportPhone: "", whatsappNumber: "" };
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

// Turns a stored image path (relative, e.g. "/uploads/xyz.jpg") into an
// absolute URL so it actually loads inside an email client.
function absoluteImageUrl(path) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${BACKEND_URL}${path}`;
}

// Builds the <tr> rows for the product table. Accepts either the raw
// CartItem[] shape stored in orders.items_json (product.title, quantity,
// selectedModel, customName, etc) or a simpler { name, quantity, price }
// shape, so this works whether it's called from the order-placement flow or
// tested manually with a plain payload.
function buildItemsRows(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<tr><td colspan="3" style="padding:14px;color:#71717a;">No item details available</td></tr>`;
  }
  return items
    .map((i) => {
      const name = escapeHtml(i.product?.title || i.name || i.title || "Product");
      const model = i.selectedModel ? ` <span style="color:#71717a;font-weight:500;">(${escapeHtml(i.selectedModel)})</span>` : "";
      const qty = i.quantity ?? i.qty ?? 1;
      const price = i.product?.price ?? i.price ?? "";
      const img = absoluteImageUrl(i.product?.images?.[0]);
      const extras = [];
      if (i.customName) extras.push(`Name: "${escapeHtml(i.customName)}"`);
      if (i.customName2) extras.push(`Name 2: "${escapeHtml(i.customName2)}"`);
      if (i.customName3) extras.push(`Name 3: "${escapeHtml(i.customName3)}"`);
      if (i.customVariant) extras.push(escapeHtml(i.customVariant));
      const extrasHtml = extras.length
        ? `<div style="font-size:12px;color:#8a5a00;background:#fffaf0;border:1px solid #fde9c8;display:inline-block;padding:2px 8px;border-radius:6px;margin-top:6px;">${extras.join(" &middot; ")}</div>`
        : "";
      const thumb = img
        ? `<img src="${escapeHtml(img)}" width="56" height="56" alt="${name}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;border:1px solid #e4e4e7;display:block;" />`
        : `<div style="width:56px;height:56px;border-radius:10px;background:#f4f4f5;border:1px solid #e4e4e7;"></div>`;
      return `
        <tr>
          <td style="padding:14px 10px;border-bottom:1px solid #f0f0f1;" width="56">${thumb}</td>
          <td style="padding:14px 10px;border-bottom:1px solid #f0f0f1;">
            <div style="font-weight:600;color:#18181b;font-size:13.5px;line-height:1.4;">${name}${model}</div>
            <div style="font-size:12px;color:#a1a1aa;margin-top:2px;">Qty: ${qty}</div>
            ${extrasHtml}
          </td>
          <td style="padding:14px 10px;border-bottom:1px solid #f0f0f1;text-align:right;color:#18181b;font-weight:700;font-size:13.5px;white-space:nowrap;">${price !== "" ? `₹${price}` : "-"}</td>
        </tr>`;
    })
    .join("");
}

// Ordered pipeline used to render the visual progress stepper in status
// update emails. Cancelled/returned are terminal states shown separately.
const STATUS_STEPS = ["pending", "processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered"];
const STATUS_STEP_LABELS = { pending: "Order Placed", processing: "Processing", ready_to_ship: "Ready to Ship", shipped: "Shipped", out_for_delivery: "Out for Delivery", delivered: "Delivered" };

// Renders a simple horizontal progress tracker (● — ● — ● ...) as an HTML
// table, since flexbox/grid isn't reliable across email clients. Steps up to
// and including the current status are highlighted in brand black; the rest
// are grey. Skipped entirely for cancelled/returned orders.
function buildStatusStepper(status) {
  const idx = STATUS_STEPS.indexOf(status);
  if (idx === -1) return "";
  const cells = STATUS_STEPS.map((s, i) => {
    const done = i <= idx;
    const dot = `<div style="width:14px;height:14px;border-radius:50%;margin:0 auto;background:${done ? "#18181b" : "#e4e4e7"};border:2px solid ${done ? "#18181b" : "#e4e4e7"};"></div>`;
    const line = i < STATUS_STEPS.length - 1
      ? `<div style="height:2px;background:${i < idx ? "#18181b" : "#e4e4e7"};margin-top:6px;"></div>`
      : "";
    return `
      <td style="text-align:center;vertical-align:top;padding:0;">
        ${dot}
        <div style="font-size:9.5px;font-weight:${done ? 700 : 500};color:${done ? "#18181b" : "#a1a1aa"};margin-top:6px;line-height:1.3;">${STATUS_STEP_LABELS[s]}</div>
      </td>${line ? `<td style="width:100%;padding:0 2px;"><div style="position:relative;top:6px;height:2px;background:${i < idx ? "#18181b" : "#e4e4e7"};"></div></td>` : ""}`;
  }).join("");
  return `
    <table style="width:100%;border-collapse:collapse;margin:20px 0 22px;" role="presentation">
      <tr>${cells}</tr>
    </table>`;
}

// Shared header used at the top of every customer-facing email — brand name
// plus a short, professional tagline strip.
function buildEmailHeader(brandName) {
  return `
    <div style="background:#18181b;padding:26px 24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:21px;letter-spacing:0.5px;font-weight:800;">${escapeHtml(brandName)}</h1>
      <p style="margin:4px 0 0;color:#a1a1aa;font-size:11.5px;letter-spacing:1.5px;text-transform:uppercase;">Custom Phone Cases, Crafted For You</p>
    </div>`;
}

// Shared footer used at the bottom of every customer-facing email — support
// contact, WhatsApp CTA, quick storefront links, and legal fine print.
function buildEmailFooter({ contactLine, whatsappBtn, footnote }) {
  return `
    <div style="padding:20px 24px 8px;border-top:1px solid #eee;text-align:center;">
      <p style="margin:0 0 4px;color:#18181b;font-size:13px;font-weight:700;">Need help with your order?</p>
      ${contactLine ? `<p style="margin:0;color:#71717a;font-size:12.5px;">${contactLine}</p>` : ""}
      ${whatsappBtn}
    </div>
    <div style="padding:16px 24px 24px;text-align:center;">
      <table style="margin:0 auto 14px;border-collapse:collapse;" role="presentation">
        <tr>
          <td style="padding:0 8px;"><a href="${FRONTEND_URL}/track-order" style="color:#52525b;font-size:11.5px;text-decoration:none;font-weight:600;">Track Order</a></td>
          <td style="color:#e4e4e7;">|</td>
          <td style="padding:0 8px;"><a href="${FRONTEND_URL}/policy/returns" style="color:#52525b;font-size:11.5px;text-decoration:none;font-weight:600;">Returns Policy</a></td>
          <td style="color:#e4e4e7;">|</td>
          <td style="padding:0 8px;"><a href="${FRONTEND_URL}/contact" style="color:#52525b;font-size:11.5px;text-decoration:none;font-weight:600;">Contact Us</a></td>
        </tr>
      </table>
      <p style="margin:0;color:#a1a1aa;font-size:11px;">${footnote || "This is an automated email — please don't reply directly to it."}</p>
      <p style="margin:6px 0 0;color:#c4c4c8;font-size:10.5px;">&copy; ${new Date().getFullYear()} 3DCaseMakers. All rights reserved.</p>
    </div>`;
}

function buildOrderConfirmationHtml({ brandName, supportEmail, supportPhone, whatsappNumber, order }) {
  const { orderId, customerName, items, quantity, totalAmount, orderDate, shipping, subtotal, shippingAddress, city, state, pincode } = order;
  const itemsRows = buildItemsRows(items);
  const contactLine = [
    supportEmail ? `Email: ${escapeHtml(supportEmail)}` : "",
    supportPhone ? `Phone: ${escapeHtml(supportPhone)}` : "",
  ].filter(Boolean).join(" &nbsp;|&nbsp; ");
  const whatsappBtn = whatsappNumber
    ? `<a href="https://wa.me/${whatsappNumber}" style="display:inline-block;margin-top:14px;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:10px 22px;border-radius:8px;font-size:13.5px;">💬 Chat with us on WhatsApp</a>`
    : "";
  const addressLine = [shippingAddress, city, state, pincode].filter(Boolean).map(escapeHtml).join(", ");
  const shippingBlock = addressLine
    ? `
        <h3 style="margin:22px 0 8px;color:#18181b;font-size:13px;text-transform:uppercase;letter-spacing:0.4px;">Shipping To</h3>
        <div style="background:#fafafa;border:1px solid #f0f0f1;border-radius:8px;padding:12px 14px;font-size:13px;color:#3f3f46;line-height:1.6;">
          ${customerName ? `<div style="font-weight:700;color:#18181b;margin-bottom:2px;">${escapeHtml(customerName)}</div>` : ""}
          ${addressLine}
        </div>`
    : "";

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Order Confirmed — ${escapeHtml(orderId)}</title>
  </head>
  <body style="margin:0;padding:0;">
  <div style="background:#f4f4f5;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      ${buildEmailHeader(brandName)}

      <div style="background:#f0fdf4;border-bottom:1px solid #dcfce7;padding:12px 24px;text-align:center;">
        <span style="color:#15803d;font-size:12.5px;font-weight:700;">✓ ORDER CONFIRMED</span>
      </div>

      <div style="padding:28px 24px 8px;">
        <h2 style="margin:0 0 6px;color:#18181b;font-size:19px;">Thank you${customerName ? `, ${escapeHtml(customerName)}` : ""}! 🎉</h2>
        <p style="margin:0 0 20px;color:#52525b;font-size:14px;line-height:1.6;">
          We've received your order and it's being carefully prepared by our team. Here's a summary for your records.
        </p>

        <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:10px;overflow:hidden;margin-bottom:22px;">
          <tr>
            <td style="padding:12px 14px;font-size:13px;color:#71717a;">Order ID</td>
            <td style="padding:12px 14px;font-size:13px;font-weight:800;color:#18181b;text-align:right;">${escapeHtml(orderId)}</td>
          </tr>
          <tr>
            <td style="padding:12px 14px;font-size:13px;color:#71717a;border-top:1px solid #f0f0f1;">Order Date</td>
            <td style="padding:12px 14px;font-size:13px;font-weight:600;color:#18181b;text-align:right;border-top:1px solid #f0f0f1;">${escapeHtml(formatDate(orderDate))}</td>
          </tr>
          <tr>
            <td style="padding:12px 14px;font-size:13px;color:#71717a;border-top:1px solid #f0f0f1;">Payment Method</td>
            <td style="padding:12px 14px;font-size:13px;font-weight:600;color:#18181b;text-align:right;border-top:1px solid #f0f0f1;">Cash on Delivery</td>
          </tr>
        </table>

        <h3 style="margin:0 0 8px;color:#18181b;font-size:13px;text-transform:uppercase;letter-spacing:0.4px;">Order Summary (${quantity} item${quantity === 1 ? "" : "s"})</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
          <tbody>${itemsRows}</tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:12px 0 4px;">
          ${subtotal !== undefined ? `<tr><td style="padding:5px 8px;font-size:13px;color:#71717a;">Subtotal</td><td style="padding:5px 8px;font-size:13px;color:#18181b;text-align:right;">₹${subtotal}</td></tr>` : ""}
          ${shipping !== undefined ? `<tr><td style="padding:5px 8px;font-size:13px;color:#71717a;">Shipping</td><td style="padding:5px 8px;font-size:13px;color:#18181b;text-align:right;">${shipping === 0 ? "Free" : `₹${shipping}`}</td></tr>` : ""}
          <tr>
            <td style="padding:10px 8px;font-size:16px;font-weight:800;color:#18181b;border-top:2px solid #e4e4e7;">Total Amount</td>
            <td style="padding:10px 8px;font-size:16px;font-weight:800;color:#18181b;text-align:right;border-top:2px solid #e4e4e7;">₹${totalAmount}</td>
          </tr>
        </table>

        ${shippingBlock}

        <div style="margin:22px 0 4px;background:#fafafa;border:1px dashed #d4d4d8;border-radius:10px;padding:14px;text-align:center;">
          <p style="margin:0;color:#52525b;font-size:12.5px;line-height:1.6;">
            📦 We'll email you again the moment your order ships, with your tracking ID and courier details.
          </p>
        </div>
      </div>

      ${buildEmailFooter({ contactLine, whatsappBtn, footnote: "This is an automated confirmation email — please don't reply directly to it." })}
    </div>
    <p style="max-width:580px;margin:14px auto 0;text-align:center;color:#b0b0b5;font-size:10.5px;">${escapeHtml(brandName)} &middot; ${FRONTEND_URL.replace(/^https?:\/\//, "")}</p>
  </div>
  </body>
  </html>`;
}

// order: { orderId, customerName, customerEmail, items, quantity, totalAmount,
//          orderDate, shipping, subtotal }
// Never throws — logs and resolves so a failed email never blocks or
// rolls back an already-placed order.
async function sendOrderConfirmationEmail(order) {
  try {
    if (!order?.customerEmail) {
      console.warn(`[email] Skipped order confirmation for ${order?.orderId || "unknown order"} — no customer email on file.`);
      return { sent: false, reason: "no_email" };
    }
    if (!isEmailConfigured()) {
      console.warn("[email] EMAIL_USER/EMAIL_PASS not set in .env — order confirmation emails are disabled.");
      return { sent: false, reason: "not_configured" };
    }

    const transporter = getTransporter();
    const brand = await getBrandInfo();
    const html = buildOrderConfirmationHtml({ ...brand, order });

    await transporter.sendMail({
      from: `"${brand.brandName}" <${process.env.EMAIL_USER}>`,
      to: order.customerEmail,
      subject: `Order Confirmed — ${order.orderId} | ${brand.brandName}`,
      html,
      encoding: "utf-8",
    });

    console.log(`[email] Order confirmation sent for ${order.orderId} to ${order.customerEmail}`);
    await logEmailSend(process.env.EMAIL_USER, "order_confirmation");
    return { sent: true };
  } catch (err) {
    // Log securely on the backend only — never surface SMTP/credential
    // details to the client, and never let this reject the order flow.
    console.error(`[email] Failed to send order confirmation for ${order?.orderId || "unknown order"}:`, err.message);
    return { sent: false, reason: "send_failed" };
  }
}

// Human-friendly copy for each order status. Keys match the STATUSES enum
// used in the admin dashboard (frontend/src/pages/admin/AdminDashboard.tsx).
const STATUS_COPY = {
  pending: {
    subject: "Order Received",
    heading: "Your order has been received",
    body: "We've received your order and it'll move into processing shortly.",
  },
  processing: {
    subject: "Order Processing",
    heading: "Your order is being processed",
    body: "Good news — we've started processing your order. We'll let you know as soon as it's ready to ship.",
  },
  ready_to_ship: {
    subject: "Order Ready to Ship",
    heading: "Your order is ready to ship",
    body: "Your order has been packed and handed to our courier partner. You can track your shipment using the tracking ID below.",
  },
  shipped: {
    subject: "Order Shipped",
    heading: "Your order is on its way",
    body: "Your order has been shipped and is on its way to you.",
  },
  out_for_delivery: {
    subject: "Out for Delivery",
    heading: "Your order is out for delivery",
    body: "Your order is out for delivery and should reach you today.",
  },
  delivered: {
    subject: "Order Delivered",
    heading: "Your order has been delivered",
    body: "Your order has been delivered. We hope you love it! 🎉",
  },
  cancelled: {
    subject: "Order Cancelled",
    heading: "Your order has been cancelled",
    body: "Your order has been cancelled. If this wasn't expected, please reach out to us.",
  },
  returned: {
    subject: "Order Returned",
    heading: "Your order has been marked as returned",
    body: "Your order has been marked as returned. Please reach out to us if you have any questions.",
  },
};

// Same courier-by-destination logic used on the storefront's own Track Order
// page and in the admin's WhatsApp templates: Tamil Nadu + Pondicherry ship
// via ST Courier, every other state via India Post. Keeping one function
// here (and mirroring it in the frontend) keeps the tracking link customers
// get by email, WhatsApp, and the Track Order page all consistent.
function getCourierInfo(state) {
  const stateLower = (state || "").trim().toLowerCase();
  const isTNorPondy = stateLower.includes("tamil") || stateLower.includes("pondicherry") || stateLower.includes("puducherry");
  return isTNorPondy
    ? { name: "ST Courier", url: "https://stcourier.com/track/shipment" }
    : { name: "India Post", url: "https://www.indiapost.gov.in/" };
}

function buildOrderStatusUpdateHtml({ brandName, supportEmail, supportPhone, whatsappNumber, order, status, trackingId }) {
  const { orderId, customerName, state } = order;
  const copy = STATUS_COPY[status] || {
    subject: "Order Update",
    heading: "Your order status has been updated",
    body: `Your order status is now: ${status}.`,
  };
  const isTerminalNegative = status === "cancelled" || status === "returned";
  const contactLine = [
    supportEmail ? `Email: ${escapeHtml(supportEmail)}` : "",
    supportPhone ? `Phone: ${escapeHtml(supportPhone)}` : "",
  ].filter(Boolean).join(" &nbsp;|&nbsp; ");
  const whatsappBtn = whatsappNumber
    ? `<a href="https://wa.me/${whatsappNumber}" style="display:inline-block;margin-top:14px;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:10px 22px;border-radius:8px;font-size:13.5px;">💬 Chat with us on WhatsApp</a>`
    : "";

  // Only show tracking/courier info once a tracking ID actually exists
  // (ready_to_ship onwards) — no point pointing someone at a tracking page
  // before then. Courier badge colour mirrors the admin Orders page: RED for
  // ST Courier (Tamil Nadu / Pondicherry), BLUE for India Post (elsewhere).
  const courier = trackingId ? getCourierInfo(state) : null;
  const courierBadge = courier
    ? `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:800;${
        courier.name === "ST Courier"
          ? "background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;"
          : "background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;"
      }">${escapeHtml(courier.name)}</span>`
    : "";
  const trackingBox = trackingId
    ? `
        <div style="background:#fafafa;border:1px solid #f0f0f1;border-radius:10px;padding:16px;margin:20px 0 4px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:0.4px;">Tracking ID</span>
            ${courierBadge}
          </div>
          <div style="font-size:18px;font-weight:800;color:#18181b;letter-spacing:0.4px;margin-top:6px;">${escapeHtml(trackingId)}</div>
          ${courier ? `<a href="${escapeHtml(courier.url)}" style="display:inline-block;margin-top:10px;color:#18181b;font-size:12.5px;font-weight:700;text-decoration:underline;">Track your shipment with ${escapeHtml(courier.name)} →</a>` : ""}
        </div>`
    : "";

  const stepper = !isTerminalNegative ? buildStatusStepper(status) : "";
  const statusBanner = isTerminalNegative
    ? `<div style="background:${status === "cancelled" ? "#fef2f2" : "#fffbeb"};border-bottom:1px solid ${status === "cancelled" ? "#fecaca" : "#fde68a"};padding:12px 24px;text-align:center;">
        <span style="color:${status === "cancelled" ? "#b91c1c" : "#92400e"};font-size:12.5px;font-weight:700;">${status === "cancelled" ? "✕ ORDER CANCELLED" : "↩ ORDER RETURNED"}</span>
      </div>`
    : "";

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(copy.subject)} — ${escapeHtml(orderId)}</title>
  </head>
  <body style="margin:0;padding:0;">
  <div style="background:#f4f4f5;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      ${buildEmailHeader(brandName)}
      ${statusBanner}

      <div style="padding:28px 24px 8px;">
        <h2 style="margin:0 0 6px;color:#18181b;font-size:19px;">${escapeHtml(copy.heading)}${customerName ? `, ${escapeHtml(customerName)}` : ""}</h2>
        <p style="margin:0 0 4px;color:#52525b;font-size:14px;line-height:1.6;">${escapeHtml(copy.body)}</p>

        ${stepper}

        <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:10px;overflow:hidden;margin:6px 0;">
          <tr>
            <td style="padding:12px 14px;font-size:13px;color:#71717a;">Order ID</td>
            <td style="padding:12px 14px;font-size:13px;font-weight:800;color:#18181b;text-align:right;">${escapeHtml(orderId)}</td>
          </tr>
          <tr>
            <td style="padding:12px 14px;font-size:13px;color:#71717a;border-top:1px solid #f0f0f1;">Current Status</td>
            <td style="padding:12px 14px;font-size:13px;font-weight:700;color:#18181b;text-align:right;border-top:1px solid #f0f0f1;text-transform:capitalize;">${escapeHtml(status.replace(/_/g, " "))}</td>
          </tr>
        </table>

        ${trackingBox}
      </div>

      ${buildEmailFooter({ contactLine, whatsappBtn, footnote: "This is an automated order update — please don't reply directly to it." })}
    </div>
    <p style="max-width:580px;margin:14px auto 0;text-align:center;color:#b0b0b5;font-size:10.5px;">${escapeHtml(brandName)} &middot; ${FRONTEND_URL.replace(/^https?:\/\//, "")}</p>
  </div>
  </body>
  </html>`;
}

// order: { orderId, customerName, customerEmail }
// Never throws — logs and resolves so a failed email never blocks or
// rolls back an admin's status update.
async function sendOrderStatusUpdateEmail(order, status, trackingId) {
  try {
    if (!order?.customerEmail) {
      console.warn(`[email] Skipped status update for ${order?.orderId || "unknown order"} — no customer email on file.`);
      return { sent: false, reason: "no_email" };
    }
    if (!isEmailConfigured()) {
      console.warn("[email] EMAIL_USER/EMAIL_PASS not set in .env — order status emails are disabled.");
      return { sent: false, reason: "not_configured" };
    }

    const transporter = getTransporter();
    const brand = await getBrandInfo();
    const html = buildOrderStatusUpdateHtml({ ...brand, order, status, trackingId });
    const copy = STATUS_COPY[status];
    const subject = `${copy ? copy.subject : "Order Update"} — ${order.orderId} | ${brand.brandName}`;

    await transporter.sendMail({
      from: `"${brand.brandName}" <${process.env.EMAIL_USER}>`,
      to: order.customerEmail,
      subject,
      html,
      encoding: "utf-8",
    });

    console.log(`[email] Status update (${status}) sent for ${order.orderId} to ${order.customerEmail}`);
    await logEmailSend(process.env.EMAIL_USER, "status_update");
    return { sent: true };
  } catch (err) {
    console.error(`[email] Failed to send status update for ${order?.orderId || "unknown order"}:`, err.message);
    return { sent: false, reason: "send_failed" };
  }
}

// ---------------------------------------------------------------------------
// End-of-day owner report — sent once every day (see
// services/dailyReportScheduler.js, fires at 11:59 PM Asia/Kolkata). Same
// orders@ -> owner mailbox as the per-order notification above. Covers the
// full day: visitor count, total purchase amount and total order count.
function buildDailyReportHtml({ brandName, dateLabel, stats }) {
  const { visitors, orderCount, totalAmount } = stats;
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Daily Report — ${escapeHtml(dateLabel)}</title>
  </head>
  <body style="margin:0;padding:0;">
  <div style="background:#f4f4f5;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <div style="background:#18181b;padding:22px 24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:20px;letter-spacing:0.5px;">📊 Daily Report</h1>
        <p style="margin:6px 0 0;color:#a1a1aa;font-size:13px;">${escapeHtml(dateLabel)}</p>
      </div>

      <div style="padding:28px 24px 8px;">
        <table style="width:100%;border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;margin-bottom:10px;">
          <tr>
            <td style="padding:12px;font-size:13px;color:#71717a;">👥 Visitors today</td>
            <td style="padding:12px;font-size:15px;font-weight:800;color:#18181b;text-align:right;">${visitors}</td>
          </tr>
          <tr>
            <td style="padding:12px;font-size:13px;color:#71717a;">📦 Total orders today</td>
            <td style="padding:12px;font-size:15px;font-weight:800;color:#18181b;text-align:right;">${orderCount}</td>
          </tr>
          <tr>
            <td style="padding:12px;font-size:13px;color:#71717a;">💰 Total purchase amount today</td>
            <td style="padding:12px;font-size:15px;font-weight:800;color:#18181b;text-align:right;">₹${totalAmount}</td>
          </tr>
        </table>
      </div>

      <div style="padding:12px 24px 26px;border-top:1px solid #eee;text-align:center;">
        <p style="margin:0;color:#a1a1aa;font-size:11px;">Automated end-of-day report from ${escapeHtml(brandName)} — do not reply to this email.</p>
      </div>
    </div>
  </div>
  </body>
  </html>`;
}

// Gathers today's visitor count (distinct sessions from visitor_daily_log)
// plus today's order count/total (same query used for the per-order report).
async function getDailyStats() {
  const orderStats = await getTodayReport();
  const [visitorRows] = await pool.query(
    `SELECT COUNT(DISTINCT session_id) AS visitors
     FROM visitor_daily_log
     WHERE visit_date = DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))`
  );
  return {
    visitors: visitorRows[0]?.visitors || 0,
    orderCount: orderStats.orderCount,
    totalAmount: orderStats.totalAmount,
  };
}

// Never throws — logs and resolves so a failed report never crashes the
// scheduler that calls this every minute.
async function sendDailyReportEmail() {
  try {
    if (!isOwnerNotifyConfigured()) {
      console.warn("[email] ORDERS_EMAIL_USER/ORDERS_EMAIL_PASS/OWNER_EMAIL not set in .env — daily report is disabled.");
      return { sent: false, reason: "not_configured" };
    }

    const transporter = getOwnerTransporter();
    const brand = await getBrandInfo();
    const stats = await getDailyStats();
    const dateLabel = new Date().toLocaleDateString("en-IN", {
      dateStyle: "full",
      timeZone: "Asia/Kolkata",
    });
    const html = buildDailyReportHtml({ brandName: brand.brandName, dateLabel, stats });

    await transporter.sendMail({
      from: `"${brand.brandName} Orders" <${process.env.ORDERS_EMAIL_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: `Daily Report — ${dateLabel} | ${brand.brandName}`,
      html,
      encoding: "utf-8",
    });

    console.log(`[email] Daily report sent for ${dateLabel} (visitors: ${stats.visitors}, orders: ${stats.orderCount}, total: ₹${stats.totalAmount})`);
    await logEmailSend(process.env.ORDERS_EMAIL_USER, "daily_report");
    return { sent: true };
  } catch (err) {
    console.error("[email] Failed to send daily report:", err.message);
    return { sent: false, reason: "send_failed" };
  }
}

// ---------------------------------------------------------------------------
// "Report an Issue" reply — admin replies (from the Queries tab) to a
// customer's contact-form submission. Sent FROM the main store mailbox
// (EMAIL_USER, e.g. 3dcasemakers@gmail.com) TO the customer's own email,
// using the SAME transporter/credentials as order confirmation emails.
async function sendContactReplyEmail({ toEmail, toName, originalMessage, replyMessage }) {
  try {
    if (!toEmail) return { sent: false, reason: "no_email" };
    if (!isEmailConfigured()) {
      console.warn("[email] EMAIL_USER/EMAIL_PASS not set in .env — contact reply emails are disabled.");
      return { sent: false, reason: "not_configured" };
    }

    const transporter = getTransporter();
    const brand = await getBrandInfo();
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#18181b;">
        <h2 style="font-size:18px;margin:0 0 4px;">Hi ${escapeHtml(toName || "there")},</h2>
        <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 20px;">Thanks for reaching out to ${escapeHtml(brand.brandName)}. Here's our reply to your message:</p>
        <div style="background:#f4f4f5;border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.6;color:#18181b;white-space:pre-wrap;">${escapeHtml(replyMessage)}</div>
        ${originalMessage ? `
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;margin:24px 0 6px;font-weight:700;">Your original message</p>
        <div style="border-left:3px solid #e4e4e7;padding:2px 0 2px 14px;font-size:13px;line-height:1.6;color:#71717a;white-space:pre-wrap;">${escapeHtml(originalMessage)}</div>
        ` : ""}
        <p style="font-size:13px;line-height:1.6;color:#71717a;margin:28px 0 0;">— ${escapeHtml(brand.brandName)} Support</p>
      </div>`;

    await transporter.sendMail({
      from: `"${brand.brandName} Support" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `Re: Your message to ${brand.brandName}`,
      html,
      encoding: "utf-8",
    });

    console.log(`[email] Contact reply sent to ${toEmail}`);
    await logEmailSend(process.env.EMAIL_USER, "contact_reply");
    return { sent: true };
  } catch (err) {
    console.error("[email] Failed to send contact reply:", err.message);
    return { sent: false, reason: "send_failed" };
  }
}

module.exports = {
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
  sendOwnerNewOrderNotification,
  sendDailyReportEmail,
  isEmailConfigured,
  isOwnerNotifyConfigured,
  sendContactReplyEmail,
  buildOrderConfirmationHtml,
  buildOrderStatusUpdateHtml,
  buildOwnerNewOrderHtml,
  buildDailyReportHtml,
};
