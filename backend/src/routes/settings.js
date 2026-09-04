const express = require("express");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
    res.json(rows.length ? JSON.parse(rows[0].settings_json) : {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/", requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

module.exports = router;
