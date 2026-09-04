-- ============================================================
-- 3DCASEMAKERS.IN — MySQL schema (Hostinger)
-- Fresh install — import this ONE file via hPanel -> Databases ->
-- phpMyAdmin -> Import. Includes every feature/table the admin
-- panel and storefront need — no separate migration files required.
-- Payment: Cash on Delivery (COD) only. No Razorpay/online payment.
-- ============================================================
-- If you are updating an EXISTING database (products table already
-- exists), CREATE TABLE IF NOT EXISTS below will NOT widen the
-- `material` column for you. Run this once so the new, longer
-- material-set names (e.g. "Phone Skin with Transparent Case") fit:
--   ALTER TABLE products MODIFY material VARCHAR(64);
-- Also add the material_set_id column (links sibling products created
-- together from one Material Set, e.g. Acrylic Case + Acrylic Gel Case +
-- Phone Skin, so the storefront can switch between them):
--   ALTER TABLE products ADD COLUMN material_set_id VARCHAR(64) DEFAULT NULL;
--   CREATE INDEX idx_products_material_set_id ON products (material_set_id);
-- ============================================================

CREATE TABLE IF NOT EXISTS collections (
  id            VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) NOT NULL UNIQUE,
  image         TEXT,
  banner_mobile TEXT,
  banner_desktop TEXT,
  banner_media_type VARCHAR(10) DEFAULT 'image',
  banner_video_url TEXT,
  description   TEXT,
  is_visible    TINYINT(1) DEFAULT 1,
  is_highlighted TINYINT(1) DEFAULT 0,
  variant_group_id VARCHAR(64) DEFAULT NULL,
  meta_title    VARCHAR(255) NULL,
  meta_description VARCHAR(500) NULL,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subcollections (
  id            VARCHAR(64) PRIMARY KEY,
  collection_id VARCHAR(64) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  image         TEXT,
  display_order INT DEFAULT 0,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id               VARCHAR(64) PRIMARY KEY,
  title            VARCHAR(255) NOT NULL,
  price            DECIMAL(10,2) NOT NULL DEFAULT 0,
  compare_price    DECIMAL(10,2) DEFAULT 0,
  discount         INT DEFAULT 0,
  description      TEXT,
  brand            VARCHAR(100),
  material         VARCHAR(64),
  collection_id    VARCHAR(64),
  tags             TEXT,
  stock_status     ENUM('in_stock','low_stock','out_of_stock') DEFAULT 'in_stock',
  is_featured      TINYINT(1) DEFAULT 0,
  is_trending      TINYINT(1) DEFAULT 0,
  is_new_arrival   TINYINT(1) DEFAULT 0,
  is_best_seller   TINYINT(1) DEFAULT 0,
  is_customizable  TINYINT(1) DEFAULT 0,
  requires_customer_name TINYINT(1) DEFAULT 0,
  customization_json TEXT NULL,
  images            TEXT,
  models            TEXT,
  variant_group_id VARCHAR(64) DEFAULT NULL,
  material_set_id  VARCHAR(64) DEFAULT NULL,
  meta_title       VARCHAR(255) NULL,
  meta_description VARCHAR(500) NULL,
  rating           DECIMAL(2,1) DEFAULT 5.0,
  reviews_count    INT DEFAULT 0,
  display_order    INT DEFAULT 0,
  trending_order    INT DEFAULT 0,
  best_seller_order INT DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
);
CREATE INDEX idx_products_material_set_id ON products (material_set_id);

