// Upgrade saved surface defaults once; banners always use square corners.
// Preserve later Customize choices for cards, inputs and other soft surfaces.
function withSoftCornerDefaults(settings = {}) {
  if (settings.uiCornerStyleVersion === 1) {
    return settings.uiBannerCorners === "hard" && settings.uiCollectionBannerCorners === "hard"
      ? settings
      : { ...settings, uiBannerCorners: "hard", uiCollectionBannerCorners: "hard" };
  }
  return {
    ...settings,
    uiCornerStyleVersion: 1,
    uiSoftButtons: true,
    uiSoftInputs: true,
    uiSoftSelects: true,
    uiSoftCards: true,
    uiSoftBadges: true,
    uiSoftImages: true,
    uiSoftRadius: 16,
    uiBannerCorners: "hard",
    uiCollectionBannerCorners: "hard",
    uiCardCorners: "rounded",
    ...(settings.themeButtonShape === "square" ? { themeButtonShape: "rounded" } : {}),
  };
}

module.exports = { withSoftCornerDefaults };
