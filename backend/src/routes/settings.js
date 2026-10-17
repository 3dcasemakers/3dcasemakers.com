const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");
const { withSoftCornerDefaults } = require("../utils/cornerSettings");
const { publicSettings, validateSettings } = require("../utils/settingsValidation");

const router = express.Router();

function withPaymentDefaults(settings = {}) {
  const defaults = {
    easebuzzEnabled: false,
    manualUpiEnabled: true,
    manualUpiId: "325691127665359@cnrb",
    manualUpiPayeeName: settings.logoText || "3D Case Makers",
    manualUpiScreenshotEnabled: true,
  };
  return { ...defaults, ...settings };
}

async function readSettings(db = pool, lock = false) {
  const [rows] = await db.query(`SELECT settings_json FROM store_settings WHERE id = 1${lock ? " FOR UPDATE" : ""}`);
  if (!rows.length) return withPaymentDefaults(withSoftCornerDefaults());
  try {
    const parsed = JSON.parse(rows[0].settings_json || "{}");
    const base = withSoftCornerDefaults(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
    return withPaymentDefaults(base);
  } catch {
    return withPaymentDefaults(withSoftCornerDefaults());
  }
}

async function writeSettings(obj, db = pool) {
  // UPSERT: the old plain UPDATE silently saved nothing when the id=1 row
  // didn't exist yet (fresh DB where schema.sql's INSERT IGNORE never ran),
  // so every "Save" in the admin panel looked successful but was lost.
  await db.query(
    "INSERT INTO store_settings (id, settings_json) VALUES (1, ?) ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)",
    [JSON.stringify({ ...obj, uiCornerStyleVersion: 1, uiBannerCorners: "hard", uiCollectionBannerCorners: "hard" })]
  );
}

router.get("/", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(publicSettings(await readSettings()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.get("/admin", requireAdmin, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await readSettings());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// PUT /api/settings (admin) — replaces the whole settings object.
router.put("/", requireAdmin, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Settings must be a JSON object" });
  }
  const problem = validateSettings(body);
  if (problem) return res.status(400).json({ error: problem });
  try {
    await writeSettings(body);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// PATCH /api/settings (admin) — merges only the given keys into the saved
// settings. Safer than PUT when two admin tabs are open: saving one screen
// can no longer wipe out keys another screen changed in the meantime.
// Same merge exposed as POST /api/settings/merge too, because some shared
// hosts' firewalls drop non-GET/POST/PUT verbs (the same reason upload.js
// has a POST /remove fallback for DELETE).
const mergeSettings = async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Settings must be a JSON object" });
  }
  const problem = validateSettings(body);
  if (problem) return res.status(400).json({ error: problem });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query("INSERT IGNORE INTO store_settings (id, settings_json) VALUES (1, '{}')");
    const current = await readSettings(connection, true);
    const next = { ...current, ...body, uiBannerCorners: "hard", uiCollectionBannerCorners: "hard" };
    await writeSettings(next, connection);
    await connection.commit();
    res.json({ success: true, settings: next });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  } finally {
    if (connection) connection.release();
  }
};
router.patch("/", requireAdmin, mergeSettings);
router.post("/merge", requireAdmin, mergeSettings);

module.exports = router;
