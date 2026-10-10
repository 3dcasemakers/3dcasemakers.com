require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ensureAdminSeeded } = require("./config/seed");
const { ensureSchema } = require("./config/migrate");
const { startDailyReportScheduler } = require("./services/dailyReportScheduler");

async function startServer() {
const app = express();
const { attachForesight } = require('./services/foresightIntegration');
const foresightReporter = await attachForesight(app);

if (!process.env.JWT_SECRET) {
  console.error("[config] JWT_SECRET is not set — admin login will fail until it is configured in .env");
}

// Behind Hostinger's / Cloudflare's reverse proxy: trust the first hop so
// req.ip / X-Forwarded-For are read correctly (used by rate limiting).
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Basic security headers on every response (no extra dependency needed).
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS: accept both the root domain and its www. variant (and vice versa), so
// switching between 3dcasemakers.com and www.3dcasemakers.com never breaks API
// calls just because CLIENT_URL only listed one form. Comma-separate multiple
// origins in CLIENT_URL if needed, e.g. CLIENT_URL=https://3dcasemakers.com,https://admin.3dcasemakers.com
const configuredOrigins = (process.env.CLIENT_URL || "https://3dcasemakers.com")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = new Set();
configuredOrigins.forEach((o) => {
  try {
    const u = new URL(o);
    allowedOrigins.add(u.origin);
    const withoutWww = u.hostname.replace(/^www\./, "");
    const port = u.port ? `:${u.port}` : "";
    allowedOrigins.add(`${u.protocol}//${withoutWww}${port}`);
    allowedOrigins.add(`${u.protocol}//www.${withoutWww}${port}`);
  } catch {
    allowedOrigins.add(o);
  }
});

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin header (server-to-server, curl, Postman) - allow
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      console.warn(`CORS blocked request from origin: ${origin}. Allowed: ${[...allowedOrigins].join(", ")}`);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb", verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// Method override: some shared-hosting firewalls (Hostinger/Imunify-style)
// silently drop DELETE (and sometimes PATCH) requests before they reach
// Node — which made every admin "Delete" button (products, banners,
// collections, orders, FAQs, reviews...) look dead. The admin panel now
// sends those as POST + "X-HTTP-Method-Override: DELETE", and this turns
// them back into the real verb so the existing routes handle them.
app.use((req, res, next) => {
  if (req.method === "POST") {
    const override = String(req.headers["x-http-method-override"] || "").toUpperCase();
    if (override === "DELETE" || override === "PATCH" || override === "PUT") req.method = override;
  }
  next();
});

// Serve uploaded images statically (product photos etc - replaces Cloudinary)
// UPLOAD_DIR should be an ABSOLUTE path OUTSIDE this backend folder so it
// survives redeploys (see .env.example). Falls back to a local folder if
// left relative, but that local folder gets wiped on every redeploy.
const { uploadDir: uploadDirForStatic } = require("./config/uploads");
const makeThumbRouter = require("./routes/thumb");
app.use("/uploads", makeThumbRouter(uploadDirForStatic));
app.use(
  "/uploads",
  express.static(uploadDirForStatic, {
    maxAge: "30d",
    dotfiles: "ignore",
    setHeaders: (res) => {
      res.set("Cache-Control", "public, max-age=2592000");
      // Uploaded files are only ever images/videos — forbid them from ever
      // being executed as a page/script even if something slips through.
      res.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "3dcasemakers-backend" }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/collections", require("./routes/collections"));
app.use("/api/banners", require("./routes/banners"));
app.use("/api/meta-ads", require("./routes/metaAds"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/faqs", require("./routes/faqs"));
app.use("/api/contact", require("./routes/contact"));
app.use("/api/newsletter", require("./routes/newsletter"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/email-usage", require("./routes/emailUsage"));
app.use("/api/pincode", require("./routes/pincode"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/site-reviews", require("./routes/siteReviews"));
app.use("/api/review-stories", require("./routes/reviewStories"));
app.use("/api/snaps", require("./routes/snaps"));
app.use("/api", require("./routes/merchant"));

// Bot-only link-preview pages (WhatsApp/Facebook/Twitter/etc). See share.js.
app.use("/share", require("./routes/share"));

// Unknown API route -> clean JSON 404 instead of Express's HTML error page.
app.use("/api", (req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` }));

app.use((err, req, res, next) => {
  // Malformed JSON body -> 400, not a scary 500.
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  if (err && err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  console.error(err);
  // Never leak internal error details (SQL, stack) to the public in production.
  const msg = process.env.NODE_ENV === "production" ? "Server error" : err.message || "Server error";
  res.status(err.status || 500).json({ error: msg });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`3DCaseMakers backend running on port ${PORT}`));
server.on('close', () => { void foresightReporter?.close({ flush: true }); });

// Owner's end-of-day report (visitors, orders, total purchase amount) —
// fires automatically at 11:59 PM Asia/Kolkata every day. See
// services/dailyReportScheduler.js.
startDailyReportScheduler();

// Self-heal the DB schema first (adds any columns an older/existing database
// is missing - see config/migrate.js for why this is needed), THEN seed the
// admin account.
ensureSchema()
  .catch((err) => console.error("Schema auto-migration failed:", err.message))
  .finally(() => {
    // Keep the admins table in sync with ADMIN_EMAIL/ADMIN_PASSWORD on every
    // boot. This means changing those two env vars in Hostinger's hPanel +
    // restarting the app is enough to update admin login - no manual
    // `npm run seed` needed.
    ensureAdminSeeded().catch((err) => console.error("Admin auto-seed failed:", err.message));
  });

}
startServer().catch(() => { console.error('Server startup failed'); process.exitCode = 1; });

