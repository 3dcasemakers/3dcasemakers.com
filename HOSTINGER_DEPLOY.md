# Deploying 3DCaseMakers to Hostinger

Admin login uses email + password by default. Optional Google sign-in is available
only when matching GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID values are configured.
For an existing deployment, preserve the current database and uploaded media.
For a new installation, add Products/Collections from the Admin Panel.

---

## 1. Create the MySQL database

1. hPanel → **Databases → MySQL Databases** → create a new database + user
   (note the DB name, username, password — Hostinger prefixes them like
   `u123456789_dbname`).
2. Open **phpMyAdmin** for that database → **Import** tab → choose
   `backend/schema.sql` from this project → Go.
   This creates every table the app needs (products, collections, orders,
   settings, admins, FAQs, etc.) in one shot. No other SQL file is required.

## 2. Set up the backend (Node.js app)

1. hPanel → **Advanced → Node.js** → Create Application.
   - Node version: 24 LTS recommended (minimum 20.19; frontend builds on 20.19 or 22.12 and newer)
   - Application root: e.g. `domains/api.3dcasemakers.com` (or a subfolder)
   - Application URL: `api.3dcasemakers.com` (add this subdomain first under
     **Domains → Subdomains** if it doesn't exist)
   - Application startup file: `src/server.js`
2. Upload the contents of the `backend/` folder to that application root
   (zip it and use File Manager → Extract, or upload via FTP/SFTP/Git).
3. Copy `backend/.env.example` to `.env` in that same folder and fill in:
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=<your Hostinger DB username>
   DB_PASSWORD=<your Hostinger DB password>
   DB_NAME=<your Hostinger DB name>

   PORT=5000
   NODE_ENV=production

   JWT_SECRET=<any long random string>
   ADMIN_EMAIL=3dcasemakers@gmail.com
   ADMIN_PASSWORD=<pick a strong password>

   CLIENT_URL=https://3dcasemakers.com
   BACKEND_PUBLIC_URL=https://api.3dcasemakers.com

   UPLOAD_DIR=/home/<your-hostinger-username>/3dcasemakers_uploads
   MAX_UPLOAD_MB=5
   ```
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` are the login you'll use at
     `/admin/login` — the app auto-creates/updates this admin account every
     time the server starts (see `src/config/seed.js`), so just set these two
     variables and restart the app. No separate script needs to be run.
   - `UPLOAD_DIR` must be an **absolute path outside** the app's deployed
     code folder (run `pwd` in the Hostinger Node.js terminal to find your
     home path) — otherwise re-deploying the zip wipes uploaded images.
4. In the Node.js app's "Run NPM Install" button (or via the built-in
   terminal: `npm ci`), then **Restart** the app.
5. Confirm it's running: visit `https://api.3dcasemakers.com/` (or whatever
   health route the app exposes) and check the Node.js app logs in hPanel.

## 3. Set up the frontend

1. On your local machine (or the Hostinger Node.js terminal for the backend
   app, temporarily), copy `frontend/.env.example` to `.env` and set:
   ```
   VITE_API_URL=https://api.3dcasemakers.com
   VITE_SITE_URL=https://3dcasemakers.com
   ```
2. Build it: `cd frontend && npm ci && npm run build`
   This produces a static `frontend/dist` folder.
3. Upload the **contents** of `frontend/dist` to your main domain's public
   folder in hPanel File Manager (e.g. `domains/3dcasemakers.com/public_html`).
4. Make sure `.htaccess` (already included in `frontend/public/.htaccess`
   and copied into `dist` on build) is present in `public_html` so client-side
   routing (React Router) works on page refresh/direct links.
5. Visit `https://3dcasemakers.com` to confirm the storefront loads and
   `https://3dcasemakers.com/admin/login` to confirm the admin login page
   appears (email + password only — no Google button).

## 4. First login & setup

1. Go to `https://3dcasemakers.com/admin/login`, sign in with the
   `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in the backend `.env`.
2. Admin Panel → **Settings**: these are already pre-filled as fallback
   defaults in the code, but confirm/adjust them here so they're the source
   of truth going forward:
   - WhatsApp Number: `6369418105`
   - Instagram URL: `https://www.instagram.com/3d_case_maker/`
   - YouTube URL: `https://www.youtube.com/@3Dcasemakers`
   - Contact Email: `3dcasemakers@gmail.com`
   - Contact Address: `Avinashi, Tamil Nadu, India - 641654`
3. Admin Panel → **Products / Collections**: both are empty in this fresh
   database — add your collections first, then products.

## Notes

- Payment is online only (Easebuzz). Set the
  EASEBUZZ_* variables in the backend `.env`.
- `og-image.jpg` (used for WhatsApp/social link previews) has already been
  added at `frontend/public/og-image.jpg`, built from your logo.
- Optional Google sign-in: configure the same OAuth Web client ID in backend
  `GOOGLE_CLIENT_ID` and frontend `VITE_GOOGLE_CLIENT_ID`, register the storefront
  origin with Google, rebuild and restart. Only a verified Google email already
  registered as an admin can sign in. No Google setup is needed for password login.

## Deploying this audited update

Deploy backend and frontend together: the admin settings endpoint and protected order receipts require matching versions. Run `npm ci` in the backend application, keep your existing production environment variables/database and persistent upload directory, and restart the Node app. Upload the provided `frontend/dist` contents to `public_html`. Back up the current deployment/database first; do not re-import `schema.sql` over an existing store. Hostinger must rescan the new installation to clear old dependency alerts.

The included static build targets `https://api.3dcasemakers.com`. Rebuild with your own `VITE_API_URL` and `VITE_SITE_URL` if using a different domain. `ORDER_ACCESS_SECRET` can be set to a separate long random value; otherwise order receipts use the existing `JWT_SECRET`. Existing orders can be verified on Track Order using the order ID and customer phone.

## Easebuzz online payment

Storefront checkout is now **online payment only** (Easebuzz Hosted Checkout). An order is created only after Easebuzz confirms the payment, and it arrives marked **Paid**.

1. Backend `.env` — add (see `backend/.env.example`):
   ```
   EASEBUZZ_MERCHANT_KEY=...
   EASEBUZZ_SALT=...
   EASEBUZZ_ENV=test        # switch to prod (with the PROD key/salt) only after testing
   BACKEND_PUBLIC_URL=https://api.3dcasemakers.com
   ```
   `BACKEND_PUBLIC_URL` must be public HTTPS: Easebuzz posts the result to
   `BACKEND_PUBLIC_URL/api/payments/easebuzz/callback`.
2. No new npm packages. Restart the Node app: on boot it auto-creates the `payment_attempts` table, adds `orders.gateway_txnid` / `gateway_payment_id`, and allows `payment_method = 'online'`. Do not re-import `schema.sql`.
3. Rebuild/upload the frontend (`frontend/dist` contents) — new route `/payment-result`.
4. Test in `test` mode with Easebuzz's test cards/UPI, then go live with prod keys. Check that a failed payment creates NO order, and that a successful one shows up as Paid in Admin → Orders.
5. If a payment succeeds but the order insert fails, the row in `payment_attempts` is left as `paid_no_order` (and logged as `PAID BUT ORDER CREATION FAILED`) so you can create the order manually and refund/reconcile from the Easebuzz dashboard.
