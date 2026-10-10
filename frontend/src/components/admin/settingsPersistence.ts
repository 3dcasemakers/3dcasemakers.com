import { api } from "../../utils/api";

// Only changed keys belong in a settings save. Sending a tab's entire cached
// object can undo a newer change from another tab or another administrator.
export function settingsChanges(before: Record<string, any>, after: Record<string, any>, pending: Record<string, any>[] = []) {
  const baseline = pending.reduce((current, patch) => ({ ...current, ...patch }), before || {});
  const patch: Record<string, any> = {};
  const keys = new Set([...Object.keys(baseline), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (JSON.stringify(baseline[key]) !== JSON.stringify(after?.[key])) {
      // null resets an optional setting; undefined is dropped by JSON.stringify.
      patch[key] = after?.[key] === undefined ? null : after[key];
    }
  }
  return patch;
}

let settingsSaveQueue: Promise<unknown> = Promise.resolve();

export function saveSettingsPatch(patch: Record<string, any>): Promise<any> {
  if (!Object.keys(patch).length) return Promise.resolve({ success: true });
  // Snapshot the values when clicked, then preserve the order of rapid saves.
  // A failed save must not prevent the next attempt from running.
  const snapshot = JSON.parse(JSON.stringify(patch));
  const request = settingsSaveQueue.catch(() => undefined).then(() => api.mergeSettings(snapshot));
  settingsSaveQueue = request;
  return request;
}

export function saveChangedSettings(before: Record<string, any>, after: Record<string, any>) {
  return saveSettingsPatch(settingsChanges(before, after));
}
