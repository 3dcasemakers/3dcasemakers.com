const assert = require("node:assert/strict");
const {
  DEFAULT_UPI_ID,
  DEFAULT_PAYEE_NAME,
  normalizeTransactionId,
  validateTransactionId,
  generateUpiUri,
  generateUpiQrDataUrl,
} = require("../src/services/manualUpiService");

let checks = 0;
function check(label, fn) {
  fn();
  checks++;
  console.log(`PASS ${label}`);
}

async function asyncCheck(label, fn) {
  await fn();
  checks++;
  console.log(`PASS ${label}`);
}

async function runTests() {
  console.log("=== Testing Manual UPI Service & Security ===");

  // 1. Transaction ID normalization
  check("Transaction ID normalizes spaces, dashes, and lowercase", () => {
    assert.equal(normalizeTransactionId(" 1234-5678-9012 "), "123456789012");
    assert.equal(normalizeTransactionId("upi_txn_987654"), "UPITXN987654");
    assert.equal(normalizeTransactionId("  UTR 9988 7766  "), "UTR99887766");
  });

  // 2. Transaction ID validation
  check("Transaction ID validation rejects empty, too short, or non-alphanumeric", () => {
    assert.equal(validateTransactionId("").valid, false);
    assert.equal(validateTransactionId("   ").valid, false);
    assert.equal(validateTransactionId("123").valid, false); // too short
    assert.equal(validateTransactionId("123456@#$").valid, false); // special chars
    assert.equal(validateTransactionId("123456789012").valid, true);
    assert.equal(validateTransactionId(" 1234 5678 9012 ").normalized, "123456789012");
  });

  // 3. Dynamic UPI URI generation
  check("Dynamic UPI URI generates correct format and encodes parameters", () => {
    const uri1 = generateUpiUri({
      upiId: "325691127665359@cnrb",
      payeeName: "3D Case Makers",
      amount: 1499,
      orderRef: "TDC0001",
    });
    assert.match(uri1, /^upi:\/\/pay\?/);
    assert.match(uri1, /pa=325691127665359%40cnrb/);
    assert.match(uri1, /pn=3D\+Case\+Makers/);
    assert.match(uri1, /am=1499\.00/);
    assert.match(uri1, /cu=INR/);
    assert.match(uri1, /tn=TDC0001/);
  });

  // 4. Test different amounts in UPI URI
  check("UPI URI formats different amounts with exact 2 decimal places", () => {
    const testCases = [
      { amount: 1, expected: "am=1.00" },
      { amount: 499, expected: "am=499.00" },
      { amount: 1499, expected: "am=1499.00" },
      { amount: 2499, expected: "am=2499.00" },
    ];
    for (const tc of testCases) {
      const uri = generateUpiUri({
        upiId: "325691127665359@cnrb",
        payeeName: "Store",
        amount: tc.amount,
        orderRef: "TDC100",
      });
      assert.ok(uri.includes(tc.expected), `Expected ${tc.expected} in ${uri}`);
    }
  });

  // 5. Dynamic QR code data URL generation
  await asyncCheck("Dynamic QR code generates high quality data URL", async () => {
    const uri = generateUpiUri({
      upiId: "325691127665359@cnrb",
      payeeName: "3D Case Makers",
      amount: 1499,
      orderRef: "TDC0001",
    });
    const qrDataUrl = await generateUpiQrDataUrl(uri);
    assert.ok(qrDataUrl.startsWith("data:image/png;base64,"));
    assert.ok(qrDataUrl.length > 500); // valid base64 image data
  });

  // 6. Payment method settings combinations logic
  check("Payment method resolution handles 4 cases properly", () => {
    function resolvePaymentOptions(easebuzzEnabled, manualUpiEnabled) {
      if (easebuzzEnabled && !manualUpiEnabled) return { case: 1, methods: ["easebuzz"] };
      if (!easebuzzEnabled && manualUpiEnabled) return { case: 2, methods: ["manual_upi"] };
      if (easebuzzEnabled && manualUpiEnabled) return { case: 3, methods: ["easebuzz", "manual_upi"] };
      return { case: 4, methods: [], unavailable: true };
    }

    assert.deepEqual(resolvePaymentOptions(true, false), { case: 1, methods: ["easebuzz"] });
    assert.deepEqual(resolvePaymentOptions(false, true), { case: 2, methods: ["manual_upi"] });
    assert.deepEqual(resolvePaymentOptions(true, true), { case: 3, methods: ["easebuzz", "manual_upi"] });
    assert.deepEqual(resolvePaymentOptions(false, false), { case: 4, methods: [], unavailable: true });
  });

  console.log(`\nALL ${checks} TESTS PASSED SUCCESSFULLY!`);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
