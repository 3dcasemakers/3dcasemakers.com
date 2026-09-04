const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pool = require("../config/db");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

// This whole module is a standalone stock register — it does NOT read from or
// write to the website's `products` table or the storefront phone-models list.
// Product name and phone model here are just free text typed by the admin.

// GET /api/stocks  -> current on-hand quantity per product-name+model
router.get("/", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, product_name, model, quantity, updated_at
       FROM stock_levels
       ORDER BY product_name ASC, model ASC`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        productName: r.product_name,
        model: r.model,
        quantity: r.quantity,
        updatedAt: r.updated_at,
      }))
    );
  } catch (err) {
    console.error("GET /api/stocks", err);
    res.status(500).json({ error: "Failed to load stock levels" });
  }
});

// GET /api/stocks/movements?limit=100 -> recent inward/outward ledger
router.get("/movements", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const [rows] = await pool.query(
      `SELECT id, type, product_name, model, quantity, channel, note, unit_price, total_price, created_at
       FROM stock_movements
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        productName: r.product_name,
        model: r.model,
        quantity: r.quantity,
        channel: r.channel,
        note: r.note,
        unitPrice: r.unit_price === null ? null : Number(r.unit_price),
        totalPrice: r.total_price === null ? null : Number(r.total_price),
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    console.error("GET /api/stocks/movements", err);
    res.status(500).json({ error: "Failed to load stock movements" });
  }
});

// GET /api/stocks/suggestions -> distinct product names & models typed so far (for autocomplete only)
router.get("/suggestions", requireAdmin, async (req, res) => {
  try {
    const [names] = await pool.query(
      `SELECT DISTINCT product_name FROM stock_levels ORDER BY product_name ASC LIMIT 500`
    );
    const [models] = await pool.query(
      `SELECT DISTINCT model FROM stock_levels WHERE model <> 'General' ORDER BY model ASC LIMIT 500`
    );
    res.json({
      productNames: names.map((r) => r.product_name),
      models: models.map((r) => r.model),
    });
  } catch (err) {
    console.error("GET /api/stocks/suggestions", err);
    res.status(500).json({ error: "Failed to load suggestions" });
  }
});

// Period ranges for the POS Bill export — mirrors the pattern used by
// /api/analytics (PERIOD_RANGES), scoped to stock_movements.created_at.
const STOCK_PERIOD_RANGES = {
  today: { where: "DATE(created_at) = CURDATE()" },
  yesterday: { where: "DATE(created_at) = (CURDATE() - INTERVAL 1 DAY)" },
  this_week: { where: "YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)" },
  last_week: { where: "YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) - 1" },
  this_month: { where: "YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())" },
  last_month: { where: "YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH)" },
  last_3_months: { where: "created_at > (NOW() - INTERVAL 3 MONTH)" },
  last_6_months: { where: "created_at > (NOW() - INTERVAL 6 MONTH)" },
  last_1_year: { where: "created_at > (NOW() - INTERVAL 1 YEAR)" },
  all_time: { where: "1=1" },
};
const STOCK_PERIOD_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  last_3_months: "Last 3 Months",
  last_6_months: "Last 6 Months",
  last_1_year: "Last Year",
  all_time: "All Time",
};

// GET /api/stocks/export-data?period=today|yesterday|this_week|last_week|
//   this_month|last_month|last_3_months|last_6_months|last_1_year|all_time
//   (default: this_month)
// Returns the POS Bill (outward) movements for the chosen date range, with
// product/model/quantity/price details, for the "Export Data" Excel sheet
// in the Manage Stocks admin tab.
router.get("/export-data", requireAdmin, async (req, res) => {
  try {
    const periodKey = STOCK_PERIOD_RANGES[req.query.period] ? req.query.period : "this_month";
    const range = STOCK_PERIOD_RANGES[periodKey];

    const [rows] = await pool.query(
      `SELECT id, product_name, model, quantity, channel, note, unit_price, total_price, created_at
       FROM stock_movements
       WHERE type = 'outward' AND ${range.where}
       ORDER BY created_at DESC`
    );

    const bills = rows.map((r) => ({
      id: r.id,
      productName: r.product_name,
      model: r.model,
      quantity: r.quantity,
      channel: r.channel || "",
      note: r.note || "",
      unitPrice: r.unit_price === null ? null : Number(r.unit_price),
      totalPrice: r.total_price === null ? null : Number(r.total_price),
      billedAt: r.created_at,
    }));

    const summary = {
      periodKey,
      periodLabel: STOCK_PERIOD_LABELS[periodKey] || periodKey,
      totalBills: bills.length,
      totalUnits: bills.reduce((s, b) => s + (b.quantity || 0), 0),
      totalAmount: bills.reduce((s, b) => s + (b.totalPrice || 0), 0),
      generatedAt: new Date().toISOString(),
    };

    res.json({ summary, bills });
  } catch (err) {
    console.error("GET /api/stocks/export-data", err);
    res.status(500).json({ error: "Failed to build POS bill export data" });
  }
});

