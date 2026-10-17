// Quick local test for the order-confirmation email, without placing a real
// order. Two modes:
//
//   node scripts/testOrderEmail.js            -> writes a preview HTML file
//                                                 you can open in a browser
//                                                 (no email actually sent,
//                                                 no Gmail credentials needed)
//
//   node scripts/testOrderEmail.js --send you@example.com
//                                              -> actually sends a real test
//                                                 email via Gmail SMTP to the
//                                                 address you pass (requires
//                                                 EMAIL_USER/EMAIL_PASS to be
//                                                 set in backend/.env)
//
// Run from the backend/ folder: `node scripts/testOrderEmail.js`
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { sendOrderConfirmationEmail, buildOrderConfirmationHtml, isEmailConfigured } = require("../src/services/emailService");

const FAKE_ORDER = {
  orderId: "TDC0001",
  customerName: "Test Customer",
  customerEmail: process.argv.includes("--send") ? process.argv[process.argv.indexOf("--send") + 1] : "test@example.com",
  items: [
    { product: { title: "Marvel Iron Man Case", price: 399 }, quantity: 1, selectedModel: "iPhone 15 Pro", customName: "" },
    { product: { title: "Gold Text Plate Case", price: 499 }, quantity: 2, selectedModel: "Samsung S23", customName: "Arun" },
  ],
  quantity: 3,
  subtotal: 1397,
  shipping: 0,
  totalAmount: 1397,
  orderDate: new Date(),
};

async function main() {
  const sendMode = process.argv.includes("--send");

  if (!sendMode) {
    console.log("Preview mode — generating HTML file (no email sent, no credentials needed)...");
    const html = buildOrderConfirmationHtml({
      brandName: "3DCaseMakers",
      supportEmail: process.env.EMAIL_USER || "support@example.com",
      supportPhone: "",
      whatsappNumber: "",
      order: FAKE_ORDER,
    });
    const outPath = path.join(__dirname, "email-preview.html");
    fs.writeFileSync(outPath, html);
    console.log(`Preview written to: ${outPath}`);
    console.log("Open that file in a browser to see exactly what the customer will receive.");
    return;
  }

  if (!isEmailConfigured()) {
    console.error("EMAIL_USER / EMAIL_PASS are not set in backend/.env — cannot send a real test email.");
    console.error("Add them first, then re-run: node scripts/testOrderEmail.js --send you@example.com");
    process.exit(1);
  }

  console.log(`Sending a real test email to ${FAKE_ORDER.customerEmail} via Gmail SMTP...`);
  const result = await sendOrderConfirmationEmail(FAKE_ORDER);
  if (result.sent) {
    console.log("✅ Sent successfully — check the inbox (and spam folder).");
  } else {
    console.error(`❌ Failed to send. Reason: ${result.reason}`);
  }
  process.exit(result.sent ? 0 : 1);
}

main();
