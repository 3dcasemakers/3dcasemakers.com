// Applies the admin-selected brand color (Settings -> Theme & Branding) to the
// whole storefront by setting CSS custom properties on :root. Every component
// that used to hardcode Tailwind's blue-600 now reads text-[var(--brand-primary)]
// etc, so this single function re-themes the entire site instantly.

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function shade(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => {
    const adjusted = percent < 0 ? c * (1 + percent) : c + (255 - c) * percent;
    return Math.max(0, Math.min(255, Math.round(adjusted)));
  });
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function applyThemeColors(primaryHex?: string | null) {
  const root = document.documentElement.style;
  if (!primaryHex || !hexToRgb(primaryHex)) {
    // Fall back to the original default blue (also set in index.css) so an
    // empty/invalid saved value never breaks the site.
    root.removeProperty("--brand-primary");
    root.removeProperty("--brand-primary-hover");
    root.removeProperty("--brand-primary-active");
    root.removeProperty("--brand-primary-soft");
    return;
  }
  const rgb = hexToRgb(primaryHex)!;
  root.setProperty("--brand-primary", primaryHex);
  root.setProperty("--brand-primary-hover", shade(primaryHex, -0.12)); // slightly darker
  root.setProperty("--brand-primary-active", shade(primaryHex, -0.24)); // darker still
  root.setProperty("--brand-primary-soft", `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.08)`);
}

// Font choices shown in Admin -> Themes. Values must match a font already
// loaded (Google Fonts import or @font-face) in index.css.
export const FONT_CHOICES: Record<string, string> = {
  default: '"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", ui-sans-serif, system-ui, sans-serif',
  dmsans: '"DM Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  inter: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  baloo: '"Baloo 2", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  coolvetica: '"Coolvetica", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
  jost: '"Jost", -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
};

// Text-size presets — scales the whole site's rem-based type (Tailwind's
// text-sm/base/lg/etc are all rem, so this is a genuine global scale).
export const FONT_SCALES: Record<string, string> = {
  sm: "93%",
  md: "100%",
  lg: "108%",
};

// Page transition animations — Admin -> Themes -> Page Transition. The class
// name is applied to the routed <main> content, which remounts (key=pathname)
// on every navigation, so the CSS "enter" animation fires automatically.
export const PAGE_TRANSITIONS: { key: string; label: string; className: string }[] = [
  { key: "none", label: "None (instant)", className: "" },
  { key: "fade", label: "Fade", className: "pt-fade" },
  { key: "slide-left", label: "Slide from Right", className: "pt-slide-left" },
  { key: "slide-right", label: "Slide from Left", className: "pt-slide-right" },
  { key: "slide-up", label: "Slide Up", className: "pt-slide-up" },
  { key: "slide-down", label: "Slide Down", className: "pt-slide-down" },
  { key: "zoom-in", label: "Zoom In", className: "pt-zoom-in" },
  { key: "zoom-out", label: "Zoom Out", className: "pt-zoom-out" },
  { key: "flip", label: "Flip", className: "pt-flip" },
  { key: "blur", label: "Blur In", className: "pt-blur" },
  { key: "rotate", label: "Rotate In", className: "pt-rotate" },
];

export interface ThemeSettings {
  themePrimaryColor?: string | null;
  themeButtonShape?: string | null; // Legacy saved key; buttons now share one standard shape.
  themeFont?: keyof typeof FONT_CHOICES | null;
  themeFontSize?: keyof typeof FONT_SCALES | null;
  themeMobileNavBg?: string | null;
  themeMobileNavText?: string | null;
  themeMobileNavActive?: string | null;
}

// Applies every admin-controlled theme setting to :root in one call. Safe to
// call with an empty/undefined object — every property falls back to the
// original hardcoded defaults already set in index.css.
export function applyTheme(settings: ThemeSettings | undefined | null) {
  const root = document.documentElement.style;

  applyThemeColors(settings?.themePrimaryColor);

  // Older themes may contain pill/square shapes. All actions now use the
  // shared --button-radius token, independently of card roundness settings.
  root.removeProperty("--brand-radius");

  const font = settings?.themeFont ? FONT_CHOICES[settings.themeFont] : null;
  if (font) root.setProperty("--brand-font", font);
  else root.removeProperty("--brand-font");

  const scale = settings?.themeFontSize ? FONT_SCALES[settings.themeFontSize] : null;
  if (scale) root.setProperty("--brand-font-scale", scale);
  else root.removeProperty("--brand-font-scale");

  if (settings?.themeMobileNavBg) root.setProperty("--mobile-nav-bg", settings.themeMobileNavBg);
  else root.removeProperty("--mobile-nav-bg");

  if (settings?.themeMobileNavText) root.setProperty("--mobile-nav-text", settings.themeMobileNavText);
  else root.removeProperty("--mobile-nav-text");

  if (settings?.themeMobileNavActive) root.setProperty("--mobile-nav-active", settings.themeMobileNavActive);
  else root.removeProperty("--mobile-nav-active");
}

