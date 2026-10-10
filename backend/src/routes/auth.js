const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { rateLimit } = require("../middleware/rateLimit");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// 10 login attempts per 15 minutes per IP — stops password brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please wait 15 minutes and try again.",
});

function signToken(admin) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured on the server");
  return jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const [rows] = await pool.query("SELECT * FROM admins WHERE LOWER(email) = ?", [email]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ token: signToken(admin), email: admin.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/verify — lets the admin panel confirm a saved token is still
// valid (not expired / secret not rotated) before rendering the dashboard.
router.get("/verify", requireAdmin, (req, res) => {
  res.json({ ok: true, email: req.admin.email });
});

// POST /api/auth/google — "Sign in with Google" on the admin login page.
// The frontend uses Google Identity Services to get a signed ID token for
// whichever Google account the admin picks, then sends just that token here.
// We verify it directly with Google's tokeninfo endpoint (no extra npm
// package needed) and only allow the sign-in through if the verified email
// already exists in the admins table — so this never lets a random Google
// account in, it's purely an alternate way to prove you're one of the
// already-registered admin emails, without typing a password.
router.post("/google", loginLimiter, async (req, res) => {
  const { credential } = req.body || {};
  if (typeof credential !== "string" || !credential || credential.length > 10000) return res.status(400).json({ error: "Missing or invalid Google credential" });

  // GOOGLE_CLIENT_ID is required: without it, an ID token minted for ANY
  // Google app would be accepted here.
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google sign-in is not configured on the server" });
  }

  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(10000) });
    if (!verifyRes.ok) return res.status(401).json({ error: "Invalid Google sign-in" });
    const payload = await verifyRes.json();

    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: "Invalid Google sign-in" });
    }
    if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss) || Number(payload.exp) <= Date.now() / 1000) {
      return res.status(401).json({ error: "Invalid Google sign-in" });
    }
    if (payload.email_verified !== "true" && payload.email_verified !== true) {
      return res.status(401).json({ error: "Google email not verified" });
    }

    const email = (payload.email || "").toLowerCase();
    const [rows] = await pool.query("SELECT * FROM admins WHERE LOWER(email) = ?", [email]);
    if (rows.length === 0) {
      return res.status(403).json({ error: "This Google account isn't registered as an admin" });
    }
    res.json({ token: signToken(rows[0]), email: rows[0].email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Google sign-in failed" });
  }
});

module.exports = router;
