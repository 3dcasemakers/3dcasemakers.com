import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../src/utils/productDefaults.ts", import.meta.url), "utf8");
const code = stripTypeScriptTypes(source);
const { defaultProductCollection, collectionProductTitle, titleAfterCollectionChange, rememberProductCollection } =
  await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const collections = [{ id: "gold", name: "Gold Cases" }, { id: "gel", name: "Gold Gel Cases" }, { id: "custom", name: "Custom Designs" }];
const products = [
  { collectionId: "gold", material: "Gold Case", createdAt: "2026-01-01", updatedAt: "2026-10-03" },
  { collectionId: "custom", material: "Gold Case", createdAt: "2026-02-01" },
  { collectionId: "deleted", material: "Gold Case", createdAt: "2026-03-01" },
];

assert.equal(defaultProductCollection(collections, [], "Gold Case"), "gold");
assert.equal(defaultProductCollection(collections, products, "Gold Case"), "custom");
rememberProductCollection("gold", "Gold Case");
rememberProductCollection("gel", "Gold Gel Case");
assert.equal(defaultProductCollection(collections, products, "Gold Case"), "gold");
assert.equal(defaultProductCollection(collections, products, "Gold Gel Case"), "gel");
assert.equal(defaultProductCollection(collections, products), "gel");
assert.equal(defaultProductCollection(collections.filter((c) => c.id !== "gold"), products, "Gold Case"), "custom");
assert.equal(collectionProductTitle(collections, "custom"), "Custom Designs");
assert.equal(titleAfterCollectionChange("Gold Cases", "Gold Cases", "Custom Designs"), "Custom Designs");
assert.equal(titleAfterCollectionChange("My Own Design", "Gold Cases", "Custom Designs"), "My Own Design");
assert.equal(titleAfterCollectionChange("  ", "Gold Cases", "Custom Designs"), "Custom Designs");
assert.equal(titleAfterCollectionChange("Gold Cases", "Gold Cases", ""), "");
storage.set("3dcasemakers_product_collections", "invalid JSON");
assert.equal(defaultProductCollection(collections, products, "Gold Case"), "custom");
globalThis.localStorage = { getItem() { throw new Error("Storage disabled"); }, setItem() { throw new Error("Storage disabled"); } };
assert.doesNotThrow(() => rememberProductCollection("gold", "Gold Case"));
assert.equal(defaultProductCollection([], products, "Gold Case"), "");
console.log("Product defaults: 14 regression checks passed.");