// ---- Admin -> Customize (storefront look & feel) ---------------------------
// Colour overrides become CSS custom properties on :root (consumed by rules
// in index.css), corner styles become data-* attributes on <html>, and the
// admin's optional custom CSS is injected as a <style> tag. Every value is
// optional: when unset the property/attribute is removed and the storefront
// looks exactly as before.
const COLOR_VARS: Record<string, string> = {
  uiAccentColor: "--brand-accent",
  uiPageBg: "--ui-page-bg",
  uiHeadingColor: "--ui-heading-color",
  uiNavbarBg: "--ui-navbar-bg",
  uiNavbarText: "--ui-navbar-text",
  uiFooterBg: "--ui-footer-bg",
  uiFooterText: "--ui-footer-text",
  uiAnnouncementBg: "--ui-announcement-bg",
  uiAnnouncementText: "--ui-announcement-text",
  uiPriceColor: "--ui-price-color",
};

const isColor = (v: any) => typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());

export function applyStorefrontCustomization(settings: any) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(COLOR_VARS)) {
    const v = settings?.[key];
    if (isColor(v)) root.style.setProperty(cssVar, v.trim());
    else root.style.removeProperty(cssVar);
  }
  const attr = (name: string, value: string | null) => {
    if (value) root.setAttribute(name, value);
    else root.removeAttribute(name);
  };
  attr("data-banner-corners", "hard");
  attr("data-collection-banner-corners", "hard");
  attr("data-card-corners", settings?.uiCardCorners === "hard" ? "hard" : "rounded");
  attr("data-card-fit", settings?.uiCardImageFit === "cover" ? "cover" : null);

  // Soft corners are the default. Customize can override individual areas.
  // `sf` scopes storefront options away from the admin panel.
  const cls = root.classList;
  cls.add("sf");
  const soft: Record<string, string> = {
    uiSoftButtons: "sf-soft-buttons",
    uiSoftInputs: "sf-soft-inputs",
    uiSoftSelects: "sf-soft-selects",
    uiSoftCards: "sf-soft-cards",
    uiSoftBadges: "sf-soft-badges",
    uiSoftImages: "sf-soft-images",
  };
  for (const [key, c] of Object.entries(soft)) {
    if (settings?.[key] !== false) cls.add(c);
    else cls.remove(c);
  }
  const radius = Number(settings?.uiSoftRadius ?? 16);
  if (Number.isFinite(radius) && radius >= 0 && radius <= 40) root.style.setProperty("--sf-radius", `${radius}px`);
  else root.style.removeProperty("--sf-radius");
  // Small visual extras (on by default, each can be switched off)
  cls.toggle("sf-heading-accent", settings?.uiHeadingAccent !== false);
  cls.toggle("sf-card-zoom", settings?.uiCardHoverZoom !== false);

  let styleEl = document.getElementById("admin-custom-css") as HTMLStyleElement | null;
  const css = typeof settings?.uiCustomCss === "string" ? settings.uiCustomCss : "";
  if (css.trim()) {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "admin-custom-css";
      document.head.appendChild(styleEl);
    }
    // Strip anything that could close the style tag / pull in scripts.
    styleEl.textContent = css.replace(/<\/?style[^>]*>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  } else if (styleEl) {
    styleEl.remove();
  }
}

// Removes every storefront customization (used when entering the admin
// panel so the admin UI is never affected by storefront colours/custom CSS).
export function clearStorefrontCustomization() {
  applyStorefrontCustomization({});
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(
      "sf", "sf-soft-buttons", "sf-soft-inputs", "sf-soft-selects", "sf-soft-cards", "sf-soft-badges", "sf-soft-images",
      "sf-heading-accent", "sf-card-zoom"
    );
  }
}
