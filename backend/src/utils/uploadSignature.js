function fileSignatureMatches(mimetype, header) {
  const mime = String(mimetype || "").toLowerCase();
  const ascii = (start, end) => header.toString("ascii", start, end);
  if (["image/jpeg", "image/jpg", "image/pjpeg"].includes(mime)) return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (mime === "image/png") return header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mime === "video/webm") return header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const isIsoMedia = ascii(4, 8) === "ftyp";
  if (mime === "image/avif") return isIsoMedia && /avif|avis/.test(ascii(8, 64));
  if (["image/heic", "image/heif"].includes(mime)) return isIsoMedia && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii(8, 64));
  if (mime === "video/mp4") return isIsoMedia && /isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash/.test(ascii(8, 64));
  if (mime === "video/quicktime") return (isIsoMedia && /qt  /.test(ascii(8, 64))) || ["moov", "mdat", "wide"].includes(ascii(4, 8));
  return false;
}

module.exports = { fileSignatureMatches };
