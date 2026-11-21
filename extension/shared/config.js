// Constants shared by the content scripts, the service worker and the popup.
//
// Loaded like markets.js: as a content script before collect.js, imported for its side
// effect by the module service worker and the popup, and imported by the Node tests.
// It therefore has no import/export and only attaches itself to globalThis.
(() => {
  if (globalThis.DropCheckConfig) return;

  const DAY_MS = 24 * 60 * 60 * 1000;

  globalThis.DropCheckConfig = Object.freeze({
    DAY_MS,
    // Site-level facts (policy pages, Shopify catalog) cached per host by collect.js and
    // pruned by the worker.
    SITE_TTL_MS: DAY_MS,
    // Automatic scanning is the optional permission for these origins.
    AUTO_SCAN_ORIGINS: Object.freeze(["https://*/*"])
  });
})();
