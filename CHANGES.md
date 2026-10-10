## Policy pages show the real shipping charges

- Shipping Policy: removed the old "Other states: Rs 50" text and added **Shipping Charges - Phone Cases** (state-wise: Free / 99 / 109 / 119 / 129 / 139 / 149, other states 139) and **Shipping Charges - Photo Frames** (TN & Puducherry free, Kerala & Karnataka 149, others 199), with a note that a mixed cart pays both. Terms & Conditions section 4 updated to match. "Last updated" set to October 9, 2026.
- The phone-case list is built from the live Admin > Store Config > Shipping Zones (and fallback rate), falling back to the built-in defaults, so the policy page can never drift from checkout again (`frontend/src/pages/PolicyPage.tsx`).
- Verified by server-rendering the page; `tsc --noEmit` and `vite build` clean.

## Shipping charges now end in 9

- Phone-case zone rates: 100/110/120/130/140/150 -> **99/109/119/129/139/149** (fallback for unlisted states 140 -> **139**). Photo frames: Kerala & Karnataka 150 -> **149**, other states 200 -> **199**. Tamil Nadu & Puducherry stay free. Zone names renamed to match ("Zone 99 ..." etc.). Changed in `frontend/src/utils/shippingZones.ts` and `backend/src/services/orderPricing.js` (kept in sync), plus the product-page shipping note, admin overview text and the photo-frame shipping test.
- **Live settings:** rates already saved in Admin > Store Config > Shipping Zones live in the database, so a one-time boot migration (`shippingRatesEndIn9Migrated`) lowers any saved non-zero rate that does not already end in 9 by Rs 1 (zone rates and fallback rate). Free zones and rates already ending in 9 are untouched. Rates edited by hand afterwards are never changed again.
- Product prices (499/599/399, compare 999/799) and the Rs 99 gel text plate already end in 9. Offer discounts (e.g. "Buy 2 get Rs 100 OFF") are discounts, not prices, and were left alone.

## Checkout: state no longer pre-selected, auto-detected from PIN code

- The State dropdown used to default to "Tamil Nadu". It now starts on the "State" placeholder (customer must choose, or it is filled from the PIN code).
- Typing a full 6-digit PIN code now fills the State automatically (`frontend/src/utils/pincodeState.ts`, India Post PIN-circle ranges incl. UTs like Puducherry, Chandigarh, Ladakh, Lakshadweep, Goa, Telangana vs Andhra). The customer can still change it by hand; it only re-detects when the PIN changes. Unknown PINs leave the state untouched.
- Until a state is known the order summary shows "Enter PIN code" for shipping and does not charge a guessed rate (the server recalculates shipping from the final state anyway).
- Verified: 39 PIN->state cases, every returned name exists in the dropdown, `tsc --noEmit` and `vite build` clean.

## New collection: ACRYLIC CASES + per-collection product reorder

- **"Acrylic Cases" collection** (slug `acrylic-cases`, shows on the storefront / navbar / sitemap like any other collection). On the next server boot `backend/src/config/migrate.js` creates it once and links **every product whose material is `Acrylic Case`** to it (existing collections of those products are untouched - a product can sit in several collections). Acrylic *Gel* Case and Phone Skin products are not added. Runs once (flag `acrylicCasesCollectionSeeded` in store_settings), so renaming / deleting the collection or removing a product from it later is never undone by a restart.
- **Auto-link going forward:** creating a product with material `Acrylic Case`, switching a product's material to `Acrylic Case`, or bulk-setting that material adds it to the collection automatically (`routes/products.js`).
- **Re-arrange products inside a collection:** Admin > Collections > *Products* (and the older *Reorder Products* modal) now saves the order **per collection** via the new `PUT /api/collections/:id/product-order` (table `collection_product_order`, auto-created on boot, also added to `schema.sql`). Previously it rewrote the global `display_order` of every product, which re-shuffled those products in all their other collections. Products not in a saved order (newly added) appear after the ordered ones. The collection page's default "Best Sellers" sort uses this order (`frontend/src/utils/collectionOrder.ts`); Price / Newest sorts are unchanged.
- Verified: migration + routes against a real MariaDB (idempotent on re-run), `tsc --noEmit` clean, `vite build` clean.

## Page download size (SEOptimer "Website Download Size" > 5 MB)

- New `api.resizedUrl()` serves compressed WebP copies (via the existing `?w=` thumb route) for hero banners (1600/1000px), review-story avatars (56px slots were loading full-size originals, not lazy), customer review photos and checkout review strip. GIF / SVG / video / external URLs are left untouched, so animations never break.
- First hero banner gets `fetchPriority="high"`; review-story avatars are lazy.
- Google Fonts moved from a CSS `@import` (render-blocking chain) to `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html`.
- `thumb.js` allows a 1600px size. Needs `sharp` on the server (already a dependency); without it originals are served as before.

