const mysql = require("mysql2/promise");
require("dotenv").config();

// If DB_HOST is "localhost", force it to the IPv4 loopback address instead.
// Node.js 18+ resolves "localhost" to the IPv6 address (::1) first on many
// systems/hosts. Hostinger's MySQL user grants are typically for 'localhost'
// or an IPv4 host only - not '::1' - so the connection gets rejected with
// "Access denied for user '...'@'::1'" even when the password is 100% correct.
// Using 127.0.0.1 explicitly sidesteps that DNS resolution order issue.
const rawHost = (process.env.DB_HOST || "localhost").trim();
const resolvedHost = rawHost === "localhost" ? "127.0.0.1" : rawHost;

const pool = mysql.createPool({
  host: resolvedHost,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

// IMPORTANT: Hostinger's MySQL server runs on UTC by default. Without this,
// NOW()/CURDATE()/CURRENT_TIMESTAMP (used everywhere for created_at and for
// "today"/"yesterday" analytics + order date grouping) roll over to the next
// day at 12:00 AM UTC, which is 5:30 AM India time - not midnight IST. That
// caused orders/analytics placed between 12:00 AM and 5:30 AM IST to still
// be counted under the previous day. Forcing every connection's session to
// IST (+05:30) makes all date/time SQL functions match India's actual
// midnight-to-midnight day boundary.
pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+05:30'");
});

module.exports = pool;
