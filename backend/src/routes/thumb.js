const express = require("express");
const path = require("path");
const fs = require("fs");

// On-the-fly thumbnail generator.
// Original files under UPLOAD_DIR are NEVER modified - this only ever reads
// them and writes resized/compressed COPIES into a separate cache folder.
// Request a thumb with: /uploads/<file>?w=400
// If sharp isn't installed/available on the host (e.g. some shared hosting
// plans), this middleware quietly does nothing and the original file is
// served as-is by express.static, so nothing ever breaks.
let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

const ALLOWED_WIDTHS = [80, 160, 240, 320, 480, 640, 800, 1000, 1200];

function nearestAllowedWidth(w) {
  const n = Math.min(Math.max(parseInt(w, 10) || 0, 1), 1600);
  return ALLOWED_WIDTHS.reduce((best, cur) => (Math.abs(cur - n) < Math.abs(best - n) ? cur : best), ALLOWED_WIDTHS[0]);
}

function makeThumbRouter(uploadDir) {
  const cacheDir = path.join(uploadDir, ".thumbs");
  if (sharp && !fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const router = express.Router();

  router.get("/:file", async (req, res, next) => {
    const w = req.query.w;
    if (!sharp || !w) return next(); // no resize requested / sharp unavailable -> fall through to static original

    const file = req.params.file;
    if (file.includes("..") || file.startsWith(".")) return next();

    const srcPath = path.join(uploadDir, file);
    if (!fs.existsSync(srcPath)) return next();

    const width = nearestAllowedWidth(w);
    const cacheName = `${path.parse(file).name}-w${width}.webp`;
    const cachePath = path.join(cacheDir, cacheName);

    try {
      if (!fs.existsSync(cachePath) || fs.statSync(cachePath).mtimeMs < fs.statSync(srcPath).mtimeMs) {
        await sharp(srcPath)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(cachePath);
      }
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      res.type("image/webp");
      return fs.createReadStream(cachePath).pipe(res);
    } catch (err) {
      console.warn("Thumbnail generation failed, serving original:", err.message);
      return next();
    }
  });

  return router;
}

module.exports = makeThumbRouter;