CREATE TABLE IF NOT EXISTS product_collections (
  product_id    VARCHAR(64) NOT NULL,
  collection_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (product_id, collection_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banners (
  id              VARCHAR(64) PRIMARY KEY,
  title           VARCHAR(255),
  subtitle        VARCHAR(255),
  badge           VARCHAR(100),
  image_url       TEXT,
  mobile_image_url TEXT,
  media_type      VARCHAR(10) DEFAULT 'image',
  video_url       TEXT,
  link            VARCHAR(255),
  active          TINYINT(1) DEFAULT 1,
  display_order   INT DEFAULT 0
);

-- Orders: Cash on Delivery only. payment_status starts 'pending' and is
-- flipped to 'paid' by the admin once the courier collects payment.
CREATE TABLE IF NOT EXISTS orders (
  id                VARCHAR(64) PRIMARY KEY,
  items_json        TEXT NOT NULL,
  subtotal          DECIMAL(10,2) NOT NULL,
  shipping          DECIMAL(10,2) DEFAULT 0,
  total             DECIMAL(10,2) NOT NULL,
  customer_name     VARCHAR(255),
  customer_email    VARCHAR(255),
  customer_phone    VARCHAR(20),
  customer_alt_phone VARCHAR(20),
  shipping_address  TEXT,
  city              VARCHAR(100),
  state             VARCHAR(100),
  pincode           VARCHAR(10),
  payment_method    ENUM('cod') DEFAULT 'cod',
  payment_status    ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
  status            ENUM('pending','processing','ready_to_ship','shipped','out_for_delivery','delivered','cancelled','returned') DEFAULT 'pending',
  -- 'manual' = created by an admin from the Orders tab (phone/WhatsApp/in-person
  -- sale) rather than placed by a customer on the storefront.
  source            ENUM('website','manual') NOT NULL DEFAULT 'website',
  tracking_id       VARCHAR(100),
  preview_requested TINYINT(1) DEFAULT 0,
  preview_requested_at TIMESTAMP NULL DEFAULT NULL,
  is_seen           TINYINT(1) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_orders_created_at ON orders (created_at);

-- Atomic counter behind the "TDC0001" style order ids
CREATE TABLE IF NOT EXISTS order_seq (
  n BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_settings (
  id INT PRIMARY KEY DEFAULT 1,
  settings_json LONGTEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL
);

INSERT IGNORE INTO store_settings (id, settings_json) VALUES (1, JSON_OBJECT());

CREATE TABLE IF NOT EXISTS site_reviews (
  id          VARCHAR(64) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  rating      TINYINT NOT NULL DEFAULT 5,
  comment     TEXT,
  image       TEXT,
  is_approved TINYINT(1) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faqs (
  id            VARCHAR(64) PRIMARY KEY,
  question      VARCHAR(500) NOT NULL,
  answer        TEXT NOT NULL,
  category      VARCHAR(120) NOT NULL DEFAULT 'About 3DCaseMakers',
  display_order INT DEFAULT 0,
  is_visible    TINYINT(1) DEFAULT 1
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id          VARCHAR(64) PRIMARY KEY,
  product_id  VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  rating      TINYINT NOT NULL DEFAULT 5,
  comment     TEXT,
  image       TEXT,
  is_approved TINYINT(1) DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS our_snaps (
  id            VARCHAR(64) PRIMARY KEY,
  image_url     TEXT NOT NULL,
  caption       VARCHAR(255),
  instagram_url VARCHAR(255),
  product_id    VARCHAR(64),
  display_order INT DEFAULT 0,
  is_visible    TINYINT(1) DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS live_visitors (
  session_id  VARCHAR(128) PRIMARY KEY,
  page        VARCHAR(255),
  cart_count  INT DEFAULT 0,
  first_seen  TIMESTAMP NULL DEFAULT NULL,
  page_label  VARCHAR(255) NULL,
  ip_address  VARCHAR(64) NULL,
  city        VARCHAR(120) NULL,
  region      VARCHAR(120) NULL,
  country     VARCHAR(120) NULL,
  last_seen   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS abandoned_carts (
  session_id     VARCHAR(128) PRIMARY KEY,
  customer_name  VARCHAR(255),
  customer_phone VARCHAR(32),
  customer_alt_phone VARCHAR(32) NULL,
  customer_email VARCHAR(255),
  shipping_address VARCHAR(500) NULL,
  apartment      VARCHAR(255) NULL,
  city           VARCHAR(120),
  state          VARCHAR(120) NULL,
  pincode        VARCHAR(16) NULL,
  items_json     TEXT,
  total          DECIMAL(10,2) DEFAULT 0,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visitor_daily_log (
  visit_date  DATE NOT NULL,
  session_id  VARCHAR(128) NOT NULL,
  first_seen  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  landing_page VARCHAR(255) NULL,
  landing_page_label VARCHAR(255) NULL,
  last_page VARCHAR(255) NULL,
  last_page_label VARCHAR(255) NULL,
  traffic_source VARCHAR(100) NULL,
  referrer_raw VARCHAR(500) NULL,
  PRIMARY KEY (visit_date, session_id)
);

-- Meta Pixel + Conversions API (CAPI) + Ads Insights credentials, set via
-- Admin Panel -> Settings -> Meta Ads. access_token is never returned by
-- any public/non-admin API response.
CREATE TABLE IF NOT EXISTS meta_credentials (
  id INT PRIMARY KEY DEFAULT 1,
  pixel_id VARCHAR(64) DEFAULT NULL,
  access_token TEXT DEFAULT NULL,
  ad_account_id VARCHAR(64) DEFAULT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT IGNORE INTO meta_credentials (id, enabled) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS review_stories (
  id            VARCHAR(64) PRIMARY KEY,
  image         TEXT NOT NULL,
  name          VARCHAR(255) NOT NULL DEFAULT '',
  caption       VARCHAR(255),
  video         TEXT NULL,
  media_type    VARCHAR(10) DEFAULT 'image',
  display_order INT DEFAULT 0,
  is_active     TINYINT(1) DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- default FAQs (edit anytime from Admin > FAQs)
INSERT IGNORE INTO faqs (id, question, answer, category, display_order, is_visible) VALUES
('faq-about-1', 'Who is 3DCaseMakers and what do you sell?', '3DCaseMakers is a custom phone case store — we design, print, and ship personalised phone cases (acrylic, glass, gold-finish and more) pan-India.', 'About 3DCaseMakers', 1, 1),
('faq-about-2', 'How can I stay updated on new designs?', 'Follow us on Instagram or subscribe to our newsletter from the homepage footer — new arrivals are posted there first.', 'About 3DCaseMakers', 2, 1),
('faq-custom-1', 'What is Product Customization?', 'On customizable products, you can upload your own photo or type a name, and we print it directly onto the case exactly as previewed.', 'Product Customization', 1, 1),
('faq-custom-2', 'Will I see a preview before my case is printed?', 'Yes — the customization tool shows a live preview of your photo or name on the case before you add it to cart.', 'Product Customization', 2, 1),
('faq-order-1', 'What is the process to place an order?', 'Pick a case, choose your phone model, customize it if needed, add to cart, and checkout with your address and payment details.', 'How to Place Order?', 1, 1),
('faq-order-2', 'How much time will it take to receive my order?', 'Orders are typically dispatched within 2-3 business days and delivered within 5-7 days depending on your location.', 'How to Place Order?', 2, 1),
('faq-pay-1', 'What payment options are available?', 'We currently accept Cash on Delivery (COD) only — pay in cash when your order arrives.', 'Payment and Security', 1, 1),
('faq-ship-1', 'Do you ship all over India?', 'Yes, we deliver pan-India via trusted courier partners.', 'Shipping and Delivery', 1, 1),
('faq-ship-2', 'Do you ship internationally?', 'Currently we only ship within India.', 'Shipping and Delivery', 2, 1),
('faq-return-1', 'Can I cancel my order any time?', 'Since our products are custom-printed, cancellation is only possible before we start processing — please contact us as soon as possible after ordering.', 'Cancellation and Returns', 1, 1),
('faq-return-2', 'What if there is a quality mismatch with what I received?', 'Share photos of the received product within 48 hours of delivery and we will review it for a replacement or refund.', 'Cancellation and Returns', 2, 1);

-- "Report an Issue" queries submitted from the Contact page. Each row is one
-- customer submission; admin replies are sent by email (not stored inline as
-- a thread) but we keep a light record of the last reply so the admin panel
-- can show a "Replied" status + when/what was sent.
CREATE TABLE IF NOT EXISTS contact_queries (
  id            VARCHAR(64) PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  phone         VARCHAR(30) NOT NULL,
  message       TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'new',   -- new | reviewed | replied
  reply_message TEXT NULL,
  replied_at    TIMESTAMP NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Log of every outbound email actually sent by the two Gmail SMTP mailboxes
-- this store uses (EMAIL_USER e.g. 3dcasemakers@gmail.com, and
-- ORDERS_EMAIL_USER e.g. 3dcasemakers.orders@gmail.com). One row per
-- successful send. Powers Admin -> Gmail Manager: today's send count per
-- mailbox against Gmail's 500-emails/24hr SMTP sending limit.
CREATE TABLE IF NOT EXISTS email_send_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  mailbox     VARCHAR(255) NOT NULL,   -- the "from" address that sent it
  category    VARCHAR(40)  NOT NULL,   -- order_confirmation | status_update | contact_reply | owner_new_order | daily_report
  sent_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_send_log_mailbox_sent_at (mailbox, sent_at)
);

-- ============================================================
-- Manage Stocks: per (product, phone model) quantity on hand, plus a full
-- inward/outward movement log. stock_levels is the current-quantity table
-- (one row per product+model); stock_movements is the append-only ledger
-- that both builds those quantities and gives the admin a stock history.
-- ============================================================
-- Fully standalone stock register: product_name/model are free text typed by
-- the admin, with NO foreign key into `products` and NO link to the
-- storefront's Products or Phone Models lists.
CREATE TABLE IF NOT EXISTS stock_levels (
  id            VARCHAR(64) PRIMARY KEY,
  product_name  VARCHAR(255) NOT NULL,
  model         VARCHAR(255) NOT NULL DEFAULT 'General',
  quantity      INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_stock_product_model (product_name, model)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id            VARCHAR(64) PRIMARY KEY,
  type          ENUM('inward','outward') NOT NULL,
  product_name  VARCHAR(255) NOT NULL,
  model         VARCHAR(255) NOT NULL DEFAULT 'General',
  quantity      INT NOT NULL,
  channel       VARCHAR(20) NULL,     -- outward only: 'website' | 'offline'
  note          VARCHAR(500) NULL,
  unit_price    DECIMAL(10,2) NULL,   -- price per unit at time of movement (POS bill price details)
  total_price   DECIMAL(10,2) NULL,   -- quantity * unit_price
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_stock_movements_created_at ON stock_movements (created_at);
CREATE INDEX idx_stock_movements_product_name ON stock_movements (product_name);
