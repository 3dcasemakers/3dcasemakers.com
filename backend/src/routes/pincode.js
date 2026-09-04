const express = require("express");
const router = express.Router();

// Static pincode -> city lookup (sourced from courier serviceability data:
// zone / prepaid / COD / pickup columns are dropped, we only keep city).
const pincodeMap = require("../data/pincodes.json");

router.get("/:code", (req, res) => {
  const code = String(req.params.code || "").trim();
  const city = pincodeMap[code];
  if (!city) return res.status(404).json({ error: "Pincode not found" });
  res.json({ pincode: code, city });
});

module.exports = router;
