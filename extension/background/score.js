// Turns a signal object into a verdict using the weighted rules in rules/signals.json.
// Pure: no chrome.* calls, so the same code runs in the service worker and in Node.
import "../content/markets.js";
import "../content/detectors.js";

const D = globalThis.DropCheckDetectors;
const { MARKETS } = globalThis.DropCheckMarkets;

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

// Registries without a usable registration date. .se, .dk and .de publish none over
// HTTPS (WHOIS only). .no publishes one, but Norid registers the domain anew when it
// changes holder, so a shop that has traded for decades can show a date from last month.
// The worker does not look these domains up, so domain_young never fires for them.
const NO_REGISTRATION_DATE_TLDS = ["se", "dk", "de", "no"];
const tldOf = name => name.split(".").pop();
export const hasRegistrationDate = name => !NO_REGISTRATION_DATE_TLDS.includes(tldOf(name));

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
  // Image file names and import-app product tags both point at a marketplace listing.
  supplier_images(s, p) {
    const images = s.supplierImageIds || 0, tags = s.supplierTagIds || 0;
    if (images + tags < (p.min ?? 2)) return null;
    const parts = [];
    if (images) parts.push(images === 1 ? "1 product image keeps an AliExpress, Alibaba or Amazon file name"
      : `${images} product images keep AliExpress, Alibaba or Amazon file names`);
    if (tags) parts.push(tags === 1 ? "1 product carries an Amazon product ID tag"
      : `${tags} products carry an Amazon product ID tag`);
    return parts.join("; ");
  },
  ai_images(s, p) {
    return (s.aiImages || 0) >= (p.min ?? 2) ? String(s.aiImages) : null;
  },
  returns_abroad(s) {
    return s.returnsAbroad?.length ? s.returnsAbroad.join("; ") : null;
  },
  import_charges(s) {
    return s.importCharge || null;
  },
  // A weak stand-in for domain age, which .se, .dk, .de and .no registries do not give.
  // A shop that moved to Shopify or re-imported its catalog also looks new.
  catalog_young(s, p) {
    const days = s.catalog?.oldestProductDays;
    if (days == null || days >= p.maxAgeDays) return null;
    const capped = s.catalog.productCount >= 250 ? " (of the first 250 checked)" : "";
    return `${formatAge(days)}${capped}`;
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
    return q.min === q.max ? `${q.max} days` : `${q.min}-${q.max} days`;
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
  // Only when every phone number found is foreign: a shop may list a support line
  // abroad next to its domestic number. A neighbouring country's code does not count:
  // Nordic brands sell across the region, and Shopify may serve a Norwegian shop's
  // Swedish storefront, so the detected market is not always the shop's home.
  foreign_phone(s) {
    const market = s.market && MARKETS[s.market.id];
    const codes = s.identity?.phoneCodes || [];
    if (!market?.phoneCode || !codes.length || codes.includes(market.phoneCode)) return null;
    if (codes.every(c => (market.neighbourPhoneCodes || []).includes(c))) return null;
    return codes.map(c => `+${c}` + (D.phoneCountry(c) ? ` (${D.phoneCountry(c)})` : "")).join(", ");
  },
  // An address at another brand's domain, even next to the shop's own: policy pages
  // copied from another store, or one operator running several shops.
  other_domain_email(s) {
    const own = s.domain?.name || D.registrableDomain(s.host || "");
    const others = [...new Set((s.identity?.emails || []).map(e => D.registrableDomain(e.split("@")[1])))]
      .filter(d => !D.isFreemail(d) && !D.isServiceEmailDomain(d) &&
                   !D.sameBrand(d, own) && !D.sameBrand(d, s.host || own));
    return others.length ? others.join(", ") : null;
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
    else if (!hasRegistrationDate(s.domain.name)) {
      notes.push(`Domain age is not checked for .${tldOf(s.domain.name)} domains: the registry ` +
        "publishes no date that shows how long the shop has used the domain. This is neither a good nor a bad sign.");
    } else notes.push(`Domain age for ${s.domain.name} is unknown (registry lookup unavailable).`);
  }
  if (s.tld?.cheap) notes.push(`Uses the .${s.tld.tld} top-level domain.`);
  const market = s.market && MARKETS[s.market.id];
  if (market) notes.push(`Market: ${market.name} (from the ${s.market.reason}).`);
  const pm = s.paymentMethods || [];
  if (pm.length) notes.push(`Payment logos: ${pm.join(", ")}.`);
  if (market && pm.length && !pm.some(m => market.localPayments.includes(m))) {
    notes.push(`Presents itself as ${market.name} but shows no ${market.localPaymentLabel} option.`);
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

  // Per-market changes to a rule's weight or params, e.g. a market where showing a
  // company registration number is not expected.
  const overrides = (signals.market && config.marketOverrides?.[signals.market.id]) || {};

  const candidates = [];
  for (const base of config.rules) {
    const rule = { ...base, ...overrides[base.id] };
    const test = TESTS[rule.id];
    if (!test || rule.weight <= 0) continue;
    const detail = test(signals, rule.params || {});
    if (detail === null) continue;
    candidates.push({
      corroborating: rule.params?.corroborating === true,
      id: rule.id,
      category: rule.category,
      weight: rule.weight,
      // Function form: detail is page text and may contain "$&".
      text: rule.text.replace("{detail}", () => detail)
    });
  }
  // A corroborating rule counts only when the other signs already reach the mixed band:
  // many honest shops leave out their org. number, so it backs up suspicion but never
  // starts it.
  const independent = candidates.filter(f => !f.corroborating);
  const fired = tally(independent, config).score >= config.bands.mixed ? candidates : independent;
  for (const f of fired) delete f.corroborating;
  const { score, categories } = tally(fired, config);
  for (const f of fired) f.capped = categories[f.category].raw > categories[f.category].counted;

  const band = score >= config.bands.likely ? "likely" : score >= config.bands.mixed ? "mixed" : "none";
  return { ...base, band, score, fired, categories, context: contextNotes(signals) };
}

// Category sums, each capped, and their total.
function tally(fired, config) {
  const raw = {};
  for (const f of fired) raw[f.category] = (raw[f.category] || 0) + f.weight;
  const categories = {};
  let score = 0;
  for (const [cat, sum] of Object.entries(raw)) {
    const cap = config.categoryCaps[cat] ?? Infinity;
    categories[cat] = { raw: sum, counted: Math.min(sum, cap), cap };
    score += categories[cat].counted;
  }
  return { score, categories };
}

function maxScore(config) {
  const raw = {};
  for (const r of config.rules) raw[r.category] = (raw[r.category] || 0) + r.weight;
  return Object.entries(raw)
    .reduce((sum, [cat, w]) => sum + Math.min(w, config.categoryCaps[cat] ?? Infinity), 0);
}
