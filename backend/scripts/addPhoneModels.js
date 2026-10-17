// Adds the new phone models to the LIVE store settings (store_settings.brandModels).
// Additive only: never removes or reorders existing models, skips duplicates
// (case-insensitive), and only touches brands already saved in the DB catalog
// (new brands are created). If the DB has no customized catalog yet, nothing
// is written - the built-in defaults in frontend/src/utils/brandModels.ts apply.
//
// Usage (from /backend, with your normal .env DB settings):
//   node scripts/addPhoneModels.js --dry-run   # preview
//   node scripts/addPhoneModels.js             # apply
require("dotenv").config();
const pool = require("../src/config/db");

const NEW_MODELS = {
  "OPPO": [
    "OPPO K33 PRO 5G",
    "OPPO K33 5G",
    "OPPO A6 5G",
    "OPPO RENO 16C 5G",
    "OPPO RENO 16 5G",
    "OPPO FIND X9S",
    "OPPO A60 5G"
  ],
  "Vivo": [
    "VIVO V70 FE 5G",
    "VIVO V40 LITE 5G",
    "VIVO Y11 5G 2026",
    "VIVO Y05 5G",
    "VIVO X300 FE 5G",
    "VIVO T5 PRO 5G",
    "VIVO Y29T 5G",
    "VIVO Y31T 5G"
  ],
  "Samsung": [
    "SAMSUNG A06 4G",
    "SAMSUNG A06 5G",
    "SAMSUNG A57 5G",
    "SAMSUNG A07 5G",
    "SAMSUNG M07 4G",
    "SAMSUNG F07 4G",
    "SAMSUNG A27 5G",
    "SAMSUNG M17 5G",
    "SAMSUNG M07E",
    "SAMSUNG F70 PRO 5G"
  ],
  "OnePlus": [
    "ONEPLUS NORD 6 5G",
    "ONEPLUS NORD CE6 LITE",
    "ONEPLUS NORD CE6 5G"
  ],
  "POCO": [
    "POCO X8 PRO 5G",
    "POCO C85X 5G",
    "POCO C81 5G",
    "POCO X8 PRO MAX"
  ],
  "Infinix": [
    "INFINIX NOTE EDGE 5G",
    "INFINIX HOT 9 X656",
    "INFINIX NOTE 30 PRO 5G",
    "INFINIX NOTE 12 TURBO"
  ],
  "iQOO": [
    "IQOO NEO 11 5G",
    "IQOO 15R 5G",
    "IQOO Z11X 5G"
  ],
  "Xiaomi": [
    "XIAOMI A5",
    "XIAOMI NOTE 14 SE 5G",
    "XIAOMI A7 PRO 5G",
    "XIAOMI NOTE 15 SE 5G"
  ],
  "Google Pixel": [
    "PIXEL 10A"
  ],
  "Realme": [
    "REALME 16T 5G",
    "REALME 14 5G",
    "REALME NARZO 100 LITE 5G",
    "REALME NARZO 90X",
    "REALME P4R"
  ],
  "Nothing / CMF": [
    "NOTHING 4B"
  ],
  "Motorola": [
    "MOTO G37 5G",
    "MOTO G47 5G"
  ]
};

(async () => {
  const dry = process.argv.includes("--dry-run");
  const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
  const settings = rows.length ? JSON.parse(rows[0].settings_json || "{}") : {};
  const saved = settings.brandModels;
  if (!saved || typeof saved !== "object" || Array.isArray(saved) || !Object.keys(saved).length) {
    console.log("No customized brandModels saved in DB - the new built-in defaults will be used. Nothing to do.");
    process.exit(0);
  }
  let added = 0;
  for (const [brand, models] of Object.entries(NEW_MODELS)) {
    const list = Array.isArray(saved[brand]) ? saved[brand] : [];
    const have = new Set(list.map((m) => String(m).trim().toUpperCase()));
    for (const m of models) {
      if (have.has(m.toUpperCase())) continue;
      list.push(m); have.add(m.toUpperCase()); added++;
      console.log((dry ? "[dry-run] would add " : "added ") + brand + " -> " + m);
    }
    saved[brand] = list;
  }
  if (!dry && added) {
    settings.brandModels = saved;
    await pool.query(
      "INSERT INTO store_settings (id, settings_json) VALUES (1, ?) ON DUPLICATE KEY UPDATE settings_json = VALUES(settings_json)",
      [JSON.stringify(settings)]
    );
  }
  console.log(added + " model(s) " + (dry ? "would be added" : "added") + ".");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
