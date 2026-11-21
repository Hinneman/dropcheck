// Bounds the signal object a content script sends before the worker scores and stores it.
// The content script is ours, but it reads hostile pages: field values are page-derived,
// and a compromised renderer could send anything. Pure, so the Node tests can run it.
import "../content/markets.js";

const { MARKETS } = globalThis.DropCheckMarkets;

// Every top-level field collect.js produces. Anything else is dropped.
const FIELDS = new Set([
  "v", "url", "host", "isStore", "platform", "apps", "theme", "tld", "market", "urgency",
  "discount", "shipping", "returnsAbroad", "importCharge", "identity", "paymentMethods",
  "productImages", "supplierImageIds", "supplierTagIds", "aiImages", "catalog", "pagesScanned",
  "error"
]);
// Keys that would change an object's prototype when assigned.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const LIMITS = Object.freeze({
  depth: 4,
  arrayItems: 250,     // a Shopify catalog page holds up to 250 products
  objectKeys: 40,
  stringLength: 2000
});

function bounded(value, depth) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, LIMITS.stringLength);
  if (depth >= LIMITS.depth || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    return value.slice(0, LIMITS.arrayItems).map(v => bounded(v, depth + 1));
  }
  const out = {};
  for (const key of Object.keys(value).slice(0, LIMITS.objectKeys)) {
    if (!UNSAFE_KEYS.has(key)) out[key] = bounded(value[key], depth + 1);
  }
  return out;
}

const isHttpsUrl = s => {
  try { return new URL(s).protocol === "https:"; } catch { return false; }
};

export function sanitizeSignals(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { v: 1, isStore: false };
  const out = {};
  for (const key of Object.keys(payload)) {
    if (FIELDS.has(key)) out[key] = bounded(payload[key], 1);
  }
  out.isStore = out.isStore === true;
  // The market id indexes MARKETS and the rule overrides, so it must be a known one.
  if (out.market && !Object.hasOwn(MARKETS, out.market.id)) out.market = null;
  // The popup loads these as images and links them to Google Lens.
  if (Array.isArray(out.productImages)) {
    out.productImages = out.productImages.filter(u => typeof u === "string" && isHttpsUrl(u)).slice(0, 3);
  }
  return out;
}
