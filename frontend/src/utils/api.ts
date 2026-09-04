// Base URL of the Node/Express + MySQL backend.
// In dev this points to localhost:5000; in production set VITE_API_URL in .env.production
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function authHeader(): Record<string, string> {
  const token = sessionStorage.getItem("3dcasemakers_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Session missing/expired: clear the stale token and bounce to login instead of
    // leaving the admin stuck on a silently-failing save.
    if (res.status === 401 && typeof window !== "undefined") {
      sessionStorage.removeItem("3dcasemakers_admin_token");
      if (!window.location.pathname.includes("/admin/login")) {
        window.location.href = "/admin/login";
      }
    }
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  get: (path: string) => fetch(`${API_URL}${path}`).then(handle),

  getAuth: (path: string) => fetch(`${API_URL}${path}`, { headers: authHeader() }).then(handle),

  post: (path: string, body: any, auth = false) =>
    fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? authHeader() : {}) },
      body: JSON.stringify(body),
    }).then(handle),

  put: (path: string, body: any) =>
    fetch(`${API_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
    }).then(handle),

  del: (path: string) =>
    fetch(`${API_URL}${path}`, { method: "DELETE", headers: authHeader() }).then(handle),

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
};
