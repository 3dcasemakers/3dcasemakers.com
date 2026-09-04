const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// IMPORTANT: UPLOAD_DIR must be an ABSOLUTE path that lives OUTSIDE this
// app's deployed folder (e.g. /home/u123456789/3dcasemakers_uploads).
// If it's a relative path, we resolve it relative to the backend folder,
// which is exactly the folder that gets wiped/replaced on every deploy.
const rawUploadDir = process.env.UPLOAD_DIR || "uploads";
const uploadDir = path.isAbsolute(rawUploadDir)
  ? rawUploadDir
  : path.join(__dirname, "..", "..", rawUploadDir);
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(12).toString("hex") + ext;
    cb(null, name);
  },
});

// Banner videos (short looping hero clips) need a much bigger ceiling than a
// product photo, so video uploads get their own, larger limit via
// MAX_UPLOAD_VIDEO_MB (defaults to 60MB) while images keep MAX_UPLOAD_MB.
const maxImageBytes = (Number(process.env.MAX_UPLOAD_MB) || 12) * 1024 * 1024;
const maxVideoBytes = (Number(process.env.MAX_UPLOAD_VIDEO_MB) || 60) * 1024 * 1024;

const upload = multer({
  storage,
  limits: { fileSize: Math.max(maxImageBytes, maxVideoBytes) },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype) || /^video\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image or video uploads are allowed"));
  },
});

// multer's `limits.fileSize` can't vary per-file-type, so we enforce the
// per-type ceiling ourselves after the file lands on disk.
const enforcePerTypeLimit = (req, res, next) => {
  if (!req.file) return next();
  const isVideo = /^video\//.test(req.file.mimetype);
  const limit = isVideo ? maxVideoBytes : maxImageBytes;
  if (req.file.size > limit) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({
      error: `${isVideo ? "Video" : "Image"} is too large (max ${(limit / (1024 * 1024)).toFixed(0)}MB)`,
    });
  }
  next();
};

// POST /api/upload  (admin only) - form field name: "image"
router.post("/", requireAdmin, upload.single("image"), enforcePerTypeLimit, (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// POST /api/upload/customer  (public) - lets a shopper upload their own photo
// for a customized/photo-case product. Same size + image-type restrictions,
// no admin auth required since this is filled in from the storefront.
router.post("/customer", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// GET /api/upload/list (admin only) — File Manager: every image currently
// sitting in the uploads folder, whether it got there via the admin's own
// "Upload image" buttons (products, banners, collections, etc.) or via a
// shopper's customer photo-case upload (both routes above write into this
// exact same folder), newest first. Supports simple search + pagination.
router.get("/list", requireAdmin, (req, res) => {
  try {
    const search = (req.query.search || "").toString().toLowerCase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 60));

    const files = fs
      .readdirSync(uploadDir)
      .filter((name) => /\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$/i.test(name))
      .filter((name) => !search || name.toLowerCase().includes(search))
      .map((name) => {
        const stat = fs.statSync(path.join(uploadDir, name));
        return {
          filename: name,
          url: `/uploads/${name}`,
          size: stat.size,
          uploadedAt: stat.mtime,
        };
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    const total = files.length;
    const totalSize = files.reduce((s, f) => s + f.size, 0);
    const start = (page - 1) * pageSize;
    const pageItems = files.slice(start, start + pageSize);

    res.json({ files: pageItems, total, totalSize, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list uploaded images" });
  }
});

// DELETE /api/upload/:filename (admin only) — removes a file from disk.
// Filename is strictly validated (no slashes/dots-dots) so this can never
// escape the uploads folder.
function deleteUploadedFile(filename, res) {
  try {
    if (!/^[a-zA-Z0-9_-]+\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$/i.test(filename || "")) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(uploadDir, filename);
    if (!filePath.startsWith(uploadDir)) return res.status(400).json({ error: "Invalid filename" });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete file" });
  }
}

router.delete("/:filename", requireAdmin, (req, res) => {
  deleteUploadedFile(req.params.filename, res);
});

// POST /api/upload/remove (admin only) — same behaviour as the DELETE
// route above, kept as a fallback with the filename in the JSON body
// rather than the URL. Two separate real-world hosting issues showed up
// on this deployment (visible directly in the browser's console as a
// failed CORS preflight with no Access-Control-Allow-Origin header at
// all — meaning the request got intercepted before Express/cors ever ran):
//   1. DELETE requests are dropped by the host's security layer (Hostinger/
//      Imunify-style setups commonly block non-standard HTTP methods).
//   2. Switching to POST wasn't enough on its own — a URL containing the
//      literal word "delete" (e.g. /api/upload/delete/xyz.jpg) also got
//      blocked, which points to a WAF keyword rule rather than a method
//      rule. So this route avoids "delete" in the path entirely and takes
//      the filename from the body instead of the URL.
// The original DELETE route is left in place for any other client that
// already relies on it; the File Manager UI now calls this one.
router.post("/remove", requireAdmin, (req, res) => {
  deleteUploadedFile((req.body && req.body.filename) || "", res);
});

// GET /api/upload/file/:filename — forces a real download via
// Content-Disposition instead of just displaying the image. Deliberately
// NOT fetched with JS (fetch+blob): the live server's static /uploads
// serving doesn't return CORS headers (only <img> tags there work, since
// tags don't need CORS — a JS fetch() to the same URL is blocked by the
// browser exactly like the console showed). A plain link navigation to
// this API route sidesteps CORS entirely because navigation was never
// subject to it, and this route goes through Express (which already sends
// CORS headers correctly for /api/* — confirmed working for list/remove)
// rather than through whatever is serving /uploads directly.
// No requireAdmin here on purpose: a plain <a> navigation can't attach the
// admin's Authorization header (only fetch() can), and these files are
// already publicly reachable with no auth at all via /uploads/<filename> —
// this route serves the identical bytes, just with a download header.
router.get("/file/:filename", (req, res) => {
  try {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9_-]+\.(jpe?g|png|webp|gif|avif|mp4|webm|mov)$/i.test(filename || "")) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const filePath = path.join(uploadDir, filename);
    if (!filePath.startsWith(uploadDir)) return res.status(400).json({ error: "Invalid filename" });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.download(filePath, filename);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to download file" });
  }
});

module.exports = router;
