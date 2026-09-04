# Deploying 3DCaseMakers to Hostinger

Google Sign-In has been fully removed — admin login is plain email + password
only (set via environment variables, no Google Cloud setup needed).
Products/Collections are intentionally empty — add them from the Admin Panel
after go-live.

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
   - Node version: 18 or newer
   - Application root: e.g. `domains/api.3dcasemakers.in` (or a subfolder)
   - Application URL: `api.3dcasemakers.in` (add this subdomain first under
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

   CLIENT_URL=https://3dcasemakers.in
   BACKEND_PUBLIC_URL=https://api.3dcasemakers.in

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
   terminal: `npm install`), then **Restart** the app.
5. Confirm it's running: visit `https://api.3dcasemakers.in/` (or whatever
   health route the app exposes) and check the Node.js app logs in hPanel.

## 3. Set up the frontend

1. On your local machine (or the Hostinger Node.js terminal for the backend
   app, temporarily), copy `frontend/.env.example` to `.env` and set:
   ```
   VITE_API_URL=https://api.3dcasemakers.in
   ```
2. Build it: `cd frontend && npm install && npm run build`
   This produces a static `frontend/dist` folder.
3. Upload the **contents** of `frontend/dist` to your main domain's public
   folder in hPanel File Manager (e.g. `domains/3dcasemakers.in/public_html`).
4. Make sure `.htaccess` (already included in `frontend/public/.htaccess`
   and copied into `dist` on build) is present in `public_html` so client-side
   routing (React Router) works on page refresh/direct links.
5. Visit `https://3dcasemakers.in` to confirm the storefront loads and
   `https://3dcasemakers.in/admin/login` to confirm the admin login page
   appears (email + password only — no Google button).

## 4. First login & setup

1. Go to `https://3dcasemakers.in/admin/login`, sign in with the
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

- Payment method is Cash on Delivery (COD) only — no payment gateway keys
  needed anywhere.
- `og-image.jpg` (used for WhatsApp/social link previews) has already been
  added at `frontend/public/og-image.jpg`, built from your logo.
- If you ever want Google Sign-In back for admin login, it was cleanly
  removed (not just hidden) — you'd need to re-add the `/api/auth/google`
  route, the `google-auth-library` dependency, and the Google button in
  `AdminLogin.tsx`, plus create an OAuth client in your own Google Cloud
  project.