## SEO audit fixes (SEOptimer recommendations)

- **Duplicate H1 removed:** the static `<noscript>` block in `index.html` also had an `<h1>`, so the home page showed two once React rendered its own. It is now an `<h2>`; the React `<h1>` is the only one.
- **Keywords across HTML tags:** keyword-rich `<h2>`/`<strong>` in the crawlable noscript copy, banner alt fallback and social icon alts now mention the brand/phone cases.
- **Page weight:** logo 512px -> 128px (72 KB -> 10 KB), gel text tiles PNG -> WebP (472 KB -> 36 KB), Coolvetica font OTF -> WOFF2 (67 KB -> 40 KB). Home/Collection/Product pages deliberately stay eager (landing pages).
- Link building is off-page work, nothing to change in code.

## Admin UI + Murugan Wordings

- Admin > Payment Verification: UI standardised to match the other admin pages (shared card/table/button classes, equal-size row action buttons, duplicate header removed).
- New optional variant dropdown **MURUGAN WORDINGS** (9 Tamil wordings + "Create Your Own Text" which opens a text box). Seeded on boot by `backend/src/config/seedMuruganWordings.js` and auto-assigned to the collections *Murugan Acrylic Cases*, *Murugan Acrylic Gel Cases* and *Murugan Phone Skins*. It appears right after the phone model picker. Editable later from Admin > Products > Variant Options.
- Same for **SHIVAN WORDINGS** (10 wordings starting with ஓம் நமசிவாய + "Create Your Own Text") on *Shivan Acrylic Cases*, *Shivan Acrylic Gel Cases* and *Shivan Phone Skins*.
- Same for **AYYAPPAN WORDINGS** (10 wordings starting with சுவாமியே சரணம் + "Create Your Own Text") on *Ayyappan Acrylic Cases*, *Ayyappan Acrylic Gel Cases* and *Ayyappan Phone Skins* (the single-P spelling "Ayyapan" also matches).
- Same for **VENKATESHWARA WORDINGS** (10 wordings starting with கோவிந்தா கோவிந்தா + "Create Your Own Text") on *Lord Venkateshwara Acrylic Cases / Acrylic Gel Cases / Phone Skins* ("Venkateswara" spelling also matches).

# Changes — bug fixes, security hardening & admin upgrades

## Security fixes (backend)
- **Order price tampering fixed** — `POST /api/orders` used to save whatever subtotal/total the browser sent (a ₹599 case could be ordered for ₹1). Prices, offer discounts and shipping are now recalculated on the server from the database + admin settings (`services/orderPricing.js`). Out-of-stock / deleted products and invalid quantities are rejected.
- **Stored XSS via uploads fixed** — file extensions were taken from the uploaded filename, so an HTML/SVG file could be uploaded and served from `/uploads`. Extensions now come from a whitelisted MIME type, SVG is blocked, and `/uploads` responses carry `nosniff` + a sandboxing CSP.
- Public customer uploads: images only, image size limit, rate limited.
- Admin login brute-force protection (10 attempts / 15 min per IP) on password and Google sign-in.
- Google sign-in now refuses to work when `GOOGLE_CLIENT_ID` is not set (previously any Google token was accepted for the audience check).
- Rate limits on public write endpoints: orders, reviews, site reviews, contact form, newsletter.
- Order checkout validates name / 10-digit phone / 6-digit pincode / email server-side.
- Security headers on every response; internal error messages are no longer leaked in production.

## Route / API bug fixes
- **Admin "Delete" buttons did nothing on the live server** — the host firewall drops `DELETE` requests. The admin now sends `POST` + `X-HTTP-Method-Override: DELETE` and the server maps it back (products, banners, collections, orders, FAQs, reviews, stories, abandoned carts).
- **Settings saves silently lost** when the `store_settings` row didn't exist (plain `UPDATE`). Now an UPSERT, the row is auto-created on boot, and a safe merge endpoint (`POST /api/settings/merge`) was added.
- Order status update validates the status value and returns 404 for unknown orders; no duplicate emails when nothing changed.
- Gmail Manager "sent today" count used a double time-zone conversion (day rolled over at 6:30 PM IST).
- Collections: clean 409 message for duplicate URL slugs; name/slug validated.
- Products: title/price validated; update on a missing product returns 404.
- Unknown `/api/*` routes return JSON 404; malformed JSON returns 400.
- New `GET /api/auth/verify` and `GET /api/analytics/insights` endpoints.
- Dashboard revenue series are zero-filled (days without orders no longer disappear from charts).

