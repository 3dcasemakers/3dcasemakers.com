// Tamil Nadu courier choice regression: ST Courier = free, Post Office = Rs 99,
// default (missing/unknown) = ST Courier, other states ignore the choice.
// Run: node scripts/testCourierShipping.js
const assert = require("assert");
const path = require("path");
const dbPath = path.resolve(__dirname, "../src/config/db.js");
const frame = { id: "f", title: "Frame", price: 0, images: "[]", stock_status: "in_stock", is_photo_frame: 1, frame_sizes_json: JSON.stringify([{ label: "8x12", price: 500 }]) };
const kase = { id: "c", title: "Case", price: 299, images: "[]", stock_status: "in_stock", material: "Acrylic", is_photo_frame: 0 };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (sql) => (sql.includes("FROM products") ? [[frame, kase]] : [[{ settings_json: "{}" }]]) } };
const { priceStorefrontOrder } = require("../src/services/orderPricing");
const { resolveCourier, courierInfo } = require("../src/utils/courier");
const line = (id) => ({ product: { id }, quantity: 1, selectedModel: id === "f" ? "Size: 8x12" : "iPhone" });
const run = (ids, state, courier) => priceStorefrontOrder({ items: ids.map(line), state, courier });
(async () => {
  let r = await run(["c"], "Tamil Nadu", "st_courier");
  assert.equal(r.shipping, 0); assert.equal(r.total, 299); assert.equal(r.courier, "st_courier");
  r = await run(["c"], "Tamil Nadu", "post_office");
  assert.equal(r.shipping, 99); assert.equal(r.total, 398); assert.equal(r.courier, "post_office");
  r = await run(["c"], "Tamil Nadu");
  assert.equal(r.shipping, 0); assert.equal(r.courier, "st_courier");
  r = await run(["c"], "tamil nadu", "bogus");
  assert.equal(r.shipping, 0); assert.equal(r.courier, "st_courier");
  r = await run(["f"], "Tamil Nadu", "post_office");
  assert.equal(r.shipping, 99); assert.equal(r.total, 599);
  // Mixed cart (phone case + photo frame): TN / Puducherry ST 149, Post Office 199.
  r = await run(["c", "f"], "Tamil Nadu", "st_courier");
  assert.equal(r.shipping, 149); assert.equal(r.courier, "st_courier");
  r = await run(["c", "f"], "Tamil Nadu", "post_office");
  assert.equal(r.shipping, 199); assert.equal(r.courier, "post_office");
  r = await run(["c", "f"], "Tamil Nadu");
  assert.equal(r.shipping, 149); assert.equal(r.courier, "st_courier");
  r = await run(["c", "f"], "Puducherry", "post_office");
  assert.equal(r.shipping, 199); assert.equal(r.courier, "post_office");
  r = await run(["c", "f"], "Puducherry", "st_courier");
  assert.equal(r.shipping, 149);
  // Mixed cart in Kerala: single option, Post Office 149 (browser choice ignored).
  r = await run(["c", "f"], "Kerala", "st_courier");
  assert.equal(r.shipping, 149); assert.equal(r.courier, "post_office");
  r = await run(["c", "f"], "kerala");
  assert.equal(r.shipping, 149); assert.equal(r.courier, "post_office");
  // Kerala single-type carts are unchanged and carry no courier.
  r = await run(["f"], "Kerala"); assert.equal(r.shipping, 149); assert.equal(r.courier, null);
  // Other states: courier choice is ignored, zone rate unchanged.
  r = await run(["c"], "Kerala", "post_office");
  assert.equal(r.shipping, 99); assert.equal(r.courier, null);
  r = await run(["c"], "Maharashtra", "st_courier");
  assert.equal(r.shipping, 109); assert.equal(r.courier, null);
  // Puducherry gets the same choice as Tamil Nadu.
  r = await run(["c"], "Puducherry", "post_office");
  assert.equal(r.shipping, 99); assert.equal(r.courier, "post_office");
  r = await run(["c"], "Puducherry", "st_courier");
  assert.equal(r.shipping, 0); assert.equal(r.courier, "st_courier");
  r = await run(["c"], "Puducherry");
  assert.equal(r.shipping, 0); assert.equal(r.courier, "st_courier");
  assert.equal(resolveCourier("Tamil Nadu", "POST_OFFICE"), "post_office");
  assert.equal(courierInfo("Kerala", null).name, "India Post");
  assert.equal(courierInfo("Kerala", "post_office").name, "Post Office");
  assert.equal(courierInfo("Tamil Nadu", "post_office").name, "Post Office");
  assert.equal(courierInfo("Tamil Nadu", null).name, "ST Courier");
  console.log("Courier shipping: all checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
