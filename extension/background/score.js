// Turns a signal object into a verdict using the weighted rules in rules/signals.json.
// Pure: no chrome.* calls, so the same code runs in the service worker and in Node.
import "../content/detectors.js";

const D = globalThis.DropCheckDetectors;

export const SUPPLY_APPS = {
  dsers: "DSers", cj: "CJ Dropshipping", zendrop: "Zendrop",
  autods: "AutoDS", spocket: "Spocket", oberlo: "Oberlo"
};
// Shown as context, never scored: Printful is print-on-demand (used by many honest
// brands), the others are review and conversion apps used by every kind of shop.
const CONTEXT_APPS = { printful: "Printful", vitals: "Vitals", loox: "Loox", judgeme: "Judge.me" };

export const BAND_LABELS = {
  likely: "Likely reseller",
  mixed: "Mixed signals",
  none: "No reseller signals found",
  not_store: "No shop detected"
};

const pct = x => `${Math.round(x * 100)} %`;

function formatAge(days) {
  if (days < 60) return `${days} days ago`;
  return `about ${Math.round(days / 30)} months ago`;
}

// Each test returns a detail string when the rule fires, or null when it does not.
const TESTS = {
  dropship_app(s) {
    const hits = (s.apps || []).filter(a => a in SUPPLY_APPS);
    return hits.length ? hits.map(a => SUPPLY_APPS[a]).join(", ") : null;
  },
  supplier_images(s, p) {
    return s.supplierImageIds >= (p.min ?? 2) ? String(s.supplierImageIds) : null;
  },
  domain_young(s, p) {
    const age = s.domain?.ageDays;
    return age != null && age < p.maxAgeDays ? formatAge(age) : null;
  },
  no_org_number(s) {
    return s.identity && !s.identity.hasCompanyId ? "" : null;
  },
  long_shipping(s, p) {
    const sh = s.shipping;
    if (!sh || sh.fastestMax == null || sh.fastestMax < p.minDays) return null;
    const q = sh.quotes.find(x => x.max === sh.fastestMax) || { min: sh.fastestMax, max: sh.fastestMax };
    return q.min === q.max ? `${q.max} days` : `${q.min}–${q.max} days`;
  },
  fake_urgency(s) {
    const u = s.urgency || {};
    const found = [
      u.countdown && "countdown timer",
      u.stock && '"only N left" stock counter',
      u.viewers && '"N people viewing" counter'
    ].filter(Boolean);
    return found.length ? found.join(", ") : null;
  },
  blanket_discount(s, p) {
    const d = s.discount;
    if (!d || d.sampled < p.minSampled) return null;
    const deep = d.offs.filter(o => o >= p.deepOff).length;
    const share = deep / d.sampled;
    if (share < p.minDeepShare) return null;
    const where = d.source === "catalog" ? "products in the catalog" : "products on this page";
    return `${deep} of ${d.sampled} ${where} are marked down ${pct(p.deepOff)} or more from a struck-through "regular" price.`;
  },
  boilerplate(s) {
    const b = s.identity?.boilerplate || [];
    return b.length ? b.join(", ") : null;
  },
  generic_email(s) {
    const emails = s.identity?.emails || [];
    const own = s.domain?.name || D.registrableDomain(s.host || "");
    const domains = emails.map(e => e.split("@")[1]);
    if (domains.some(d => d === own || d.endsWith("." + own))) return null;
    const free = domains.filter(d => D.isFreemail(d));
    return free.length ? [...new Set(free)].join(", ") : null;
  },
  ds_theme(s) {
    const t = s.theme;
    return t?.dsTheme ? (t.name || t.dsTheme) : null;
  }
};

// Observations shown in the popup that carry no points.
function contextNotes(s) {
  const notes = [];
  if (s.platform) notes.push(`Platform: ${s.platform}. Platform alone is not evidence and scores nothing.`);
  const ctxApps = (s.apps || []).filter(a => a in CONTEXT_APPS).map(a => CONTEXT_APPS[a]);
  if (ctxApps.length) notes.push(`Also loads: ${ctxApps.join(", ")}.`);
  if (s.theme?.name && !s.theme.dsTheme) notes.push(`Theme: ${s.theme.name}.`);
  if (s.domain) {
    if (s.domain.ageDays != null) notes.push(`Domain ${s.domain.name} registered ${s.domain.createdAt.slice(0, 10)}.`);
    else notes.push(`Domain age for ${s.domain.name} is unknown (registry lookup unavailable).`);
  }
  if (s.tld?.cheap) notes.push(`Uses the .${s.tld.tld} top-level domain.`);
  const pm = s.paymentMethods || [];
  if (pm.length) notes.push(`Payment logos: ${pm.join(", ")}.`);
  if (s.presentsSwedish && pm.length && !pm.some(m => D.LOCAL_SE_PAYMENTS.includes(m))) {
    notes.push("Presents itself as Swedish but shows no Klarna, Swish or invoice option.");
  }
  if (s.identity) {
    if (s.identity.orgNumbers.length) notes.push(`Org. no. shown: ${s.identity.orgNumbers.join(", ")}.`);
    if (!s.identity.hasAddress) notes.push("No postal address found.");
  }
  if (s.shipping && !s.shipping.quotes.length) notes.push("No delivery time stated on the pages read.");
  if (s.catalog) {
    notes.push(`Catalog: ${s.catalog.productCount} products in ${s.catalog.productTypes} product types` +
      (s.catalog.typeSample.length ? ` (${s.catalog.typeSample.slice(0, 5).join(", ")})` : "") + ".");
  }
  return notes;
}

export function scoreSignals(signals, config) {
  const base = { rulesVersion: config.version, maxScore: maxScore(config) };
  if (!signals || !signals.isStore) {
    return { ...base, band: "not_store", score: 0, fired: [], context: [] };
  }

  const fired = [];
  for (const rule of config.rules) {
    const test = TESTS[rule.id];
    if (!test) continue;
    const detail = test(signals, rule.params || {});
    if (detail === null) continue;
    fired.push({
      id: rule.id,
      category: rule.category,
      weight: rule.weight,
      text: rule.text.replace("{detail}", detail)
    });
  }

  const raw = {};
  for (const f of fired) raw[f.category] = (raw[f.category] || 0) + f.weight;
  const categories = {};
  let score = 0;
  for (const [cat, sum] of Object.entries(raw)) {
    const cap = config.categoryCaps[cat] ?? Infinity;
    categories[cat] = { raw: sum, counted: Math.min(sum, cap), cap };
    score += categories[cat].counted;
  }
  for (const f of fired) f.capped = categories[f.category].raw > categories[f.category].counted;

  const band = score >= config.bands.likely ? "likely" : score >= config.bands.mixed ? "mixed" : "none";
  return { ...base, band, score, fired, categories, context: contextNotes(signals) };
}

function maxScore(config) {
  const raw = {};
  for (const r of config.rules) raw[r.category] = (raw[r.category] || 0) + r.weight;
  return Object.entries(raw)
    .reduce((sum, [cat, w]) => sum + Math.min(w, config.categoryCaps[cat] ?? Infinity), 0);
}
