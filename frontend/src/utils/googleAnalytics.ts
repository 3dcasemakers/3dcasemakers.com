const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || "G-1YLMSDB06E";
let initialized = false;
let lastPath = "";

export function trackGooglePageView(path: string) {
  // Local audits and admin activity must not inflate customer analytics.
  if (!import.meta.env.PROD || path.startsWith("/admin") || typeof window === "undefined") return;
  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return;
  const analyticsWindow = window as typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  if (!initialized) {
    analyticsWindow.dataLayer ||= [];
    analyticsWindow.gtag ||= function () { analyticsWindow.dataLayer!.push(arguments); };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(script);
    analyticsWindow.gtag("js", new Date());
    analyticsWindow.gtag("config", MEASUREMENT_ID, { send_page_view: false });
    initialized = true;
  }
  if (path === lastPath) return;
  lastPath = path;
  analyticsWindow.gtag!("event", "page_view", {
    page_path: path, page_location: window.location.href, page_title: document.title,
  });
}
