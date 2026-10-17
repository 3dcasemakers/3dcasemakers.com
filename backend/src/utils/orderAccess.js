const crypto = require("node:crypto");

function orderAccessToken(id) {
  const secret = process.env.ORDER_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(`order-access:v1:${id}`).digest("hex");
}

function hasOrderAccess(id, supplied) {
  const expected = orderAccessToken(id);
  if (!expected || typeof supplied !== "string" || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

function publicItems(items) {
  return items.map((item) => ({
    product: {
      id: item.product?.id || item.productId || "",
      title: item.product?.id === "manual" ? "Manually Created Order" : item.product?.title || item.title || "Product",
      price: Number(item.product?.price ?? item.price) || 0,
      images: Array.isArray(item.product?.images) ? item.product.images.slice(0, 1) : [],
      material: item.product?.material || "",
    },
    quantity: Number(item.quantity) || 1,
    selectedModel: item.selectedModel || "",
  }));
}

module.exports = { orderAccessToken, hasOrderAccess, publicItems };
