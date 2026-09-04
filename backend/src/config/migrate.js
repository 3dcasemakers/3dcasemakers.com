// Auto-migration, run once on every server boot (see server.js).
//
// WHY THIS EXISTS: schema.sql uses "CREATE TABLE IF NOT EXISTS", so on any
// database that already had a `products` table BEFORE a newer column (e.g.
// material_set_id, requires_customer_name, meta_title...) was added to this
// project, importing the updated schema.sql again does NOT add that column -
// MySQL just skips the whole CREATE TABLE statement. The `products` INSERT/
// UPDATE queries in routes/products.js reference every one of these columns,
// so on a database missing even one of them, every create/update product
// request fails at the database with "Unknown column 'x' in field list" and
// the route responds 500 Internal Server Error - this is the #1 cause of
// "product create pandrapo error varuthu 500" style reports.
//
// This module inspects the live database (INFORMATION_SCHEMA) on boot and
// ALTERs any table that is missing a column the app needs, so it self-heals
// regardless of which schema.sql version the database was originally created
// from - no manual SSH / phpMyAdmin ALTER TABLE step required.
const pool = require("./db");

// Columns the current app code requires, per table, beyond a bare-minimum
// original install. Safe to append to over time as the app grows.
const REQUIRED_COLUMNS = {
  products: [
    { name: "brand", ddl: "VARCHAR(100) NULL" },
    { name: "material", ddl: "VARCHAR(64) NULL" },
    { name: "is_customizable", ddl: "TINYINT(1) DEFAULT 0" },
    { name: "requires_customer_name", ddl: "TINYINT(1) DEFAULT 0" },
    { name: "variant_group_id", ddl: "VARCHAR(64) DEFAULT NULL" },
    { name: "material_set_id", ddl: "VARCHAR(64) DEFAULT NULL" },
    { name: "meta_title", ddl: "VARCHAR(255) NULL" },
    { name: "meta_description", ddl: "VARCHAR(500) NULL" },
    { name: "trending_order", ddl: "INT DEFAULT 0" },
    { name: "best_seller_order", ddl: "INT DEFAULT 0" },
    { name: "is_trending", ddl: "TINYINT(1) DEFAULT 0" },
    { name: "is_new_arrival", ddl: "TINYINT(1) DEFAULT 0" },
    { name: "is_best_seller", ddl: "TINYINT(1) DEFAULT 0" },
    // Generalized "ask customer for N photos / N text boxes" config, stored
    // as JSON (see Product.customization / CUSTOMIZATION_PRESETS in
    // frontend/src/types.ts). Replaces is_customizable/requires_customer_name
    // for new products; those two columns stay as a fallback for old rows.
    { name: "customization_json", ddl: "TEXT NULL" },
  ],
  collections: [
    { name: "variant_group_id", ddl: "VARCHAR(64) DEFAULT NULL" },
    { name: "meta_title", ddl: "VARCHAR(255) NULL" },
    { name: "meta_description", ddl: "VARCHAR(500) NULL" },
    { name: "banner_mobile", ddl: "TEXT NULL" },
    { name: "banner_desktop", ddl: "TEXT NULL" },
    { name: "banner_media_type", ddl: "VARCHAR(10) DEFAULT 'image'" },
    { name: "banner_video_url", ddl: "TEXT NULL" },
    { name: "is_highlighted", ddl: "TINYINT(1) DEFAULT 0" },
    { name: "display_order", ddl: "INT DEFAULT 0" },
  ],
  stock_movements: [
    // Unit selling/purchase price at the time of the movement, and the
    // computed line total — needed for the POS Bill export (date, phone
    // model, price details). Nullable so old rows without a price still
    // display fine, just with a blank price in the export.
    { name: "unit_price", ddl: "DECIMAL(10,2) NULL" },
    { name: "total_price", ddl: "DECIMAL(10,2) NULL" },
  ],
  orders: [
    // Distinguishes an order a customer placed on the storefront from one an
    // admin typed in by hand (e.g. a phone/WhatsApp/in-person sale) via the
    // Orders tab's "Create Order" button. Defaults to 'website' so every
    // pre-existing row (all of which came from the storefront) keeps reading
    // correctly with no backfill needed.
    { name: "source", ddl: "ENUM('website','manual') NOT NULL DEFAULT 'website'" },
  ],
};

// Tables the app needs that may be missing entirely on an older production
// database (e.g. added to schema.sql after the live DB was first created,
// and schema.sql was never manually re-imported on the server). Unlike
// REQUIRED_COLUMNS, this actually creates the table if it's absent, so a
// route like POST /api/contact doesn't 500 forever just because nobody ran
// schema.sql again after this feature shipped.
const REQUIRED_TABLES = {
  contact_queries: `
    CREATE TABLE IF NOT EXISTS contact_queries (
      id            VARCHAR(64) PRIMARY KEY,
      name          VARCHAR(255) NOT NULL,
      email         VARCHAR(255) NOT NULL,
      phone         VARCHAR(30) NOT NULL,
      message       TEXT NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'new',
      reply_message TEXT NULL,
      replied_at    TIMESTAMP NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,
  email_send_log: `
    CREATE TABLE IF NOT EXISTS email_send_log (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      mailbox     VARCHAR(255) NOT NULL,
      category    VARCHAR(40)  NOT NULL,
      sent_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_send_log_mailbox_sent_at (mailbox, sent_at)
    )
  `,
};

async function ensureTables() {
  for (const [table, ddl] of Object.entries(REQUIRED_TABLES)) {
    try {
      if (!(await tableExists(table))) {
        console.log(`[migrate] Table "${table}" is missing - creating it now ...`);
        await pool.query(ddl);
        console.log(`[migrate] Created table "${table}".`);
      }
    } catch (err) {
      console.error(`[migrate] Failed to create missing table "${table}":`, err.message);
    }
  }
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function existingColumns(table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return new Set(rows.map((r) => r.COLUMN_NAME));
}

async function ensureSchema() {
  // Create any entirely-missing tables first, so the column-patch loop below
  // (which only patches tables that already exist) has something to work on.
  await ensureTables();

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    try {
      if (!(await tableExists(table))) {
        // Table doesn't exist at all yet - full schema.sql import will create
        // it with every column already included, so nothing to patch here.
        continue;
      }
      const have = await existingColumns(table);
      const missing = columns.filter((c) => !have.has(c.name));
      for (const col of missing) {
        console.log(`[migrate] Adding missing column ${table}.${col.name} ...`);
        await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.ddl}`);
      }
      if (missing.length) {
        console.log(`[migrate] ${table}: added ${missing.length} missing column(s): ${missing.map((c) => c.name).join(", ")}`);
      }
    } catch (err) {
      // Never let a migration hiccup stop the server from booting - just log
      // it loudly so it shows up in the Hostinger/Node logs.
      console.error(`[migrate] Failed to verify/patch table "${table}":`, err.message);
    }
  }

  // idx_products_material_set_id is only useful once the column above
  // exists; (re)create it defensively, ignoring "duplicate key name" errors.
  try {
    await pool.query("CREATE INDEX idx_products_material_set_id ON products (material_set_id)");
  } catch (err) {
    if (!/Duplicate key name/i.test(err.message)) {
      console.error("[migrate] Failed to ensure idx_products_material_set_id:", err.message);
    }
  }
}

module.exports = { ensureSchema };
