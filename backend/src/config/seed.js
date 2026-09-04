// Run standalone: npm run seed
// Creates/updates the admin login using ADMIN_EMAIL / ADMIN_PASSWORD from .env
// Also imported by server.js and run automatically on every server boot, so
// changing ADMIN_EMAIL/ADMIN_PASSWORD on Hostinger + restarting the app is
// enough to update admin credentials - no manual SSH/seed step required.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("./db");

async function ensureAdminSeeded() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set - skipping admin auto-seed.");
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO admins (email, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)",
    [email, hash]
  );
  console.log(`Admin user ready: ${email}`);
}

// Only run the CLI/exit behavior when this file is executed directly
// (npm run seed), not when required as a module from server.js.
if (require.main === module) {
  ensureAdminSeeded()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { ensureAdminSeeded };
