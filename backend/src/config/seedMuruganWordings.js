// One-time (self-healing) seed for the optional "MURUGAN WORDINGS" and
// "SHIVAN WORDINGS" / "AYYAPPAN WORDINGS" / "VENKATESHWARA WORDINGS" variant dropdowns (same behaviour; collection lists below).
//
// MURUGAN WORDINGS: It is shown on the product page right after the phone-model picker
// for every product in these three collections:
//   - Murugan Acrylic Cases
//   - Murugan Acrylic Gel Cases
//   - Murugan Phone Skins
//
// It uses the existing Variant Options system (settings.variantGroups +
// collections.variant_group_id), so everything stays editable afterwards from
// Admin > Products > Variant Options / Collections. Nothing here is hardcoded
// in the storefront.
//
// Safe to run on every boot:
//   - the group is only created if it doesn't exist (matched by id or name);
//   - a collection is only assigned if it currently has NO variant group, so an
//     assignment the admin made by hand is never overwritten;
//   - once all three collections are assigned, a settings flag stops any
//     further work, so a group the admin deletes later is not re-created.

const MURUGAN = {
  groupId: "murugan-wordings",
  groupName: "MURUGAN WORDINGS",
  flag: "muruganWordingsSeeded",
  optionPrefix: "mw",
  collections: ["Murugan Acrylic Cases", "Murugan Acrylic Gel Cases", "Murugan Phone Skins"],
  wordings: [
    "யாமிருக்க பயமேன்..",
    "ஆறுமுகம் அருளிடும் அனுதினமும் ஏறுமுகம்",
    "ஓம் முருகா..",
    "வேலுண்டு வினையில்லை",
    "கந்தன் பாதம் கனவிலும் காக்கும்",
    "கந்தன் கருணை",
    "ஓம் சரவணபவ",
    "வேலும் மயிலும் துணை",
    "கருணைக் கடலே கந்தா போற்றி",
  ],
};

const SHIVAN = {
  groupId: "shivan-wordings",
  groupName: "SHIVAN WORDINGS",
  flag: "shivanWordingsSeeded",
  optionPrefix: "sw",
  collections: ["Shivan Acrylic Cases", "Shivan Acrylic Gel Cases", "Shivan Phone Skins"],
  wordings: [
    "ஓம் நமசிவாய",
    "சிவ சிவ",
    "ஹர ஹர சிவா",
    "அருணாசல சிவா",
    "சிவனே போற்றி",
    "ஈசனே துணை",
    "சிவன் அருள்",
    "அண்ணாமலையார் துணை",
    "நமசிவாய வாழ்க",
    "சிவமே துணை",
  ],
};

const AYYAPPAN = {
  groupId: "ayyappan-wordings",
  groupName: "AYYAPPAN WORDINGS",
  flag: "ayyappanWordingsSeeded",
  optionPrefix: "aw",
  // Each entry may list alternate spellings (AYYAPAN / AYYAPPAN) - any one matches.
  collections: [
    ["Ayyappan Acrylic Cases", "Ayyapan Acrylic Cases"],
    ["Ayyappan Acrylic Gel Cases", "Ayyapan Acrylic Gel Cases"],
    ["Ayyappan Phone Skins", "Ayyapan Phone Skins"],
  ],
  wordings: [
    "சுவாமியே சரணம்",
    "சரணம் ஐயப்பா",
    "ஐயப்பன் துணை",
    "சுவாமி சரணம்",
    "ஹரிஹர சுதனே",
    "மணிகண்டா சரணம்",
    "ஐயப்பா சரணம்",
    "சபரிமலை வாசா",
    "ஐயனே துணை",
    "தர்ம சாஸ்தாவே",
  ],
};

