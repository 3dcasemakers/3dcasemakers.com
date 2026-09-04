// Meta (Facebook) Pixel ID / Access Token (System User token with
// ads_management, for CAPI) / Ad Account ID (for the optional Insights
// endpoint) now come from environment variables instead of an admin-editable
// DB table. Set these in the backend's .env file:
//
//   META_PIXEL_ID=1437891504826595
//   META_ACCESS_TOKEN=EAAG...        (optional — only needed for server-side CAPI)
//   META_AD_ACCOUNT_ID=1234567890    (optional — only needed for /insights)
//
// Pixel ID is also hardcoded as a fallback below so PageView/ViewContent/etc.
// keep firing even if .env isn't set up yet.

const FALLBACK_PIXEL_ID = "1437891504826595";

async function getMetaCredentials() {
  const pixelId = process.env.META_PIXEL_ID || FALLBACK_PIXEL_ID || null;
  const accessToken = process.env.META_ACCESS_TOKEN || null;
  const adAccountId = process.env.META_AD_ACCOUNT_ID || null;
  return {
    pixelId,
    accessToken,
    adAccountId,
    enabled: !!pixelId,
  };
}

function invalidateMetaCredentialsCache() {
  // No-op now — credentials are read live from process.env each call.
}

module.exports = { getMetaCredentials, invalidateMetaCredentialsCache };
