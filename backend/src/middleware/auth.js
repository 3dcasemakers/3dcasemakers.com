const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET is not configured on the server" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (!payload || typeof payload !== "object" || !payload.id || typeof payload.email !== "string") return res.status(401).json({ error: "Invalid or expired token" });
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAdmin };
