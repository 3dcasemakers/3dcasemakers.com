const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const [rows] = await pool.query("SELECT * FROM admins WHERE email = ?", [email]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ token, email: admin.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/google — "Sign in with Google" on the admin login page.
// The frontend uses Google Identity Services to get a signed ID token for
// whichever Google account the admin picks, then sends just that token here.
// We verify it directly with Google's tokeninfo endpoint (no extra npm
// package needed) and only allow the sign-in through if the verified email
// already exists in the admins table — so this never lets a random Google
// account in, it's purely an alternate way to prove you're one of the
// already-registered admin emails, without typing a password.
router.post("/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: "Missing Google credential" });

  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) return res.status(401).json({ error: "Invalid Google sign-in" });
    const payload = await verifyRes.json();

    // aud must match our app's Google Client ID, and the token must be for
    // a verified Google account email — otherwise reject outright.
    if (process.env.GOOGLE_CLIENT_ID && payload.aud !== process.env.GOOGLE_CLIENT_ID) {
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
    const admin = rows[0];
    const token = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ token, email: admin.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Google sign-in failed" });
  }
});

module.exports = router;
