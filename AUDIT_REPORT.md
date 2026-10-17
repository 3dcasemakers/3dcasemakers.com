# 3DCaseMakers audit and fixes

Completed on 4 October 2026. The existing visual design was preserved while improving alignment, responsive layout, button consistency, settings persistence and order reliability.

## Completed changes

- Patched vulnerable frontend/backend dependencies and regenerated the lockfiles. Final `npm audit` reports **zero vulnerabilities** in both projects.
- Removed the yellow icon between announcement messages and improved announcement/offer-bar spacing.
- Fixed admin alignment, overflow, controls, loading/error feedback and settings saves. Partial saves preserve unrelated settings; queued saves and database locking prevent concurrent changes from overwriting one another.
- Connected storefront settings refreshes to saved admin changes and fixed stale-response races, cart-line identity, corrupted cart restoration, offer expiry and duplicate checkout submission handling.
- Recomputed checkout prices, discounts and shipping on the server. Paid Gel text plates cannot bypass the surcharge; free-print text containing “Gold Plate” remains free. Optional analytics failures cannot turn a successful checkout into a failed order.
- Protected personal order photos/names with order access tokens and phone verification. Preview requests and Meta purchase events require verified order access. Meta purchase values come from saved orders and use stable event IDs.
- Added explicit payment recording and accurate payment badges. Unpaid orders cannot be recorded as refunded.
- Corrected India-time calendar boundaries, period-specific charts/rankings, quantity counts, discount exports, returned-order exclusions, visitor attribution and report periods. Booked order value is distinguished from collected payments.
- Filtered credentials from public settings, validated financial settings, strengthened JWT checks and proxy-aware rate limiting, checked upload file signatures and unified upload/static-serving paths.
- Updated deployment-domain defaults to `.com`, preserved configured CORS ports and made the Meta Graph API version configurable.

## Verified checks

| Check | Result |
| --- | --- |
| Frontend and backend dependency audits | Zero reported vulnerabilities in both projects |
| Final production build for 3dcasemakers.com | Passed; current frontend/dist included |
| TypeScript, cart/admin/product regressions and admin control audit | Passed |
| Responsive browser checks | 158 checks passed |
| Final production-preview targeted browser checks | 48 checks passed, no runtime errors or overflow |
| Functional browser coverage | 10 functional groups passed |
| Backend reliability regressions | 37 checks passed |
| Existing corner-settings regressions | 14 checks passed |
| Backend JavaScript syntax and whitespace checks | Passed |
| Email HTML preview generation | Passed; no email sent |

Browser checks used local previews and fixture API responses. They covered storefront/admin layouts, controls and relevant interaction flows. Backend regression tests replace MySQL, SMTP and Meta calls with deterministic mocks and do not contact production services.

The final sitemap build fetched the public catalogue read-only and generated 243 URLs (210 products, 27 collections). Vite reported a bundle-size warning for the existing large admin screen and lazy-loaded Excel exporter; the build completed successfully.

## Reproduce local checks

Run from the project root after installing each project's dependencies with `npm ci`:

```powershell
node backend/scripts/testBackendReliability.js
node backend/scripts/testCornerSettings.js
node backend/scripts/testOrderEmail.js
```

The email test generates a local HTML preview by default. Run `npm audit` in both `frontend` and `backend`, and use the frontend build/check commands documented in its `package.json`.

Frontend regressions: `npm run lint`, `node scripts/test-cart-items.mjs`, `node scripts/test-admin-reliability.mjs`, `node scripts/test-product-defaults.mjs` and `node scripts/audit-admin-controls.mjs`. Browser scripts in `frontend/scripts/verify-*.cjs` require Playwright with Chrome available; `TEST_BASE_URL` selects the local preview. JSON evidence is included under `verification/`.

## Deployment and remaining verification

The delivery ZIP excludes `node_modules`; install dependencies from the included lockfiles. Configure the real backend environment, including MySQL, a strong `JWT_SECRET`, allowed storefront origins, persistent absolute `UPLOAD_DIR`, and any SMTP/Google/Meta integration credentials. Deploy the matching frontend and backend together because secure order tracking and payment controls use updated API contracts.

The live Hostinger installation was not redeployed or rescanned. Real MySQL/schema permissions, SMTP delivery, Google/Meta account configuration, production analytics values and Hostinger's post-deployment vulnerability result require verification against the deployed services. The local checks establish source/build/fixture behavior, not successful production integration.
