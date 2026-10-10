// Deterministic regression checks; never connects to MySQL, SMTP or production.
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { storeDate, periodRange, zeroFillDates, orderDiscount, itemQuantity, reportRange, zeroFillMonths } = require("../src/utils/analyticsPeriods");
const { publicSettings, validateSettings } = require("../src/utils/settingsValidation");
const { orderAccessToken, hasOrderAccess, publicItems } = require("../src/utils/orderAccess");
const { getIp, rateLimit } = require("../src/middleware/rateLimit");
const { fileSignatureMatches } = require("../src/utils/uploadSignature");

process.env.JWT_SECRET = "local-regression-secret-please-never-deploy";
let checks = 0;
function check(label, fn) { fn(); checks++; console.log(`PASS ${label}`); }

check("IST rolls over independently of host timezone", () => {
  assert.equal(storeDate(new Date("2026-10-03T18:29:59Z")), "2026-10-03");
  assert.equal(storeDate(new Date("2026-10-03T18:30:00Z")), "2026-10-04");
});
check("last week crosses ISO week-year boundary", () => {
  const r = periodRange("last_week", new Date("2027-01-04T06:00:00Z"));
  assert.deepEqual([r.start, r.end], ["2026-12-28", "2027-01-04"]);
});
check("yesterday chart does not include today", () => {
  const r = periodRange("yesterday", new Date("2026-10-04T06:00:00Z"));
  assert.deepEqual(zeroFillDates([], r.start, r.end), [{ day: "2026-10-03", revenue: 0, orders: 0 }]);
});
check("last month uses exact calendar month", () => {
  const r = periodRange("last_month", new Date("2026-03-10T06:00:00Z"));
  const days = zeroFillDates([{ day: "2026-02-12", revenue: "599.50", orders: "2" }], r.start, r.end);
  assert.equal(days.length, 28);
  assert.equal(days[11].revenue, 599.5);
  assert.equal(days.at(-1).day, "2026-02-28");
});
check("rolling month preserves valid month-end", () => {
  assert.equal(periodRange("last_1_year", new Date("2024-02-29T06:00:00Z")).start, "2023-02-28");
});
check("reports scope totals and zero-fill 24 calendar months", () => {
  const r = reportRange(3, new Date("2026-10-04T06:00:00Z"));
  assert.equal(r.start, "2026-08-01");
  const months = zeroFillMonths([{ month: "2026-09", revenue: "200", orders: "2" }], r.historyStart, r.end);
  assert.equal(months.length, 24);
  assert.equal(months.at(-2).revenue, 200);
  assert.equal(months.at(-1).revenue, 0);
});
check("export reconstructs actual applied discounts", () => assert.equal(orderDiscount({ subtotal: "999", shipping: "100", total: "949" }), 150));
check("quantities are numeric and invalid values do not inflate sales", () => {
  assert.equal(itemQuantity({ quantity: "3" }), 3);
  assert.equal(itemQuantity({ quantity: -4 }), 0);
  assert.equal(itemQuantity({ quantity: "oops" }), 0);
});
check("public settings remove nested credentials, preserve public IDs", () => {
  const result = publicSettings({ logoText: "Store", metaPixelId: "123", metaAccessToken: "private", integrations: [{ apiKey: "private", id: "public" }], emailPassword: "private" });
  assert.deepEqual(result, { logoText: "Store", metaPixelId: "123", integrations: [{ id: "public" }] });
});
check("financial settings reject negative rates and duplicate states", () => {
  assert.match(validateSettings({ shippingFallbackRate: -1 }), /non-negative/);
  assert.match(validateSettings({ shippingZones: [{ rate: 0, states: ["Tamil Nadu"] }, { rate: 100, states: [" tamil nadu "] }] }), /more than one/);
  assert.match(validateSettings({ offers: [{ minQty: 0, discountAmount: 100 }] }), /positive/);
  assert.equal(validateSettings({ offers: [], shippingFallbackRate: 0 }), null);
});
check("prototype keys cannot be saved in settings", () => assert.match(validateSettings(JSON.parse('{"nested":{"__proto__":{"polluted":true}}}')), /invalid key/));
check("order access tokens are tied to the exact order", () => {
  const token = orderAccessToken("TDC0001");
  assert.equal(hasOrderAccess("TDC0001", token), true);
  assert.equal(hasOrderAccess("TDC0002", token), false);
  assert.equal(hasOrderAccess("TDC0001", "invalid"), false);
});
check("public order items omit customer photos, names and variant text", () => {
  const rows = publicItems([{ product: { id: "a", title: "Case", price: 499, images: ["/public.jpg"] }, quantity: 1, selectedModel: "Samsung", customImage: "/private.jpg", customName: "Name", customVariant: 'Text: "Secret"' }]);
  assert.equal(JSON.stringify(rows).includes("private"), false);
  assert.equal(JSON.stringify(rows).includes("Secret"), false);
  assert.equal(rows[0].customName, undefined);
});
check("uploads reject renamed HTML and accept real image signatures", () => {
  assert.equal(fileSignatureMatches("image/png", Buffer.from('<html><script>alert(1)</script>')), false);
  assert.equal(fileSignatureMatches("image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.equal(fileSignatureMatches("image/jpeg", Buffer.from([255, 216, 255, 224])), true);
  assert.equal(fileSignatureMatches("image/webp", Buffer.from("RIFF0000WEBP0000")), true);
  assert.equal(fileSignatureMatches("image/png", Buffer.from("GIF89a")), false);
});
check("rate limiting uses resolved trusted proxy IP", () => {
  assert.equal(getIp({ ip: "1.2.3.4", headers: { "x-forwarded-for": "spoof, 1.2.3.4" }, socket: { remoteAddress: "proxy" } }), "1.2.3.4");
  const limiter = rateLimit({ windowMs: 60000, max: 1 });
  const res = response();
  let allowed = 0;
  limiter({ ip: "1.2.3.4" }, res, () => allowed++);
  limiter({ ip: "1.2.3.4" }, res, () => allowed++);
  assert.equal(allowed, 1);
  assert.equal(res.statusCode, 429);
});

function response() { return { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(s) { this.statusCode = s; return this; }, json(value) { this.body = value; return this; } }; }
function mockModule(relative, exports) { const filename = require.resolve(relative); require.cache[filename] = { id: filename, filename, loaded: true, exports }; }
let queryHandler;
const db = { query: (...args) => queryHandler(...args), getConnection: async () => { throw new Error("Unexpected database connection"); } };
mockModule("../src/config/db", db);
const { priceStorefrontOrder } = require("../src/services/orderPricing");
const { requireAdmin } = require("../src/middleware/auth");
check("JWT authorization rejects algorithm and missing admin identity", () => {
  const res = response(); let allowed = false;
  requireAdmin({ headers: { authorization: `Bearer ${jwt.sign({ id: 1, email: "admin@example.com" }, process.env.JWT_SECRET, { algorithm: "HS384" })}` } }, res, () => allowed = true);
  assert.equal(allowed, false); assert.equal(res.statusCode, 401);
  const invalid = response();
  requireAdmin({ headers: { authorization: `Bearer ${jwt.sign({ hello: "world" }, process.env.JWT_SECRET)}` } }, invalid, () => allowed = true);
  assert.equal(invalid.statusCode, 401);
});

function routeHandler(router, method, route) {
  const layer = router.stack.find((l) => l.route?.path === route && l.route.methods[method]);
  assert.ok(layer, `${method} ${route} exists`);
  return layer.route.stack.at(-1).handle;
}
async function asyncCheck(label, fn) { await fn(); checks++; console.log(`PASS ${label}`); }

async function main() {
  let product = { id: "a", title: "Case", price: "499.00", compare_price: "999", images: '["/catalog.jpg"]', stock_status: "in_stock", material: "Gold Gel Case", is_photo_frame: 0 };
  let settings = { offers: [{ enabled: true, minQty: 2, discountAmount: 100 }], shippingZones: [{ states: ["Tamil Nadu"], rate: 0 }] };
  queryHandler = async (sql) => sql.includes("FROM products") ? [[product]] : [[{ settings_json: JSON.stringify(settings) }]];
  const input = { items: [{ product: { id: "a", price: 1 }, quantity: 2, selectedModel: "iPhone 15", customVariant: 'Text: "Hari" — Gold Plate (+₹99)' }], state: "Tamil Nadu" };
  await asyncCheck("client price cannot bypass paid Gel text plate", async () => {
    const priced = await priceStorefrontOrder(input);
    assert.equal(priced.items[0].product.price, 598);
    assert.equal(priced.subtotal, 1196); assert.equal(priced.discount, 100); assert.equal(priced.total, 1096);
  });
  await asyncCheck("non-Gel product does not receive false plate surcharge", async () => {
    product.material = "Gold Case";
    assert.equal((await priceStorefrontOrder(input)).items[0].product.price, 499);
  });
  await asyncCheck("free-print text mentioning Gold Plate does not receive surcharge", async () => {
    product.material = "Gold Gel Case";
    const priced = await priceStorefrontOrder({ ...input, items: [{ ...input.items[0], customVariant: 'Text: "Gold Plate" — Print (Free)' }] });
    assert.equal(priced.items[0].product.price, 499);
  });
  await asyncCheck("photo frame size price comes from database", async () => {
    product = { ...product, is_photo_frame: 1, frame_sizes_json: '[{"label":"8x12","price":799,"comparePrice":999}]' };
    const priced = await priceStorefrontOrder({ ...input, items: [{ product: { id: "a", price: 1 }, quantity: 1, selectedModel: "Size: 8x12" }] });
    assert.equal(priced.total, 799);
    await assert.rejects(priceStorefrontOrder(input), /valid size/);
  });
  await asyncCheck("invalid cart quantities are rejected", async () => {
    product.is_photo_frame = 0;
    await assert.rejects(priceStorefrontOrder({ ...input, items: [{ ...input.items[0], quantity: 0 }] }), /quantity/);
    await assert.rejects(priceStorefrontOrder({ ...input, items: [{ ...input.items[0], quantity: 1.5 }] }), /quantity/);
    await assert.rejects(priceStorefrontOrder({ ...input, items: [{ ...input.items[0], quantity: 51 }] }), /quantity/);
  });
  await asyncCheck("checkout fails safely when saved shipping settings cannot be read", async () => {
    queryHandler = async (sql) => { if (sql.includes("FROM products")) return [[product]]; throw new Error("DB unavailable"); };
    await assert.rejects(priceStorefrontOrder(input), /DB unavailable/);
  });
  const emails = { sendOrderConfirmationEmail: async () => ({ sent: true }), sendOrderStatusUpdateEmail: async () => ({ sent: true }), sendOwnerNewOrderNotification: async () => ({ sent: true }) };
  mockModule("../src/services/emailService", emails);
  mockModule("../src/services/orderService", { createOrder: async () => ({ id: "TDC0001" }) });
  const orders = require("../src/routes/orders");
  const order = { id: "TDC0001", items_json: JSON.stringify([{ product: { id: "a", title: "Case", price: 499, images: ["/catalog.jpg"] }, quantity: 2, customImage: "/private.jpg", customName: "Private Name" }]), subtotal: 998, shipping: 0, total: 898, customer_name: "Private Customer", customer_phone: "9876543210", status: "pending" };
  queryHandler = async () => [[order]];
  await asyncCheck("guessed order ID never exposes private receipt fields", async () => {
    const res = response();
    await routeHandler(orders, "get", "/:id")({ params: { id: order.id }, headers: {} }, res);
    assert.equal(res.body.customerName, undefined);
    assert.equal(JSON.stringify(res.body).includes("private.jpg"), false);
    assert.equal(res.body.hasCustomizedItem, true);
  });
  await asyncCheck("order owner token reveals the correct customized receipt", async () => {
    const res = response();
    await routeHandler(orders, "get", "/:id")({ params: { id: order.id }, headers: { "x-order-access": orderAccessToken(order.id) } }, res);
    assert.equal(res.body.customerName, "Private Customer");
    assert.equal(res.body.items[0].customImage, "/private.jpg");
  });
  await asyncCheck("tracking rejects wrong phone and verifies correct phone", async () => {
    const handler = routeHandler(orders, "post", "/track");
    const bad = response(); await handler({ body: { orderId: order.id, customerPhone: "1234567890" } }, bad); assert.equal(bad.statusCode, 404);
    const good = response(); await handler({ body: { orderId: order.id, customerPhone: "+91 9876543210" } }, good); assert.equal(hasOrderAccess(order.id, good.body.accessToken), true);
  });
  await asyncCheck("guessed IDs cannot request customer previews", async () => {
    let mutations = 0;
    queryHandler = async (sql) => { if (sql.startsWith("UPDATE")) { mutations++; return [{ affectedRows: 1 }]; } return [[order]]; };
    const handler = routeHandler(orders, "put", "/:id/request-preview");
    const bad = response(); await handler({ params: { id: order.id }, headers: {}, body: {} }, bad); assert.equal(bad.statusCode, 403); assert.equal(mutations, 0);
    const good = response(); await handler({ params: { id: order.id }, headers: { "x-order-access": orderAccessToken(order.id) }, body: {} }, good); assert.equal(good.body.success, true); assert.equal(mutations, 1);
  });
  await asyncCheck("payment controls reject refunding an unpaid order", async () => {
    let changes = 0;
    queryHandler = async (sql) => sql.startsWith("UPDATE") ? (changes++, [{ affectedRows: 1 }]) : [[{ payment_status: "pending" }]];
    const handler = routeHandler(orders, "put", "/:id/payment");
    const bad = response(); await handler({ params: { id: order.id }, body: { paymentStatus: "refunded" } }, bad); assert.equal(bad.statusCode, 400); assert.equal(changes, 0);
    const good = response(); await handler({ params: { id: order.id }, body: { paymentStatus: "paid" } }, good); assert.equal(good.body.paymentStatus, "paid"); assert.equal(changes, 1);
  });
  await asyncCheck("public checkout response returns stored pricing and receipt token", async () => {
    settings = {}; product.is_photo_frame = 0; product.material = "Gold Case";
    queryHandler = async (sql) => sql.includes("FROM products") ? [[product]] : [[{ settings_json: JSON.stringify(settings) }]];
    const res = response();
    await routeHandler(orders, "post", "/")({ body: { items: [{ product: { id: "a", price: 1 }, quantity: 1, selectedModel: "iPhone" }], customerName: "Test", customerPhone: "9876543210", shippingAddress: "Address", city: "Chennai", state: "Tamil Nadu", pincode: "600001", total: 1 } }, res);
    assert.equal(res.statusCode, 201); assert.equal(res.body.total, 499); assert.equal(hasOrderAccess(res.body.id, res.body.accessToken), true);
  });
  const analytics = require("../src/routes/analytics");
  await asyncCheck("sold-today sums quantities rather than cart lines", async () => {
    queryHandler = async (sql) => sql.includes("live_visitors") ? [[{ viewing: 1 }]] : [[{ items_json: '[{"quantity":3},{"quantity":2}]' }, { items_json: "broken" }]];
    const res = response(); await routeHandler(analytics, "get", "/live")({}, res); assert.equal(res.body.soldToday, 5);
  });
  await asyncCheck("customer report excludes cancelled and returned spend and reports actual discount", async () => {
    queryHandler = async () => [[order, { ...order, id: "TDC0002", status: "cancelled", total: 1000 }, { ...order, id: "TDC0003", status: "returned", total: 1000 }]];
    const res = response(); await routeHandler(analytics, "get", "/export-data")({ query: { period: "all_time" } }, res);
    assert.equal(res.body.summary.totalRevenue, 898); assert.equal(res.body.customerRows[0].orderCount, 1); assert.equal(res.body.customerRows[0].totalSpent, 898);
    assert.equal(res.body.salesRows[0].discount, 100); assert.equal(res.body.summary.cancelledOrders, 1); assert.equal(res.body.summary.returnedOrders, 1);
  });
  await asyncCheck("bad visitor input is rejected before database write", async () => {
    let writes = 0; queryHandler = async () => { writes++; return [[]]; };
    const res = response(); await routeHandler(analytics, "post", "/heartbeat")({ body: { sessionId: "valid-session", cartCount: -1 } }, res); assert.equal(res.statusCode, 400); assert.equal(writes, 0);
  });
  await asyncCheck("visitor period charts match chosen sales periods", async () => {
    const queries = [];
    queryHandler = async (sql) => { queries.push(sql); if (sql.includes("as total")) return [[{ total: 0 }]]; return [[]]; };
    const res = response(); await routeHandler(analytics, "get", "/visitor-analytics")({ query: { period: "last_week" } }, res);
    const range = periodRange("last_week");
    assert.equal(res.body.period, "last_week"); assert.equal(res.body.byDay.length, 7); assert.equal(res.body.byDay[0].date, range.start);
    assert.ok(queries.every((sql) => sql.includes(range.start) && sql.includes(range.end)));
    assert.ok(queries.some((sql) => sql.includes("MIN(visit_date)"))); assert.ok(queries.some((sql) => sql.includes("MAX(visit_date)")));
  });
  await asyncCheck("dashboard products and revenue chart are scoped to selected period", async () => {
    const queries = [];
    queryHandler = async (sql) => { queries.push(sql); if (sql.includes("GROUP BY") || sql.startsWith("SELECT items_json")) return [[]]; return [[{}]]; };
    const res = response(); await routeHandler(analytics, "get", "/dashboard")({ query: { period: "yesterday" } }, res);
    assert.equal(res.body.dailyRevenue.length, 1); assert.equal(res.body.dailyRevenue[0].day, periodRange("yesterday").start);
    const productQuery = queries.find((sql) => sql.startsWith("SELECT items_json")); assert.ok(productQuery.includes(periodRange("yesterday").where)); assert.ok(productQuery.includes("returned"));
  });
  await asyncCheck("same phone model in multiple lines counts one order", async () => {
    queryHandler = async () => [[{ items_json: '[{"selectedModel":"iPhone","quantity":"2","product":{"price":100}},{"selectedModel":"iPhone","quantity":3,"product":{"price":100}}]' }]];
    const res = response(); await routeHandler(analytics, "get", "/top-phone-models")({ query: { period: "all" } }, res);
    assert.equal(res.body.models[0].orders, 1); assert.equal(res.body.models[0].qty, 5);
  });
  await asyncCheck("settings merges preserve simultaneous tabs and null values", async () => {
    let saved = { uiCornerStyleVersion: 1, uiBannerCorners: "hard", uiCollectionBannerCorners: "hard", logoText: "Store", metaAccessToken: "private" };
    let lock = Promise.resolve();
    db.getConnection = async () => {
      let unlock;
      const connection = {
        beginTransaction: async () => {},
        query: async (sql, params) => {
          if (sql.includes("FOR UPDATE")) { const previous = lock; lock = new Promise((resolve) => unlock = resolve); await previous; return [[{ settings_json: JSON.stringify(saved) }]]; }
          if (sql.startsWith("INSERT INTO")) saved = JSON.parse(params[0]);
          return [{}];
        },
        commit: async () => { unlock(); }, rollback: async () => { if (unlock) unlock(); }, release: () => {},
      };
      return connection;
    };
    const settingsRouter = require("../src/routes/settings");
    const handler = routeHandler(settingsRouter, "post", "/merge");
    const a = response(); const b = response();
    await Promise.all([handler({ body: { logoText: "Updated" } }, a), handler({ body: { announcementText: "Sale", announcementLink: null } }, b)]);
    assert.equal(a.body.success, true); assert.equal(b.body.success, true); assert.equal(saved.logoText, "Updated"); assert.equal(saved.announcementText, "Sale"); assert.equal(saved.announcementLink, null); assert.equal(saved.metaAccessToken, "private");
  });
  check("uploads resolve one shared backend folder", () => {
    delete process.env.UPLOAD_DIR;
    assert.equal(require("../src/config/uploads").uploadDir, path.resolve(__dirname, "../uploads"));
  });
  await asyncCheck("Meta purchase cannot be forged and uses trusted order values", async () => {
    mockModule("../src/config/metaCredentials", { getMetaCredentials: async () => ({ pixelId: "test-pixel", accessToken: "test-token", enabled: true }) });
    const meta = require("../src/routes/metaAds");
    const handler = routeHandler(meta, "post", "/capi");
    let payload; const previousFetch = global.fetch;
    global.fetch = async (url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({ events_received: 1 }) }; };
    try {
      queryHandler = async () => [[{ ...order, created_at: "2026-10-04 10:00:00" }]];
      const bad = response(); await handler({ body: { eventName: "Purchase", eventId: "fake", orderId: order.id, total: 1 }, headers: {}, ip: "127.0.0.1" }, bad); assert.equal(bad.statusCode, 403); assert.equal(payload, undefined);
      const good = response(); await handler({ body: { eventName: "Purchase", eventId: "fake", orderId: order.id, total: 1 }, headers: { "x-order-access": orderAccessToken(order.id) }, ip: "127.0.0.1" }, good);
      assert.equal(good.body.success, true); assert.equal(payload.data[0].event_id, `purchase_${order.id}`); assert.equal(payload.data[0].custom_data.value, 898); assert.equal(payload.data[0].custom_data.num_items, 2);
    } finally { global.fetch = previousFetch; }
  });
  console.log(`\nBackend reliability: ${checks} regression checks passed. No external services used.`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
