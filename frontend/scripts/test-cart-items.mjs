import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../src/utils/cartItems.ts", import.meta.url), "utf8");
const { cartItemKey, restoreCart, setCartItemQuantity } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`);
const first = { product: { id: "p1", title: "Custom Case", price: 499, comparePrice: 499, images: [], models: [] }, quantity: 1, selectedModel: "iPhone 15", customName: "Hari", customImage: "/uploads/a.png" };
const second = { ...first, customName: "Priya", customImage: "/uploads/b.png" };
assert.notEqual(cartItemKey(first), cartItemKey(second));
assert.deepEqual(setCartItemQuantity([first, second], first, 0), [second]);
assert.deepEqual(setCartItemQuantity([first, second], second, 3), [first, { ...second, quantity: 3 }]);
assert.deepEqual(setCartItemQuantity([first], first, 51), [first]);
assert.deepEqual(setCartItemQuantity([first], first, 1.5), [first]);
assert.deepEqual(restoreCart(JSON.stringify([first, second])), [first, second]);
for (const corrupt of ["null", "{}", "not json", "[null]", JSON.stringify([{ ...first, quantity: -1 }]), JSON.stringify([{ ...first, product: null }]), JSON.stringify([{ ...first, customName: {} }])]) assert.deepEqual(restoreCart(corrupt), []);
assert.deepEqual(restoreCart(JSON.stringify([{ ...first, product: { ...first.product, images: "bad", models: null } }]))[0].product.images, []);
assert.equal(restoreCart(JSON.stringify(Array.from({ length: 51 }, () => first))).length, 50);
console.log("Cart regression checks passed: independent custom lines, quantity limits and corrupt storage.");