## Admin panel bug fixes
- "Auto-fill Best Sellers" logged the admin out (called an admin-only API without the auth token).
- Typing in Website Content / Settings text fields lost focus after every keystroke.
- Collection slug field couldn't accept a `-` while typing.
- Save/delete failures that only had `try/finally` now show an error toast instead of silently doing nothing.
- One tab crashing no longer blanks the whole admin panel (per-tab error boundary with "Try again").
- Customer photo download button works on the live server (uses the backend download route instead of a CORS-blocked fetch).
- CSV / Excel downloads no longer fail in Firefox (object URL revoked too early).
- Single-slice pie/donut charts rendered nothing.
- Expired login tokens are detected before the dashboard renders.
- Theme save now reports errors; Page Transition default shown correctly.

## Admin UI enhancements
- Open tab is kept in the URL (`#Orders` etc.) — refresh / back button stay on the same screen.
- Mobile: proper app header (menu button + page title + breadcrumb) instead of a floating button over content; left slide-in drawer; solid cards and no animated background on phones (much smoother scrolling); 16px inputs so iOS doesn't zoom.
- Overview dashboard: 5 KPI cards (Sales, Orders, Avg. order value, Pending, Visitors) with 7-day sparklines; main chart with Sales / Orders / Avg. order / Sessions switcher; insights strip (units, shipping, new vs returning, delivery & cancellation rate); donut charts for order status, traffic sources, new vs returning customers and sales channel; bar charts for sales by weekday and orders by hour; ranked bars for top states, phone brands and products. Live-visitor polling reduced from every 1s to every 5s (only while the tab is visible).

## New: Content › Customize Store
Banner corners, auto-slide speed, dots/arrows, full-width banner; collection banner corners, grid columns (desktop/mobile), products per page; product card corners, image fit, rating / discount badge / tag toggles; 10 storefront colours with live preview; show/hide each home page section and the "Popular Products" heading; mobile menu policy links + tagline; search bar style, WhatsApp button, back-to-top button; custom CSS; reset to defaults.

## Storefront
- Home banners and collection banners use **hard (square) corners**.
- Mobile side menu now slides in from the **left** as a full-height drawer (closes on backdrop tap, X, Escape or navigation).
- Banner and collection **mobile images were never used** — phones now get the mobile image.
- Products with no compare price showed a stray "0" next to the price.
- Best Seller and Trending labels no longer overlap on the same card.
- Unknown collection URLs show a "Collection not found" page.
- Changing sort order resets to page 1.
- `/api/settings` is fetched once per page instead of 6–8 times.

---

# Update 2

## Whole-website hard corners
- Every storefront button, search box, text field, dropdown, card, popup, image and badge now uses **hard (square) corners** by default.
- **Content › Customize Store › Corners**: switch individual areas back to soft corners (Buttons & links, Search boxes & text fields, Dropdowns, Cards/panels/popups, Images, Badges & dots) plus one roundness slider. Banner, collection banner and product-card corners keep their own options. The admin panel is never affected.

## Banner
- Fixed the thin white strip around/below the edge-to-edge banner: the `<picture>` was inline, which left a gap under the image. The banner border and shadow were also removed. The same fix applies to collection banners.

## More storefront UI
- The **feature bar** under the banner (Free Shipping / Premium Quality / Support) could be edited in Admin › Home Page but was never shown. It now shows, and you can hide it from Customize › Home Sections.
- Loading skeletons on the Home and Collection pages instead of a blank screen.
- Short accent line under centred section headings (can be switched off).
- Product photo zooms slightly on hover (can be switched off).
- The header gets a stronger background and shadow once you scroll.

## Gmail notifications — bugs fixed + test tool
- The "Nth order of today" count in the owner email and the totals in the daily report were wrong. The server already runs in IST, but the code converted to IST a second time, so "today" rolled over at 6:30 PM. The **daily report visitor count was therefore always 0**.
- Cancelled orders are no longer counted in the "today" totals.
- The daily report now sends any time between 23:55 and 23:59, so one missed minute no longer skips the whole day.
- SMTP now has timeouts, so an unreachable Gmail can't hang a request for minutes.
- **Admin › Gmail Manager › Email notifications health** shows which mailboxes are configured and has **Test** buttons that send a real email and show the exact Gmail error if it fails.

