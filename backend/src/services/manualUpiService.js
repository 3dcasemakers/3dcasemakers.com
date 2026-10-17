const QRCode = require("qrcode");
const pool = require("../config/db");

const DEFAULT_UPI_ID = "325691127665359@cnrb";
const DEFAULT_PAYEE_NAME = "3D Case Makers";

async function getPaymentSettings(db = pool) {
  try {
    const [rows] = await db.query("SELECT settings_json FROM store_settings WHERE id = 1");
    let settings = {};
    if (rows && rows.length > 0 && rows[0].settings_json) {
      settings = JSON.parse(rows[0].settings_json || "{}");
    }
    return {
      easebuzzEnabled: typeof settings.easebuzzEnabled === "boolean" ? settings.easebuzzEnabled : false,
      manualUpiEnabled: typeof settings.manualUpiEnabled === "boolean" ? settings.manualUpiEnabled : true,
      manualUpiId: (typeof settings.manualUpiId === "string" && settings.manualUpiId.trim()) ? settings.manualUpiId.trim() : DEFAULT_UPI_ID,
      manualUpiPayeeName: (typeof settings.manualUpiPayeeName === "string" && settings.manualUpiPayeeName.trim()) ? settings.manualUpiPayeeName.trim() : (settings.logoText || DEFAULT_PAYEE_NAME),
      manualUpiScreenshotEnabled: typeof settings.manualUpiScreenshotEnabled === "boolean" ? settings.manualUpiScreenshotEnabled : true,
    };
  } catch (err) {
    console.error("[manualUpiService] Failed to read payment settings:", err.message);
    return {
      easebuzzEnabled: false,
      manualUpiEnabled: true,
      manualUpiId: DEFAULT_UPI_ID,
      manualUpiPayeeName: DEFAULT_PAYEE_NAME,
      manualUpiScreenshotEnabled: true,
    };
  }
}

function normalizeTransactionId(raw) {
  if (typeof raw !== "string") return "";
  // Strip whitespace, hyphens, and slashes, then uppercase
  return raw.trim().replace(/[\s\-_/]/g, "").toUpperCase();
}

function validateTransactionId(raw) {
  const normalized = normalizeTransactionId(raw);
  if (!normalized) return { valid: false, error: "Please enter your UPI Transaction ID / UTR." };
  if (normalized.length < 6 || normalized.length > 50) {
    return { valid: false, error: "Transaction ID / UTR must be between 6 and 50 characters." };
  }
  // Alphanumeric characters
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return { valid: false, error: "Transaction ID / UTR should contain only letters and numbers." };
  }
  return { valid: true, normalized };
}

function generateUpiUri({ upiId, payeeName, amount, orderRef }) {
  const cleanUpiId = String(upiId || DEFAULT_UPI_ID).trim();
  const cleanPayee = String(payeeName || DEFAULT_PAYEE_NAME).trim();
  const numAmount = Number(amount);
  const formattedAmount = Number.isFinite(numAmount) ? numAmount.toFixed(2) : "0.00";
  const cleanOrderRef = String(orderRef || "").trim();

  const params = new URLSearchParams({
    pa: cleanUpiId,
    pn: cleanPayee,
    am: formattedAmount,
    cu: "INR",
    tn: cleanOrderRef,
  });

  return `upi://pay?${params.toString()}`;
}

async function generateUpiQrDataUrl(upiUri) {
  try {
    return await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  } catch (err) {
    console.error("[manualUpiService] Failed to generate QR code:", err.message);
    throw err;
  }
}

module.exports = {
  DEFAULT_UPI_ID,
  DEFAULT_PAYEE_NAME,
  getPaymentSettings,
  normalizeTransactionId,
  validateTransactionId,
  generateUpiUri,
  generateUpiQrDataUrl,
};