// POST /api/stocks/inward  { productName, model, quantity, note }
// New stock arriving — increments (or creates) the stock_levels row and logs a movement.
router.post("/inward", requireAdmin, async (req, res) => {
  const { productName, model, quantity, note, unitPrice } = req.body || {};
  const qty = Number(quantity);
  const name = (productName || "").trim();
  if (!name || !qty || qty <= 0) {
    return res.status(400).json({ error: "productName and a positive quantity are required" });
  }
  const modelName = (model || "General").trim() || "General";
  const price = unitPrice !== undefined && unitPrice !== null && unitPrice !== "" ? Number(unitPrice) : null;
  const totalPrice = price !== null && !isNaN(price) ? Math.round(price * qty * 100) / 100 : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      "SELECT id, quantity FROM stock_levels WHERE product_name = ? AND model = ? FOR UPDATE",
      [name, modelName]
    );

    if (existing.length) {
      await conn.query("UPDATE stock_levels SET quantity = quantity + ? WHERE id = ?", [qty, existing[0].id]);
    } else {
      await conn.query(
        "INSERT INTO stock_levels (id, product_name, model, quantity) VALUES (?, ?, ?, ?)",
        [newId("stk"), name, modelName, qty]
      );
    }

    const movementId = newId("mv");
    await conn.query(
      "INSERT INTO stock_movements (id, type, product_name, model, quantity, note, unit_price, total_price) VALUES (?, 'inward', ?, ?, ?, ?, ?, ?)",
      [movementId, name, modelName, qty, note || null, price, totalPrice]
    );

    await conn.commit();
    res.json({ success: true, movementId });
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/stocks/inward", err);
    res.status(500).json({ error: "Failed to record inward stock" });
  } finally {
    conn.release();
  }
});

// POST /api/stocks/outward  { productName, model, quantity, channel: 'website'|'offline', note, unitPrice }
// Stock leaving (a POS bill) — decrements stock_levels (never below 0) and logs a movement.
router.post("/outward", requireAdmin, async (req, res) => {
  const { productName, model, quantity, channel, note, unitPrice } = req.body || {};
  const qty = Number(quantity);
  const name = (productName || "").trim();
  if (!name || !qty || qty <= 0) {
    return res.status(400).json({ error: "productName and a positive quantity are required" });
  }
  if (!["website", "offline"].includes(channel)) {
    return res.status(400).json({ error: "channel must be 'website' or 'offline'" });
  }
  const modelName = (model || "General").trim() || "General";
  const price = unitPrice !== undefined && unitPrice !== null && unitPrice !== "" ? Number(unitPrice) : null;
  const totalPrice = price !== null && !isNaN(price) ? Math.round(price * qty * 100) / 100 : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      "SELECT id, quantity FROM stock_levels WHERE product_name = ? AND model = ? FOR UPDATE",
      [name, modelName]
    );

    const available = existing.length ? existing[0].quantity : 0;
    if (available < qty) {
      await conn.rollback();
      return res.status(400).json({ error: `Only ${available} in stock for this model` });
    }

    const remaining = available - qty;
    await conn.query("UPDATE stock_levels SET quantity = ? WHERE id = ?", [remaining, existing[0].id]);

    const movementId = newId("mv");
    await conn.query(
      "INSERT INTO stock_movements (id, type, product_name, model, quantity, channel, note, unit_price, total_price) VALUES (?, 'outward', ?, ?, ?, ?, ?, ?, ?)",
      [movementId, name, modelName, qty, channel, note || null, price, totalPrice]
    );

    await conn.commit();
    res.json({ success: true, movementId, remaining });
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/stocks/outward", err);
    res.status(500).json({ error: "Failed to record outward stock" });
  } finally {
    conn.release();
  }
});