const VENKATESHWARA = {
  groupId: "venkateshwara-wordings",
  groupName: "VENKATESHWARA WORDINGS",
  flag: "venkateshwaraWordingsSeeded",
  optionPrefix: "vw",
  // Alternate spellings (Venkateshwara / Venkateswara) all match.
  collections: [
    ["Lord Venkateshwara Acrylic Cases", "Lord Venkateswara Acrylic Cases"],
    ["Lord Venkateshwara Acrylic Gel Cases", "Lord Venkateswara Acrylic Gel Cases"],
    ["Lord Venkateshwara Phone Skins", "Lord Venkateswara Phone Skins"],
  ],
  wordings: [
    "கோவிந்தா கோவிந்தா",
    "வெங்கடேசா சரணம்",
    "ஏழுமலையான் துணை",
    "திருப்பதி வாசா",
    "பெருமாளே துணை",
    "ஸ்ரீனிவாசா சரணம்",
    "வேங்கடவா போற்றி",
    "கோவிந்தா துணை",
    "ஏழுமலையான் அருள்",
    "திருமாலே சரணம்",
  ],
};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function buildGroup(cfg = MURUGAN) {
  return {
    id: cfg.groupId,
    name: cfg.groupName,
    required: false,
    options: [
      ...cfg.wordings.map((label, i) => ({ id: `${cfg.optionPrefix}-${i + 1}`, label, isCustomText: false })),
      { id: `${cfg.optionPrefix}-custom`, label: "Create Your Own Text", isCustomText: true },
    ],
  };
}

async function seedWordingGroup(pool, tableExists, cfg) {
  if (!(await tableExists("collections")) || !(await tableExists("store_settings"))) return;

  await pool.query("INSERT IGNORE INTO store_settings (id, settings_json) VALUES (1, '{}')");
  const [rows] = await pool.query("SELECT settings_json FROM store_settings WHERE id = 1");
  let settings = {};
  try {
    settings = JSON.parse((rows[0] && rows[0].settings_json) || "{}") || {};
  } catch {
    settings = {};
  }
  if (settings[cfg.flag]) return;

  const groups = Array.isArray(settings.variantGroups) ? settings.variantGroups : [];
  let group = groups.find((g) => g && (g.id === cfg.groupId || norm(g.name) === norm(cfg.groupName)));
  let changed = false;
  if (!group) {
    group = buildGroup(cfg);
    groups.push(group);
    settings.variantGroups = groups;
    changed = true;
    console.log(`[migrate] Created the "${cfg.groupName}" variant option group.`);
  }

  const [cols] = await pool.query("SELECT id, name, slug, variant_group_id FROM collections");
  let done = 0;
  for (const target of cfg.collections) {
    const names = Array.isArray(target) ? target : [target];
    const col = cols.find((c) => names.some((n) => norm(c.name) === norm(n) || norm(c.slug) === norm(n)));
    if (!col) {
      console.log(`[migrate] Collection "${names[0]}" not found yet - will retry on next boot.`);
      continue;
    }
    if (!col.variant_group_id) {
      await pool.query("UPDATE collections SET variant_group_id = ? WHERE id = ?", [group.id, col.id]);
      console.log(`[migrate] Assigned "${cfg.groupName}" to collection "${col.name}".`);
      done++;
    } else if (col.variant_group_id === group.id) {
      done++;
    } else {
      console.log(`[migrate] Collection "${col.name}" already uses another variant group - left unchanged.`);
      done++; // respect the admin's choice; don't keep retrying
    }
  }

  if (done === cfg.collections.length) {
    settings[cfg.flag] = true;
    changed = true;
  }
  if (changed) {
    await pool.query("UPDATE store_settings SET settings_json = ? WHERE id = 1", [JSON.stringify(settings)]);
  }
}

// Seeds every wording group (MURUGAN WORDINGS, SHIVAN WORDINGS). Each is
// independent: one failing never blocks the other.
async function seedWordingGroups(pool, tableExists) {
  for (const cfg of [MURUGAN, SHIVAN, AYYAPPAN, VENKATESHWARA]) {
    try {
      await seedWordingGroup(pool, tableExists, cfg);
    } catch (err) {
      console.error(`[migrate] Failed to seed the "${cfg.groupName}" variant group:`, err.message);
    }
  }
}

const seedMuruganWordings = (pool, tableExists) => seedWordingGroup(pool, tableExists, MURUGAN);
const seedAyyappanWordings = (pool, tableExists) => seedWordingGroup(pool, tableExists, AYYAPPAN);
const seedVenkateshwaraWordings = (pool, tableExists) => seedWordingGroup(pool, tableExists, VENKATESHWARA);
const seedShivanWordings = (pool, tableExists) => seedWordingGroup(pool, tableExists, SHIVAN);

module.exports = { seedWordingGroups, seedMuruganWordings, seedShivanWordings, seedAyyappanWordings, seedVenkateshwaraWordings, buildGroup, MURUGAN, SHIVAN, AYYAPPAN, VENKATESHWARA };
