import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";

async function loadModule(relative, mockApi = false) {
  const result = await build({
    entryPoints: [path.resolve(import.meta.dirname, "..", relative)],
    bundle: true, platform: "node", format: "esm", write: false,
    plugins: mockApi ? [{ name: "mock-admin-api", setup(builder) {
      builder.onResolve({ filter: /utils\/api$/ }, () => ({ path: "admin-api", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const api = { mergeSettings: (patch) => globalThis.__adminSave(patch) };", loader: "js" }));
    } }] : [],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const persistence = await loadModule("src/components/admin/settingsPersistence.ts", true);
assert.deepEqual(persistence.settingsChanges(
  { logoText: "Store", announcementMessages: ["Old"], whatsappFloatingEnabled: true },
  { logoText: "Store", announcementMessages: [], whatsappFloatingEnabled: false },
), { announcementMessages: [], whatsappFloatingEnabled: false });
assert.deepEqual(persistence.settingsChanges({ homeCategoryIds: ["c1"], theme: "blue" }, { theme: "blue" }), { homeCategoryIds: null });
assert.deepEqual(persistence.settingsChanges({ brandModels: { Apple: ["iPhone 16"] } }, { brandModels: { Apple: ["iPhone 16"] } }), {});
assert.deepEqual(persistence.settingsChanges({ maintenanceMode: false }, { maintenanceMode: false }, [{ maintenanceMode: true }]), { maintenanceMode: false }, "A toggle reversed before its first save completes must enqueue the reversal");
assert.deepEqual(persistence.settingsChanges({ announcementMessages: ["Original"] }, { announcementMessages: ["Original"] }, [{ announcementMessages: [] }]), { announcementMessages: ["Original"] }, "Restoring text while a removal is queued must also persist the restoration");

const calls = [];
let releaseFirst;
globalThis.__adminSave = async (patch) => {
  calls.push(patch);
  if (calls.length === 1) await new Promise((resolve) => { releaseFirst = resolve; });
  return { success: true };
};
const draft = { announcementMessages: ["First"] };
const first = persistence.saveSettingsPatch(draft);
draft.announcementMessages[0] = "Edited after clicking save";
const second = persistence.saveSettingsPatch({ announcementMessages: ["Second"], announcementSpeed: "fast" });
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(calls, [{ announcementMessages: ["First"] }], "A second save must wait, and the first click's values must be snapshotted");
releaseFirst();
await Promise.all([first, second]);
assert.deepEqual(calls[1], { announcementMessages: ["Second"], announcementSpeed: "fast" });

globalThis.__adminSave = async () => { throw new Error("Network unavailable"); };
await assert.rejects(persistence.saveSettingsPatch({ maintenanceMode: true }), /Network unavailable/);
globalThis.__adminSave = async (patch) => ({ success: true, settings: patch });
assert.deepEqual(await persistence.saveSettingsPatch({ maintenanceMode: false }), { success: true, settings: { maintenanceMode: false } }, "One failed save must not poison subsequent attempts");

const crop = await loadModule("src/components/admin/cropGeometry.ts");
assert.deepEqual(crop.rotatedDimensions(1200, 800, 90), { width: 800, height: 1200 });
assert.deepEqual(crop.rotatedDimensions(1200, 800, 180), { width: 1200, height: 800 });
const scale = crop.cropCoverScale(1200, 800, 90, 180, 320);
assert.ok(800 * scale >= 180 && 1200 * scale >= 320, "A rotated photo must cover a portrait crop without blank edges");
assert.deepEqual(crop.clampCropOffset({ x: 1000, y: -1000 }, 1200, 800, 90, 0.5, 180, 320), { x: 110, y: -140 });
assert.deepEqual(crop.clampCropOffset({ x: 12, y: 15 }, 0, 0, 0, 1, 180, 320), { x: 0, y: 0 });
console.log("Admin reliability: partial saves, resets, empty lists, serialized saves, failure recovery and rotated crop geometry passed.");
delete globalThis.__adminSave;