## WhatsApp — bugs fixed + templates
- If the store WhatsApp number was saved as 10 digits (without 91), every storefront WhatsApp link opened the wrong number. Numbers are now normalised.
- **Admin › Settings › Notifications › Order WhatsApp Messages**: editable message for each order status (Confirmed, Ready to ship, Shipped, Out for delivery, Delivered, Cancelled) with a live preview and an "auto-open" switch per status.
- The review link now uses your real site address instead of a hard-coded one.
- The Orders tab reloaded the full order list **every 1 second**. It now reloads every 8 seconds, and only while the tab is visible.

## Manage Stocks — separate from website stock + new features
- A clear banner explains that this is the **individual / shop stock register**: completely separate from the website. It never changes what the website sells, and website orders are never deducted from it. The "Website" sales channel and the "Today's website sales" card were removed to avoid confusion. Old "website" entries show as "Website (old entry)".
- POS sales channels: Shop / Walk-in, WhatsApp / Phone, Instagram, Other.
- **New item** dialog: product, model, opening quantity, low-stock alert level, cost price, selling price, SKU and location/shelf.
- Edit item details, including renaming (history follows the rename).
- **Set count** (stock adjustment) with a reason: physical count, damaged, lost, return or sample. Every adjustment is logged.
- **Undo** any wrong entry from the History tab. Stock is corrected and the entry is marked "Undone".
- **Remove** an item. Its history is kept.
- Quick **+1 / −1** buttons on every row.
- KPIs: items, in stock, low stock, out of stock, stock value at cost and at selling price.
- Filters by brand, status and search (including SKU/location), plus sorting; the global low-stock level is saved.
- **Reorder list** that you can copy or share on WhatsApp.
- **Inventory Excel** export, and **History** with filters (type, channel, dates, search), Excel export and load more.
- **Insights** for 7, 30 or 90 days: units sold and received per day, sales by channel, top sellers, profit (when cost prices are set), "running out soon" (days of stock left at the current selling speed) and slow movers.
- A POS bill left without a price automatically uses the item's selling price. An inward entry with a price updates the item's cost price.
- DB changes are applied automatically on server start (new stock columns + an `adjust` movement type).

## New: Photo Frames collection + New Arrival home section
- **Photo Frames products** — Admin → Products → *Add product* → **Photo Frame**. Fields: product name, collection, images, sizes with a manual price per size (defaults `8x12` and `12x18`, optional compare price, up to 8 sizes) and a checkbox **"Customer can upload their own image"** (ticked = the product page shows a required "Upload Your Photo" box; unticked = no upload box). No phone model is asked for frames.
- Storefront: frame product page shows a **Choose Frame Size** picker; the price follows the selected size. Cards show "From ₹X" when sizes have different prices. Cart/checkout/admin orders show `Size: 8x12`.
- Server re-prices frame lines from the database size list (a tampered browser price or an unknown size is rejected).
- A **"Photo Frames"** collection (`photo-frames`) is created once on first boot (upload its image in Collections). New DB columns `products.is_photo_frame`, `products.frame_sizes_json` are added automatically by `migrate.js` (also in `schema.sql`).
- **New Arrival** home section, right under *Shop By Collections*: Admin → Content → Home Page → **New Arrival — Choose Products** (min 2, max 10, drag to reorder). Until picked it shows products flagged "New Arrival", then the newest products (always at least 2). Can be hidden/reordered like other sections.

## Fix: home banner never moved to the 2nd banner
- `HeroBanner` measured the slide width (px) once on mount, but the banner frame doesn't exist until the banners finish loading, so the width stayed 0 and the track never left banner 1 (autoplay, dots and swipe all "worked" but showed nothing new). The slide position is now a percentage of the track, so it needs no measurement.

## Fix: top navbar overlap (Track Order over the search bar)
- On widths ~1024–1280px the 6 centre links were absolutely centred while the search box was a fixed 256px, so "Track Order" ran underneath it. The links now sit in a normal flex slot between the logo and the search/cart group (tighter gaps + 14px text on `lg`, full size on `xl`), and the search box is 160px on `lg` and 256px on `xl`, so they can never overlap.

## Easebuzz online payment
- New: `backend/src/services/easebuzz.js`, `routes/payments.js`, `services/orderNotifications.js`; `payment_attempts` table.
- `POST /api/orders` (public) is disabled (410); orders are created only by a verified Easebuzz callback.
- Checkout: online payment only, email now required, redirects to Easebuzz; new `/payment-result` page.

---

# Update 3 — fake reviews removed + WhatsApp/social link previews

