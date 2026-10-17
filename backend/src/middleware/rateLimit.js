// Tiny in-memory, per-IP fixed-window rate limiter (no extra npm package).
// Good enough for a single Node process on Hostinger: it stops password
// brute-forcing on the admin login and spam floods on the public write
// endpoints (orders, reviews, contact form, customer photo uploads).
function getIp(req) {
  // Express resolves trusted proxy hops. The leftmost forwarded header is
  // attacker-controlled when extra addresses are prepended to that chain.
  return String(req.ip || req.socket?.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  // Periodically drop expired buckets so the map can't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of hits) if (b.resetAt <= now) hits.delete(ip);
  }, Math.max(windowMs, 60 * 1000)).unref();

  return (req, res, next) => {
    const ip = getIp(req);
    const now = Date.now();
    let b = hits.get(ip);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      hits.set(ip, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.set("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ error: message || "Too many requests — please wait a moment and try again." });
    }
    next();
  };
}

module.exports = { rateLimit, getIp };
