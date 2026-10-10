# Dependency security verification — 4 October 2026

The frontend and backend manifests and lockfiles were checked against the npm
registry and the maintainer/GitHub advisories associated with the supplied
Hostinger screenshots. Full `npm audit --json` checks returned **0 reported
vulnerabilities** for each project after the changes below.

| Project | Package | Previous locked version | Updated locked version |
| --- | --- | --- | --- |
| Backend | nodemailer | 9.1.1 | 10.0.14 |
| Backend | multer | 2.2.0 | 2.4.0 |
| Backend | sharp | 0.35.3 | 0.35.5 |
| Backend | express | 4.22.2 | 4.22.3 |
| Backend | body-parser | 1.20.6 | 1.20.8 |
| Backend | qs | 6.15.3 | 6.16.0 |
| Frontend | brace-expansion | 1.1.18 / 2.1.4 | 1.1.21 / 2.1.7 |
| Frontend | uuid (ExcelJS dependency) | 8.3.2 | 11.1.1 |
| Frontend | dompurify | 3.4.14 | 3.4.16 |

Backend `nodemon` was removed because its current `chokidar`/`braces` dependency
chain had an additional unpatched denial-of-service advisory. `npm run dev` now
uses Node's built-in `--watch` mode. The unused backend UUID and brace-expansion
overrides were removed along with that chain. Frontend brace-expansion overrides
keep each existing major version; UUID is overridden only for ExcelJS. ExcelJS
uses the compatible named `v4` API, and an XLSX write/read smoke check passed.
The vulnerable npm `xlsx` package was removed while the project exports were
migrated to the existing ExcelJS dependency.

Nodemailer CommonJS loading and local MIME composition, Multer's disk-storage
API, Sharp's native PNG encoding, and ExcelJS XLSX round-trip checks passed.
The email check used stream transport and did not send an email.

For deployment, use Node **24 LTS** if available. The backend requires Node
20.19 or newer; the frontend build requires Node `^20.19.0 || >=22.12.0` because
of Vite. Install from the committed lockfiles using `npm ci` in each project
directory. The zip intentionally excludes `node_modules`; Hostinger must
install the updated dependencies and restart/rebuild before its deployed scan
can reflect these fixes. No production deployment or Hostinger rescan was
performed by this dependency check.

The audit result covers npm's advisory database at verification time, not every
possible application vulnerability. ExcelJS ships a prebuilt browser bundle;
the UUID override applies to its installed dependency graph, while its bundled
UUID use is `v4`, outside the vulnerable `v3`/`v5`/`v6` buffer API described in
the advisory.

Primary advisory references:

- [Multer: aborted disk-upload cleanup, patched in 2.4.0](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34)
- [Nodemailer security advisories](https://github.com/nodemailer/nodemailer/security/advisories)
- [Nodemailer 10.0.14 release](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.14)
- [brace-expansion security advisories](https://github.com/juliangruber/brace-expansion/security/advisories)
- [UUID buffer bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [DOMPurify detached subtree advisory, patched in 3.4.16](https://github.com/cure53/DOMPurify/security/advisories/GHSA-p98j-92pf-mc4p)
- [SheetJS prototype pollution advisory](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- [SheetJS regular expression denial-of-service advisory](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)

## 2026-10-07 Hostinger scan fixes
- backend: `proxy-addr` 2.0.7 -> 2.0.8 (CVE-2026-90711, Critical) via `overrides` (transitive of express)
- frontend: `source-map-js` 1.2.1 -> 1.2.2 (CVE-2026-93749, High) via `overrides` (transitive of postcss/tailwind)
- Verified: `npm audit` = 0 vulns on both, `tsc --noEmit` clean, `vite build` passes.
