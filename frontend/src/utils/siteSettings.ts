import { useEffect, useState } from "react";
import { api } from "./api";

// Shared hook for storefront components that need admin settings. Uses the
// de-duplicated api.get("/api/settings") (see utils/api.ts), so any number
// of components can call this without extra network requests.
export function useSiteSettings(): any {
  const [settings, setSettings] = useState<any>({});
  useEffect(() => {
    let alive = true;
    let refreshSequence = 0;
    const refresh = () => {
      const sequence = ++refreshSequence;
      return api
      .get("/api/settings")
      .then((s) => {
        if (alive && sequence === refreshSequence) setSettings(s || {});
      })
      .catch(() => {});
    };
    refresh();
    window.addEventListener("3dcasemakers:settings-updated", refresh);
    return () => {
      alive = false;
      window.removeEventListener("3dcasemakers:settings-updated", refresh);
    };
  }, []);
  return settings;
}

// ---- Admin -> Customize defaults -------------------------------------------
// Every key is optional in the saved settings; these are what the storefront
// uses when the admin hasn't changed anything, so behaviour is identical to
// before until an option is actually changed.
export const UI_DEFAULTS = {
  uiBannerCorners: "hard" as "hard" | "rounded",
  uiBannerAutoplaySec: 5,
  uiBannerShowDots: true,
  uiBannerShowArrows: false,
  uiBannerFullWidth: false,
  uiCollectionBannerCorners: "hard" as "hard" | "rounded",
  uiCardCorners: "rounded" as "hard" | "rounded",
  uiCardShowRating: true,
  uiCardShowDiscountBadge: true,
  uiCardShowTags: true,
  uiCardImageFit: "contain" as "contain" | "cover",
  uiProductsPerPage: 24,
  uiCollectionGridDesktopCols: 3,
  uiCollectionGridMobileCols: 2,
  uiHomeHiddenSections: [] as string[],
  uiPopularTitle: "Popular Products",
  uiMenuTagline: "Products That Tell Your Story",
  uiMenuShowPolicies: true,
  uiShowSearchBar: true,
  uiShowBackToTop: true,
};

export function ui<K extends keyof typeof UI_DEFAULTS>(settings: any, key: K): (typeof UI_DEFAULTS)[K] {
  const v = settings?.[key];
  if (v === undefined || v === null || v === "") return UI_DEFAULTS[key];
  return v;
}
