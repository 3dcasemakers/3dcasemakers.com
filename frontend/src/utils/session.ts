// Stable per-tab visitor id, shared by the silent heartbeat and abandoned-cart capture.
export function getSessionId(): string {
  let id = sessionStorage.getItem("3dcasemakers_session_id");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("3dcasemakers_session_id", id);
  }
  return id;
}
