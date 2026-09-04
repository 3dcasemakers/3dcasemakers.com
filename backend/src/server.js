require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { ensureAdminSeeded } = require("./config/seed");
const { ensureSchema } = require("./config/migrate");
const { startDailyReportScheduler } = require("./services/dailyReportScheduler");

const app = express();

// CORS: accept both the root domain and its www. variant (and vice versa), so
// switching between 3dcasemakers.in and www.3dcasemakers.in never breaks API
// calls just because CLIENT_URL only listed one form. Comma-separate multiple
// origins in CLIENT_URL if needed, e.g. CLIENT_URL=https://3dcasemakers.in,https://admin.3dcasemakers.in
const configuredOrigins = (process.env.CLIENT_URL || "https://3dcasemakers.in")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = new Set();
configuredOrigins.forEach((o) => {
  try {
    const u = new URL(o);
    allowedOrigins.add(`${u.protocol}//${u.hostname}`);
    const withoutWww = u.hostname.replace(/^www\./, "");
    allowedOrigins.add(`${u.protocol}//${withoutWww}`);
    allowedOrigins.add(`${u.protocol}//www.${withoutWww}`);
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

// Serve uploaded images statically (product photos etc - replaces Cloudinary)
// UPLOAD_DIR should be an ABSOLUTE path OUTSIDE this backend folder so it
// survives redeploys (see .env.example). Falls back to a local folder if
// left relative, but that local folder gets wiped on every redeploy.
const rawUploadDirForStatic = process.env.UPLOAD_DIR || "uploads";
const uploadDirForStatic = path.isAbsolute(rawUploadDirForStatic)
  ? rawUploadDirForStatic
  : path.join(__dirname, "..", rawUploadDirForStatic);
const makeThumbRouter = require("./routes/thumb");
app.use("/uploads", makeThumbRouter(uploadDirForStatic));
app.use(
  "/uploads",
  express.static(uploadDirForStatic, {
    maxAge: "30d",
    setHeaders: (res) => res.set("Cache-Control", "public, max-age=2592000"),
  })
);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "3dcasemakers-backend" }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/collections", require("./routes/collections"));
app.use("/api/banners", require("./routes/banners"));
app.use("/api/meta-ads", require("./routes/metaAds"));
app.use("/api/orders", require("./routes/orders"));
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
app.use("/api/stocks", require("./routes/stocks"));
app.use("/api", require("./routes/merchant"));

// Bot-only link-preview pages (WhatsApp/Facebook/Twitter/etc). See share.js.
app.use("/share", require("./routes/share"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`3DCaseMakers backend running on port ${PORT}`));

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
