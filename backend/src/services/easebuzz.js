// Easebuzz Hosted Checkout helper (Initiate Payment API + response verification).
//
// Mirrors Easebuzz's official Node kit (paywitheasebuzz-nodejs-lib):
//   - request hash : sha512(key|txnid|amount|productinfo|firstname|email|udf1..udf10|SALT)
//   - response hash: sha512(SALT|status|udf10..udf1|email|firstname|productinfo|amount|txnid|key)
//   - initiate URL : <pay host>/payment/initiateLink  (form-encoded POST -> { status: 1, data: access_key })
//   - redirect URL : <pay host>/pay/<access_key>
// No extra npm packages: uses node:crypto and the global fetch (Node >= 20).
const crypto = require("node:crypto");

function config() {
  const env = String(process.env.EASEBUZZ_ENV || "test").toLowerCase() === "prod" ? "prod" : "test";
  return {
    key: process.env.EASEBUZZ_MERCHANT_KEY || "",
    salt: process.env.EASEBUZZ_SALT || "",
    env,
    payHost: env === "prod" ? "https://pay.easebuzz.in/" : "https://testpay.easebuzz.in/",
  };
}

function isConfigured() {
  const c = config();
  return !!(c.key && c.salt);
}

const sha512 = (s) => crypto.createHash("sha512").update(s).digest("hex").toLowerCase();

function requestHash(p, salt) {
  const seq = [
    p.key, p.txnid, p.amount, p.productinfo, p.firstname, p.email,
    p.udf1, p.udf2, p.udf3, p.udf4, p.udf5, p.udf6, p.udf7, p.udf8, p.udf9, p.udf10,
  ].map((v) => v || "").join("|") + "|" + salt;
  return sha512(seq);
}

function responseHash(r, salt) {
  const seq = [
    salt, r.status, r.udf10, r.udf9, r.udf8, r.udf7, r.udf6, r.udf5, r.udf4, r.udf3, r.udf2, r.udf1,
    r.email, r.firstname, r.productinfo, r.amount, r.txnid, r.key,
  ].map((v) => (v === undefined || v === null ? "" : String(v))).join("|");
  return sha512(seq);
}

// Timing-safe check of the hash Easebuzz posts back to surl/furl.
function verifyResponse(r) {
  const { salt, key } = config();
  if (!r || typeof r !== "object" || !salt) return false;
  if (String(r.key || "") !== key) return false;
  const expected = Buffer.from(responseHash(r, salt), "utf8");
  const got = Buffer.from(String(r.hash || "").toLowerCase(), "utf8");
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// Easebuzz is picky about firstname; keep letters/digits/spaces only.
function cleanName(name) {
  return String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50) || "Customer";
}

// Calls Initiate Payment API. Returns the hosted checkout URL.
async function initiatePayment({ txnid, amount, firstname, email, phone, productinfo, surl, furl }) {
  const c = config();
  if (!c.key || !c.salt) throw new Error("Online payment is not configured");
  const params = {
    key: c.key,
    txnid,
    amount: Number(amount).toFixed(2),
    productinfo,
    firstname: cleanName(firstname),
    email,
    phone,
    surl,
    furl,
  };
  params.hash = requestHash(params, c.salt);

  const res = await fetch(c.payHost + "payment/initiateLink", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!body || Number(body.status) !== 1 || !body.data) {
    const reason = (body && (body.error_desc || (typeof body.data === "string" ? body.data : ""))) || `HTTP ${res.status}`;
    throw new Error(`Easebuzz initiate failed: ${reason}`);
  }
  return c.payHost + "pay/" + encodeURIComponent(String(body.data));
}

module.exports = { config, isConfigured, initiatePayment, verifyResponse, cleanName };
