const { sendOrderConfirmationEmail, sendOwnerNewOrderNotification } = require("./emailService");

// Fire-and-forget customer + owner emails for a freshly PAID storefront order.
// Never throws: an email problem must not affect an order that is already saved.
function sendNewOrderEmails(o, id) {
  const items = Array.isArray(o.items) ? o.items : [];
  const quantity = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
  sendOrderConfirmationEmail({
    orderId: id,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    items,
    quantity,
    totalAmount: o.total || 0,
    subtotal: o.subtotal,
    shipping: Number(o.shipping) || 0,
    shippingAddress: o.shippingAddress,
    city: o.city,
    state: o.state,
    courier: o.courier,
    pincode: o.pincode,
    orderDate: new Date(),
    paymentMethod: "online",
  }).catch((err) => console.error(`[email] confirmation failed for order ${id}:`, err.message));

  sendOwnerNewOrderNotification({
    orderId: id,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    totalAmount: o.total || 0,
    subtotal: o.subtotal,
    shipping: Number(o.shipping) || 0,
    shippingAddress: o.shippingAddress,
    city: o.city,
    state: o.state,
    courier: o.courier,
    pincode: o.pincode,
    orderDate: new Date(),
    items,
    paymentMethod: "online",
  }).catch((err) => console.error(`[email] owner notification failed for order ${id}:`, err.message));
}

module.exports = { sendNewOrderEmails };