// POST /api/stocks/bulk  { items: [{ type: 'inward'|'outward', productName, model, quantity, channel, note }, ...] }
// Bulk inward/outward — saves each row in its own transaction so one bad row
// doesn't block the rest. Returns a per-row result list.
router.post("/bulk", requireAdmin, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    return res.status(400).json({ error: "items array is required" });
  }
  if (items.length > 200) {
    return res.status(400).json({ error: "Max 200 rows per bulk submit" });
  }

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const type = item.type === "outward" ? "outward" : item.type === "inward" ? "inward" : null;
    const name = (item.productName || "").trim();
    const modelName = (item.model || "General").trim() || "General";
    const qty = Number(item.quantity);

    if (!type || !name || !qty || qty <= 0) {
      failed++;
      results.push({ index: i, ok: false, error: "type, productName and a positive quantity are required" });
      continue;
    }
    if (type === "outward" && !["website", "offline"].includes(item.channel)) {
      failed++;
      results.push({ index: i, ok: false, error: "channel must be 'website' or 'offline'" });
      continue;
    }
    const price =
      item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== ""
        ? Number(item.unitPrice)
        : null;
    const totalPrice = price !== null && !isNaN(price) ? Math.round(price * qty * 100) / 100 : null;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.query(
        "SELECT id, quantity FROM stock_levels WHERE product_name = ? AND model = ? FOR UPDATE",
        [name, modelName]
      );

      if (type === "inward") {
        if (existing.length) {
          await conn.query("UPDATE stock_levels SET quantity = quantity + ? WHERE id = ?", [qty, existing[0].id]);
        } else {
          await conn.query(
            "INSERT INTO stock_levels (id, product_name, model, quantity) VALUES (?, ?, ?, ?)",
            [newId("stk"), name, modelName, qty]
          );
        }
        await conn.query(
          "INSERT INTO stock_movements (id, type, product_name, model, quantity, note, unit_price, total_price) VALUES (?, 'inward', ?, ?, ?, ?, ?, ?)",
          [newId("mv"), name, modelName, qty, item.note || null, price, totalPrice]
        );
        await conn.commit();
        succeeded++;
        results.push({ index: i, ok: true });
      } else {
        const available = existing.length ? existing[0].quantity : 0;
        if (available < qty) {
          await conn.rollback();
          failed++;
          results.push({ index: i, ok: false, error: `Only ${available} in stock for this model` });
          continue;
        }
        const remaining = available - qty;
        await conn.query("UPDATE stock_levels SET quantity = ? WHERE id = ?", [remaining, existing[0].id]);
        await conn.query(
          "INSERT INTO stock_movements (id, type, product_name, model, quantity, channel, note, unit_price, total_price) VALUES (?, 'outward', ?, ?, ?, ?, ?, ?, ?)",
          [newId("mv"), name, modelName, qty, item.channel, item.note || null, price, totalPrice]
        );
        await conn.commit();
        succeeded++;
        results.push({ index: i, ok: true, remaining });
      }
    } catch (err) {
      await conn.rollback();
      console.error(`POST /api/stocks/bulk row ${i} failed`, err);
      failed++;
      results.push({ index: i, ok: false, error: "Server error" });
    } finally {
      conn.release();
    }
  }

  res.json({ success: true, succeeded, failed, results });
});

// Minimal CSV parser — handles quoted fields with embedded commas.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// POST /api/stocks/import-csv
// One-time, admin-only button (no server terminal needed): reads the CSV
// bundled at backend/data/ipacky_products.csv and loads it into stock_levels
// + stock_movements. CSV columns: PRODUCT, UNIT PURCHASE PRICE, SELLING
// PRICE, CURRENT STOCK, BRAND -> BRAND becomes product_name, PRODUCT becomes
// model, CURRENT STOCK becomes quantity. Safe to click more than once —
// existing (product_name, model) rows are SET to the CSV quantity, not added
// on top.
router.post("/import-csv", requireAdmin, async (req, res) => {
  const csvPath = path.join(__dirname, "..", "..", "data", "ipacky_products.csv");
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: "data/ipacky_products.csv not found on the server — make sure it was deployed." });
  }
  try {
    const raw = fs.readFileSync(csvPath, "utf8");
    const rows = parseCsv(raw);
    const header = rows[0].map((h) => h.trim().toUpperCase());
    const idx = {
      product: header.indexOf("PRODUCT"),
      purchase: header.indexOf("UNIT PURCHASE PRICE"),
      selling: header.indexOf("SELLING PRICE"),
      stock: header.indexOf("CURRENT STOCK"),
      brand: header.indexOf("BRAND"),
    };
    if (idx.product === -1 || idx.stock === -1 || idx.brand === -1) {
      return res.status(400).json({ error: "CSV header must include PRODUCT, CURRENT STOCK, and BRAND columns." });
    }

    const data = rows.slice(1).map((r) => ({
      model: (r[idx.product] || "").trim(),
      purchase: (r[idx.purchase] || "").trim(),
      selling: (r[idx.selling] || "").trim(),
      quantity: Math.round(Number((r[idx.stock] || "0").trim()) || 0),
      brand: (r[idx.brand] || "").trim() || "General",
    })).filter((r) => r.model);

    let inserted = 0, updated = 0, skipped = 0;
    for (const r of data) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [existing] = await conn.query(
          "SELECT id, quantity FROM stock_levels WHERE product_name = ? AND model = ? FOR UPDATE",
          [r.brand, r.model]
        );

        if (existing.length) {
          await conn.query("UPDATE stock_levels SET quantity = ? WHERE id = ?", [r.quantity, existing[0].id]);
          updated++;
        } else {
          await conn.query(
            "INSERT INTO stock_levels (id, product_name, model, quantity) VALUES (?, ?, ?, ?)",
            [newId("stk"), r.brand, r.model, r.quantity]
          );
          inserted++;
        }

        const note = `CSV import (ipacky) — purchase ₹${r.purchase || "?"}, selling ₹${r.selling || "?"}`;
        await conn.query(
          "INSERT INTO stock_movements (id, type, product_name, model, quantity, note) VALUES (?, 'inward', ?, ?, ?, ?)",
          [newId("mv"), r.brand, r.model, r.quantity, note]
        );

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        console.error(`Stock CSV import row failed [${r.brand} / ${r.model}]`, err);
        skipped++;
      } finally {
        conn.release();
      }
    }

    res.json({ success: true, total: data.length, inserted, updated, skipped });
  } catch (err) {
    console.error("POST /api/stocks/import-csv", err);
    res.status(500).json({ error: "Failed to import CSV" });
  }
});

module.exports = router;
