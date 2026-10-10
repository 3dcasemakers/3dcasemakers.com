// Photo Frame shipping regression: TN & Puducherry free, Kerala/Karnataka 149, others 199.
// Phone cases keep the zone rate; mixed carts pay the frame rate only. Run: node scripts/testPhotoFrameShipping.js
const assert = require("assert");
const path = require("path");
const dbPath = path.resolve(__dirname, "../src/config/db.js");
const frame = { id: "f", title: "Frame", price: 0, images: "[]", stock_status: "in_stock", is_photo_frame: 1, frame_sizes_json: JSON.stringify([{ label: "8x12", price: 500 }]) };
const kase = { id: "c", title: "Case", price: 299, images: "[]", stock_status: "in_stock", material: "Acrylic", is_photo_frame: 0 };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (sql) => (sql.includes("FROM products") ? [[frame, kase]] : [[{ settings_json: "{}" }]]) } };
const { priceStorefrontOrder } = require("../src/services/orderPricing");
const line = (id) => ({ product: { id }, quantity: 1, selectedModel: id === "f" ? "Size: 8x12" : "iPhone" });
const price = (ids, state) => priceStorefrontOrder({ items: ids.map(line), state }).then((r) => r.shipping);
(async () => {
  const frameExpect = { "Tamil Nadu": 0, Puducherry: 0, Kerala: 149, Karnataka: 149, Maharashtra: 199, Delhi: 199, "Andhra Pradesh": 199 };
  for (const [st, v] of Object.entries(frameExpect)) assert.equal(await price(["f"], st), v, `frame ${st}`);
  assert.equal(await price(["f"], "tamil nadu"), 0);
  assert.equal(await price(["f"], ""), 199);
  assert.equal(await price(["c"], "Kerala"), 99);
  assert.equal(await price(["c"], "Tamil Nadu"), 0);
  assert.equal(await price(["c", "f"], "Kerala"), 149);
  assert.equal(await price(["c", "f"], "Maharashtra"), 199);
  assert.equal(await price(["f", "c"], "Karnataka"), 149);
  // Mixed cart in Tamil Nadu now follows the courier rule: default ST Courier = 149.
  assert.equal(await price(["c", "f"], "Tamil Nadu"), 149);
  console.log("Photo frame shipping: all checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
