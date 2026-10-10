const path = require("node:path");

// Upload writers, downloads and static serving must resolve the same folder.
const raw = process.env.UPLOAD_DIR || "uploads";
const uploadDir = path.isAbsolute(raw) ? raw : path.resolve(__dirname, "../..", raw);

module.exports = { uploadDir };