## Fake reviews removed
- Removed the 10 built-in sample testimonials (Priya S., Arun Kumar, ...) from Cart page, /reviews page and the admin "Customer Reviews" editor. Only real reviews (customer submissions + ones you post yourself) are shown. With none, the section is simply hidden.
- Product cards no longer show a default "5.0" star rating when a product has 0 reviews. Stars appear only after real approved reviews.
- Backend: a product with no approved reviews now gets rating 0 instead of 5.0.
- One-time cleanup in `backend/src/config/migrate.js`: on next backend start it deletes the sample testimonials (matched by exact id + name) if they were ever saved into settings. Real reviews are untouched.

## Link previews (WhatsApp / Facebook / Telegram / X ...)
- Home link  -> preview = first active image banner (video banners skipped).
- Product link -> preview = product's first photo (videos skipped), title, description.
- Collection link -> preview = collection banner/image, name, description.
- New `GET /share/img/:mode/:file.jpg`: converts any uploaded image into a light 1200x630 (banner/collection) or 800x800 (product) JPEG under ~300 KB, cached in `UPLOAD_DIR/.og-cache`. Big PNG/WebP uploads were the main reason WhatsApp showed no image. Falls back to the original file if `sharp` is unavailable.
- Removed the `meta refresh` from share pages (some crawlers followed it back into the empty SPA); JS redirect stays for humans.
- Added og:image width/height/type, twitter:image; `.htaccess` recognises more preview bots.

## Deploy
1. Upload `backend/` and restart the Node app (needed for share.js + migrate.js).
2. Upload the contents of `frontend/dist/` to public_html (includes the updated `.htaccess`).
3. WhatsApp caches previews: test with a NEW link variant (add `?v=2`) or use Facebook Sharing Debugger -> "Scrape Again".

---

# Update 4 — Easebuzz online payment only
- Checkout shows only "Secure Online Payment (Easebuzz)". Public `POST /api/orders` stays disabled (410); orders are created only after a verified Easebuzz payment.
- Every order is now recorded as `payment_method = online` (admin manual orders too). Email, order page, reports, analytics, admin texts, abandoned-cart messages, policy, SEO structured data and docs no longer mention any other payment option.
- Backend env needed: EASEBUZZ_MERCHANT_KEY, EASEBUZZ_SALT, EASEBUZZ_ENV (test|prod), BACKEND_PUBLIC_URL=https://api.3dcasemakers.com

# Update 5 — 10 related products
- Product page "You may also like" now shows 10 products (was 4): same collection first, then same material, then others, so it is always filled. Grid is 2 columns on mobile, 5 on desktop (2 neat rows).

---

# Update: Direct UPI + Easebuzz admin toggles

- Admin → Settings → Payments: separate ON/OFF toggles for **Easebuzz** and **Direct UPI**. Defaults: Easebuzz OFF, Direct UPI ON.
- Checkout page now shows just **"Direct UPI"** (no "Manual Verification" text) for the Direct UPI option.
- Easebuzz code, `.env` keys and callbacks untouched — flipping the toggle back ON restores it.
- Type fixes so `tsc --noEmit` passes with 0 errors (Order import in OrderPages, shipping fields on ManualUpiPayment).

---

# Update: Tamil Nadu courier choice (ST Courier / Post Office)

- Checkout: when the state is Tamil Nadu or Puducherry, "Shipping method" shows two options — **ST Courier (Free)** and **Post Office (₹99)**. ST Courier is selected by default. Other states keep the normal zone-based "Standard Shipping".
- ST Courier note: 70% home delivery · 30% collect from nearby ST Courier office. Post Office note: 99% home delivery.
- Server re-prices shipping from the chosen courier (never trusts the browser); missing/unknown choice in Tamil Nadu falls back to free ST Courier. Applies to phone cases, photo frames and mixed carts.
- Update: Tamil Nadu & Puducherry mixed carts (phone case + photo frame) now use the same courier rates as single-type carts: ST Courier free, Post Office Rs 99.
- New `orders.courier` column (auto-added by `migrate.js` on next backend start; also in `schema.sql`). Saved for both Direct UPI and Easebuzz orders.
- Admin → Orders: Courier column/badge shows the courier the customer selected (ST Courier red, Post Office blue) with the delivery note in the order details. Older orders keep the old state-based badge.
- Emails (customer confirmation, owner notification, status/tracking) and WhatsApp {courier}/{track_link} use the chosen courier. Shipping Policy text updated.
- Mixed cart (phone case + photo frame): Tamil Nadu & Puducherry → ST Courier ₹149 / Post Office ₹199; Kerala → single option Post Office ₹149 (no choice).
- Test: `node backend/scripts/testCourierShipping.js`.
