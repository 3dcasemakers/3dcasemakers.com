// One-time importer to load the ipacky_products.csv stock sheet into the
// standalone Manage Stocks register (stock_levels + stock_movements).
//
// CSV columns expected: PRODUCT, UNIT PURCHASE PRICE, SELLING PRICE, CURRENT STOCK, BRAND
//   - BRAND      -> stock_levels.product_name  (e.g. "Vivo", "Iphone")
//   - PRODUCT    -> stock_levels.model          (e.g. "y300 pro / iqoo z10 / vivo t4 5g")
//   - CURRENT STOCK -> stock_levels.quantity
//   - purchase/selling price are kept only as a note on the inward movement,
//     since Manage Stocks has no price columns of its own.
//
// Usage (run from the backend/ folder, with .env / DB env vars set):
//   node scripts/importStockFromCsv.js data/ipacky_products.csv
// (the CSV you gave me is already included at backend/data/ipacky_products.csv)
//
// Safe to re-run: existing (product_name, model) rows are SET to the CSV
// quantity (not added on top), and each run logs one inward movement per row
// noting the import so the history stays honest.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../src/config/db");

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

// Minimal CSV line parser — handles quoted fields with embedded commas.
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

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/importStockFromCsv.js /path/to/file.csv");
    process.exit(1);
  }
  const raw = fs.readFileSync(path.resolve(csvPath), "utf8");
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
    console.error("CSV header must include PRODUCT, CURRENT STOCK, and BRAND columns. Got:", header);
    process.exit(1);
  }

  const data = rows.slice(1).map((r) => ({
    model: (r[idx.product] || "").trim(),
    purchase: (r[idx.purchase] || "").trim(),
    selling: (r[idx.selling] || "").trim(),
    quantity: Math.round(Number((r[idx.stock] || "0").trim()) || 0),
    brand: (r[idx.brand] || "").trim() || "General",
  })).filter((r) => r.model);

  console.log(`Parsed ${data.length} rows from ${csvPath}. Importing...`);

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
      console.error(`Failed row [${r.brand} / ${r.model}]:`, err.message);
      skipped++;
    } finally {
      conn.release();
    }
  }

  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
