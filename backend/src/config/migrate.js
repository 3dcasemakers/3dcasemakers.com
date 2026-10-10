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
const { seedWordingGroups } = require("./seedMuruganWordings");

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
    // "Photo Frames" products: no phone model; instead the customer picks a
    // size (e.g. 8x12 / 12x18) and each size carries its own manually
    // entered price. frame_sizes_json = [{ label, price, comparePrice }].
    { name: "is_photo_frame", ddl: "TINYINT(1) DEFAULT 0" },
    { name: "frame_sizes_json", ddl: "TEXT NULL" },
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
  orders: [
    // Distinguishes an order a customer placed on the storefront from one an
    // admin typed in by hand (e.g. a phone/WhatsApp/in-person sale) via the
    // Orders tab's "Create Order" button. Defaults to 'website' so every
    // pre-existing row (all of which came from the storefront) keeps reading
    // correctly with no backfill needed.
    { name: "source", ddl: "ENUM('website','manual') NOT NULL DEFAULT 'website'" },
    // Easebuzz online payments: our txnid and Easebuzz's own payment id (easepayid).
    { name: "gateway_txnid", ddl: "VARCHAR(64) NULL" },
    { name: "gateway_payment_id", ddl: "VARCHAR(64) NULL" },
    // Tamil Nadu courier choice: 'st_courier' (free) or 'post_office' (Rs 99). NULL elsewhere.
    { name: "courier", ddl: "VARCHAR(20) NULL" },
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
  // One row per Easebuzz checkout attempt. The cart/customer snapshot lives here
  // until payment is confirmed; only then is a real row created in `orders`.
  payment_attempts: `
    CREATE TABLE IF NOT EXISTS payment_attempts (
      txnid              VARCHAR(64) PRIMARY KEY,
      amount             DECIMAL(10,2) NOT NULL,
      payload_json       LONGTEXT NOT NULL,
      status             VARCHAR(20) NOT NULL DEFAULT 'initiated',
      gateway_status     VARCHAR(30) NULL,
      gateway_payment_id VARCHAR(64) NULL,
      order_id           VARCHAR(64) NULL,
      created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payment_attempts_created_at (created_at)
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
  // Per-collection manual product order (Admin > Collections > Products).
  // Kept separate from products.display_order, which is global, so reordering
  // one collection never disturbs the order of the same products elsewhere.
  collection_product_order: `
    CREATE TABLE IF NOT EXISTS collection_product_order (
      collection_id VARCHAR(64) NOT NULL,
      product_id    VARCHAR(64) NOT NULL,
      sort_order    INT NOT NULL DEFAULT 0,
      PRIMARY KEY (collection_id, product_id),
      INDEX idx_cpo_collection_sort (collection_id, sort_order)
    )
  `,
  manual_upi_payments: `
    CREATE TABLE IF NOT EXISTS manual_upi_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(64) NOT NULL UNIQUE,
      payment_method VARCHAR(32) NOT NULL DEFAULT 'manual_upi',
      expected_amount DECIMAL(10,2) NOT NULL,
      upi_id VARCHAR(255) NOT NULL,
      payee_name VARCHAR(255) NOT NULL,
      upi_uri TEXT NOT NULL,
      upi_app VARCHAR(50) NULL,
      transaction_id VARCHAR(100) NULL,
      normalized_transaction_id VARCHAR(100) NULL,
      screenshot_path TEXT NULL,
      payment_status ENUM('awaiting_payment', 'pending_verification', 'verified', 'failed') NOT NULL DEFAULT 'awaiting_payment',
      submitted_at TIMESTAMP NULL DEFAULT NULL,
      verified_at TIMESTAMP NULL DEFAULT NULL,
      verified_by VARCHAR(255) NULL,
      rejected_at TIMESTAMP NULL DEFAULT NULL,
      rejected_by VARCHAR(255) NULL,
      rejection_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_manual_upi_status (payment_status),
      UNIQUE KEY uq_manual_upi_normalized_txnid (normalized_transaction_id),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
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
  // Older installations can have all columns but an older ENUM definition.
  // Append supported states while retaining legacy values, so new status and
  // payment controls do not fail with "Data truncated" on those databases.
  try {
    const [columns] = await pool.query("SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME IN ('status', 'payment_status', 'payment_method')");
    const requiredEnums = {
      status: ["pending", "processing", "ready_to_ship", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"],
      payment_status: ["pending", "paid", "failed", "refunded", "awaiting_payment", "pending_verification"],
      payment_method: ["online", "easebuzz", "manual_upi"],
    };
    for (const column of columns) {
      if (!/^enum\(/i.test(column.COLUMN_TYPE)) continue;
      const literals = [...column.COLUMN_TYPE.matchAll(/'(?:[^'\\]|\\.)*'/g)].map((match) => match[0]);
      const existing = literals.map((literal) => literal.slice(1, -1));
      const desired = requiredEnums[column.COLUMN_NAME];
      if (!desired || desired.every((value) => existing.includes(value))) continue;
      const values = [...literals, ...desired.filter((value) => !existing.includes(value)).map((value) => `'${value}'`)].join(",");
      await pool.query(`ALTER TABLE orders MODIFY COLUMN \`${column.COLUMN_NAME}\` ENUM(${values}) DEFAULT '${column.COLUMN_NAME === "payment_method" ? "manual_upi" : "pending"}'`);
    }
  } catch (err) {
    console.error("[migrate] Failed to ensure order status/payment enums:", err.message);
  }

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

  // The storefront + admin read/write settings from row id=1. Make sure it
  // exists (older DBs created without schema.sql's INSERT IGNORE had no row,
  // so every settings save silently did nothing).
  try {
    if (await tableExists("store_settings")) {
      await pool.query("INSERT IGNORE INTO store_settings (id, settings_json) VALUES (1, '{}')");
      const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
      let settings = {};
      try {
        settings = JSON.parse((rows[0] && rows[0].settings_json) || "{}") || {};
      } catch {
        settings = {};
      }
      let modified = false;
      if (settings.easebuzzEnabled === undefined) {
        settings.easebuzzEnabled = false;
        modified = true;
      }
      if (settings.manualUpiEnabled === undefined) {
        settings.manualUpiEnabled = true;
        modified = true;
      }
      if (!settings.manualUpiId) {
        settings.manualUpiId = "325691127665359@cnrb";
        modified = true;
      }
      if (!settings.manualUpiPayeeName) {
        settings.manualUpiPayeeName = settings.logoText || "3D Case Makers";
        modified = true;
      }
      if (settings.manualUpiScreenshotEnabled === undefined) {
        settings.manualUpiScreenshotEnabled = true;
        modified = true;
      }
      if (modified) {
        await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(settings)]);
        console.log("[migrate] Initialized payment settings (Easebuzz: OFF, Direct UPI: ON, UPI ID: 325691127665359@cnrb).");
      }
    }
  } catch (err) {
    console.error("[migrate] Failed to ensure store_settings row and payment settings:", err.message);
  }

  // Create the "Photo Frames" collection once (slug photo-frames). A flag in
  // store_settings remembers that it was seeded, so if the admin later renames
  // or deletes it, the next boot does not bring it back.
  try {
    if ((await tableExists("collections")) && (await tableExists("store_settings"))) {
      const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
      let settings = {};
      try {
        settings = JSON.parse((rows[0] && rows[0].settings_json) || "{}") || {};
      } catch {
        settings = {};
      }
      if (!settings.photoFramesCollectionSeeded) {
        const [[hit]] = await pool.query("SELECT COUNT(*) AS cnt FROM collections WHERE slug = 'photo-frames'");
        if (!hit.cnt) {
          const [[mx]] = await pool.query("SELECT COALESCE(MAX(display_order), 0) AS m FROM collections");
          await pool.query(
            "INSERT INTO collections (id, name, slug, image, description, is_visible, display_order) VALUES (?,?,?,?,?,?,?)",
            ["photo-frames", "Photo Frames", "photo-frames", "", "Premium photo frames in 8x12 and 12x18 sizes.", 1, Number(mx.m) + 1]
          );
          console.log('[migrate] Created the "Photo Frames" collection.');
        }
        settings.photoFramesCollectionSeeded = true;
        await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(settings)]);
      }
    }
  } catch (err) {
    console.error('[migrate] Failed to seed the "Photo Frames" collection:', err.message);
  }

  // Create the "Acrylic Cases" collection once (slug acrylic-cases) and put every
  // product whose material is "Acrylic Case" into it. A flag in store_settings
  // remembers it was seeded, so if the admin later renames/deletes the
  // collection or removes a product from it, the next boot does not undo that.
  // (New / re-materialled products are linked by routes/products.js.)
  try {
    if (
      (await tableExists("collections")) &&
      (await tableExists("store_settings")) &&
      (await tableExists("product_collections"))
    ) {
      const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
      let settings = {};
      try {
        settings = JSON.parse((rows[0] && rows[0].settings_json) || "{}") || {};
      } catch {
        settings = {};
      }
      if (!settings.acrylicCasesCollectionSeeded) {
        const [found] = await pool.query(
          "SELECT id FROM collections WHERE slug = 'acrylic-cases' OR LOWER(TRIM(name)) = 'acrylic cases' LIMIT 1"
        );
        let collectionId = found[0] && found[0].id;
        if (!collectionId) {
          const [[mx]] = await pool.query("SELECT COALESCE(MAX(display_order), 0) AS m FROM collections");
          collectionId = "acrylic-cases";
          await pool.query(
            "INSERT INTO collections (id, name, slug, image, description, is_visible, display_order) VALUES (?,?,?,?,?,?,?)",
            [collectionId, "Acrylic Cases", "acrylic-cases", "", "Premium crystal-clear acrylic phone cases - every design, one place.", 1, Number(mx.m) + 1]
          );
          console.log('[migrate] Created the "Acrylic Cases" collection.');
        }
        const [res] = await pool.query(
          "INSERT IGNORE INTO product_collections (product_id, collection_id) SELECT id, ? FROM products WHERE material = 'Acrylic Case'",
          [collectionId]
        );
        console.log(`[migrate] Linked ${res.affectedRows || 0} Acrylic Case product(s) to the "Acrylic Cases" collection.`);
        settings.acrylicCasesCollectionSeeded = true;
        await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(settings)]);
      }
    }
  } catch (err) {
    console.error('[migrate] Failed to seed the "Acrylic Cases" collection:', err.message);
  }

  // One-time backfill: products already sitting in a "<theme> Acrylic Cases"
  // collection (Murugan / Shivan / ...) are also linked to the main "Acrylic
  // Cases" collection. New and moved products are handled by routes/products.js.
  try {
    if (
      (await tableExists("collections")) &&
      (await tableExists("store_settings")) &&
      (await tableExists("product_collections"))
    ) {
      const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
      let settings = {};
      try {
        settings = JSON.parse((rows[0] && rows[0].settings_json) || "{}") || {};
      } catch {
        settings = {};
      }
      if (rows[0] && !settings.acrylicSubCollectionsBackfilled) {
        const [found] = await pool.query("SELECT id FROM collections WHERE slug = 'acrylic-cases' LIMIT 1");
        if (found[0]) {
          const parentId = found[0].id;
          const [res] = await pool.query(
            `INSERT IGNORE INTO product_collections (product_id, collection_id)
             SELECT DISTINCT p.id, ?
             FROM products p
             LEFT JOIN product_collections pc ON pc.product_id = p.id
             JOIN collections c ON c.id = p.collection_id OR c.id = pc.collection_id
             WHERE c.id <> ? AND (c.slug LIKE '%-acrylic-cases' OR LOWER(TRIM(c.name)) LIKE '% acrylic cases')`,
            [parentId, parentId]
          );
          console.log(`[migrate] Linked ${res.affectedRows || 0} sub-collection product(s) to the "Acrylic Cases" collection.`);
          settings.acrylicSubCollectionsBackfilled = true;
          await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(settings)]);
        }
      }
    }
  } catch (err) {
    console.error("[migrate] Failed to backfill Acrylic Cases sub-collections:", err.message);
  }

  // One-time: every shipping charge must end in 9 (e.g. 100 -> 99, 150 -> 149).
  // Admin-saved zone rates / fallback rate live in store_settings and would
  // otherwise keep the old values. Only non-zero rates that do not already
  // end in 9 are reduced by Rs 1; free (0) zones and rates ending in 9 stay.
  try {
    if (await tableExists("store_settings")) {
      const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
      let settings = {};
      try {
        settings = JSON.parse((rows[0] && rows[0].settings_json) || "{}") || {};
      } catch {
        settings = {};
      }
      if (rows[0] && !settings.shippingRatesEndIn9Migrated) {
        const fix = (v) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 && n % 10 !== 9 ? Math.round(n) - 1 : v;
        };
        if (Array.isArray(settings.shippingZones)) {
          settings.shippingZones = settings.shippingZones.map((z) => (z && typeof z === "object" ? { ...z, rate: fix(z.rate) } : z));
        }
        if (settings.shippingFallbackRate !== undefined && settings.shippingFallbackRate !== null && settings.shippingFallbackRate !== "") {
          settings.shippingFallbackRate = fix(settings.shippingFallbackRate);
        }
        settings.shippingRatesEndIn9Migrated = true;
        await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(settings)]);
        console.log("[migrate] Shipping rates reduced by Rs 1 so they end in 9.");
      }
    }
  } catch (err) {
    console.error("[migrate] Failed to adjust shipping rates:", err.message);
  }

  // One-time cleanup: older builds shipped 10 built-in SAMPLE testimonials
  // (ids d1..d10) that the admin form could silently save into settings.
  // Remove exactly those sample entries (matched by id AND name) so no fake
  // review stays on the site. Real reviews are never touched. Runs once.
  try {
    if (await tableExists("store_settings")) {
      const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
      let settings = {};
      try {
        settings = JSON.parse((rows[0] && rows[0].settings_json) || "{}") || {};
      } catch {
        settings = {};
      }
      if (!settings.sampleTestimonialsCleaned) {
        const SAMPLE = {
          d1: "Priya S.", d2: "Arun Kumar", d3: "Divya Ramesh", d4: "Karthik M", d5: "Sneha Iyer",
          d6: "Vignesh R", d7: "Meena Prakash", d8: "Suresh Babu", d9: "Anitha K", d10: "Rahul Nair",
        };
        if (Array.isArray(settings.siteTestimonials)) {
          const before = settings.siteTestimonials.length;
          settings.siteTestimonials = settings.siteTestimonials.filter(
            (t) => !(t && SAMPLE[t.id] && SAMPLE[t.id] === t.name)
          );
          if (before !== settings.siteTestimonials.length) {
            console.log(`[migrate] Removed ${before - settings.siteTestimonials.length} built-in sample testimonials.`);
          }
        }
        settings.sampleTestimonialsCleaned = true;
        await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(settings)]);
      }
    }
  } catch (err) {
    console.error("[migrate] Failed to clean sample testimonials:", err.message);
  }

  // idx_products_material_set_id is only useful once the column above
  // exists; (re)create it defensively, ignoring "duplicate key name" errors.
  await seedWordingGroups(pool, tableExists);

  try {
    await pool.query("CREATE INDEX idx_products_material_set_id ON products (material_set_id)");
  } catch (err) {
    if (!/Duplicate key name/i.test(err.message)) {
      console.error("[migrate] Failed to ensure idx_products_material_set_id:", err.message);
    }
  }
}

module.exports = { ensureSchema };
