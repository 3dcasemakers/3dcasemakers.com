// Base URL of the Node/Express + MySQL backend.
// In dev this points to localhost:5000; in production set VITE_API_URL in .env.production
export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");

function authHeader(): Record<string, string> {
  const token = sessionStorage.getItem("3dcasemakers_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Session missing/expired: clear the stale token and bounce to login instead of
    // leaving the admin stuck on a silently-failing save.
    if (res.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
      sessionStorage.removeItem("3dcasemakers_admin_token");
      if (!window.location.pathname.includes("/admin/login")) {
        window.location.href = "/admin/login";
      }
    }
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// The storefront shell, navbar, footer, WhatsApp button, offers hook, home
// page... each fetched /api/settings on their own — 6-8 identical requests
// per page load. On storefront pages we now share one in-flight request and
// reuse its result for a short while. Admin pages always fetch fresh so a
// just-saved setting is never shown stale.
let settingsCache: { at: number; promise: Promise<any> } | null = null;
const SETTINGS_TTL_MS = 60 * 1000;
function isAdminPage() {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
}
// Collections are read by the app shell (navbar/footer) AND the home page —
// share one in-flight request on the storefront instead of two.
let collectionsCache: { at: number; promise: Promise<any> } | null = null;
const COLLECTIONS_TTL_MS = 30 * 1000;

// Last-known-good copy of a few storefront payloads in localStorage, so the
// home page can paint "Shop By Collections" on the very first frame of a
// repeat visit and refresh quietly in the background (stale-while-revalidate).
const LS_PREFIX = "3dcm_cache_v1:";
export function readCached<T>(path: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + path);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeCached(path: string, data: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + path, JSON.stringify(data));
  } catch {
    /* storage full / blocked — cache is optional */
  }
}

export function invalidateSettingsCache() {
  settingsCache = null;
}

async function handleSettingsSave(res: Response) {
  const result = await handle(res);
  invalidateSettingsCache();
  window.dispatchEvent(new Event("3dcasemakers:settings-updated"));
  return result;
}

export const api = {
  get: (path: string) => {
    if (path === "/api/settings" && !isAdminPage()) {
      if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.promise;
      const promise = fetch(`${API_URL}${path}`).then(handle);
      settingsCache = { at: Date.now(), promise };
      promise.catch(() => { settingsCache = null; });
      return promise;
    }
    if (path === "/api/collections" && !isAdminPage()) {
      if (collectionsCache && Date.now() - collectionsCache.at < COLLECTIONS_TTL_MS) return collectionsCache.promise;
      const promise = fetch(`${API_URL}${path}`).then(handle);
      collectionsCache = { at: Date.now(), promise };
      promise.catch(() => { collectionsCache = null; });
      return promise;
    }
    return fetch(`${API_URL}${path}`).then(handle);
  },

  getAuth: (path: string) => fetch(`${API_URL}${path}`, { headers: authHeader() }).then(handle),

  post: (path: string, body: any, auth = false) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? authHeader() : {}) },
      body: JSON.stringify(body),
    }).then(path === "/api/settings" ? handleSettingsSave : handle),

  put: (path: string, body: any) =>
    fetch(`${API_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    }).then(path === "/api/settings" ? handleSettingsSave : handle),

  // Sent as POST + X-HTTP-Method-Override: DELETE (see backend server.js).
  // The host's firewall silently drops real DELETE requests, which made every
  // admin "Delete" button look like it did nothing.
  del: (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-HTTP-Method-Override": "DELETE", ...authHeader() },
      body: "{}",
    }).then(handle),

  // Merge-save only the given settings keys (POST /api/settings/merge), so a
  // save from one admin screen can't wipe keys another screen changed.
  mergeSettings: (partial: Record<string, any>) =>
    fetch(`${API_URL}/api/settings/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(partial),
    }).then(handleSettingsSave),

  // POST with a JSON body and auth headers — used where a DELETE request,
  // or even a POST whose URL contains certain words, gets silently blocked
  // by the host's security layer before it reaches the server at all (this
  // showed up as a CORS preflight failure with no server response). Keeping
  // the payload in a plain JSON body sidesteps both problems.
  postAuthJson: (path: string, body: any) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    }).then(handle),

  upload: (file: File) => {
    const form = new FormData();
    form.append("image", file);
    return fetch(`${API_URL}/api/upload`, {
      method: "POST",
      headers: authHeader(),
      body: form,
    }).then(handle);
  },

  // Public upload for a customer's own photo, used on customizable/photo-case products.
  customerUpload: (file: File) => {
    const form = new FormData();
    form.append("image", file);
    return fetch(`${API_URL}/api/upload/customer`, {
      method: "POST",
      body: form,
    }).then(handle);
  },

  imageUrl: (path: string) => (path?.startsWith("http") ? path : `${API_URL}${path}`),

  // Small/compressed version of an image for thumbnails (product cards,
  // collection tiles, product-page thumbnail strip) so pages load fast.
  // The original full-quality file on disk is never touched - the backend
  // only serves a resized copy for this URL, cached after the first request.
  // Falls back to the normal full image automatically if resizing isn't
  // available on the server, so it's always safe to use.
  thumbUrl: (path: string, width = 400) => {
    if (!path) return path;
    if (path.startsWith("http")) return path; // external URLs are left as-is
    return `${API_URL}${path}?w=${width}`;
  },

  // Like thumbUrl, but safe for ANY admin-uploaded media: only plain raster
  // images (jpg/png/webp/avif) are resized to a compressed WebP copy. GIFs
  // (would lose animation), SVGs, videos and external URLs are returned
  // untouched, so nothing can break. Use this wherever a full-size original
  // was previously served into a small slot (banners, review photos, avatars).
  resizedUrl: (path: string, width = 800) => {
    if (!path) return path;
    if (path.startsWith("http")) return path;
    if (!/\.(jpe?g|png|webp|avif)$/i.test(path.split("?")[0])) return `${API_URL}${path}`;
    return `${API_URL}${path}?w=${width}`;
  },
};
