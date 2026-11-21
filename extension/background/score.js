// Turns a signal object into a verdict using the weighted rules in rules/signals.json.
// Pure: no chrome.* calls, so the same code runs in the service worker and in Node.
import "../content/markets.js";
import "../content/detectors.js";

const D = globalThis.DropCheckDetectors;
const { MARKETS } = globalThis.DropCheckMarkets;

// Detected apps by role: supply apps are scored, the others are shown as context only.
const appsOfRole = (ids, role) =>
  (ids || []).filter(id => Object.hasOwn(D.APPS, id) && D.APPS[id].role === role).map(id => D.APPS[id].label);

// Registries without a usable registration date. .se, .dk and .de publish none over
// HTTPS (WHOIS only). .no publishes one, but Norid registers the domain anew when it
// changes holder, so a shop that has traded for decades can show a date from last month.
// The worker does not look these domains up, so domain_young never fires for them.
// The popup, site, privacy policy, README and store listing name these TLDs in this
// order; test/docs.test.js fails when they drift apart.
export const NO_REGISTRATION_DATE_TLDS = Object.freeze(["se", "no", "dk", "de"]);
const tldOf = name => name.split(".").pop();
export const hasRegistrationDate = name => !NO_REGISTRATION_DATE_TLDS.includes(tldOf(name));

// ".se, .no, .dk and .de"
export function formatTldList(tlds, and = "and") {
  const dotted = tlds.map(t => `.${t}`);
  return dotted.length < 2 ? dotted.join("") : `${dotted.slice(0, -1).join(", ")} ${and} ${dotted.at(-1)}`;
}

// The shop's own registrable domain: the looked-up one, else derived from the host.
const ownDomain = s => s.domain?.name || D.registrableDomain(s.host || "");

// The catalog reader stops after this many products (collect.js).
const CATALOG_PAGE = 250;

// Each test returns the parameters its text needs when the rule fires, or null when it
// does not. The text itself lives in i18n/<language>.js under the rule's id.
const TESTS = {
  dropship_app(s) {
    const apps = appsOfRole(s.apps, "supply");
    return apps.length ? { apps } : null;
  },
  // Image file names and import-app product tags both point at a marketplace listing.
  supplier_images(s, p) {
    const images = s.supplierImageIds || 0, tags = s.supplierTagIds || 0;
    return images + tags >= (p.min ?? 2) ? { images, tags } : null;
  },
  ai_images(s, p) {
    return (s.aiImages || 0) >= (p.min ?? 2) ? { count: s.aiImages } : null;
  },
  returns_abroad(s) {
    return s.returnsAbroad?.length ? { found: s.returnsAbroad } : null;
  },
  import_charges(s) {
    return s.importCharge ? { quote: s.importCharge } : null;
  },
  // A weak stand-in for domain age, which .se, .dk, .de and .no registries do not give.
  // A shop that moved to Shopify or re-imported its catalog also looks new.
  catalog_young(s, p) {
    const days = s.catalog?.oldestProductDays;
    if (days == null || days >= p.maxAgeDays) return null;
    return { days, checkedFirst: s.catalog.productCount >= CATALOG_PAGE ? CATALOG_PAGE : null };
  },
  domain_young(s, p) {
    const days = s.domain?.ageDays;
    return days != null && days < p.maxAgeDays ? { days } : null;
  },
  no_org_number(s) {
    return s.identity && !s.identity.hasCompanyId ? {} : null;
  },
  long_shipping(s, p) {
    const sh = s.shipping;
    if (!sh || sh.fastestMax == null || sh.fastestMax < p.minDays) return null;
    const q = sh.quotes.find(x => x.max === sh.fastestMax) || { min: sh.fastestMax, max: sh.fastestMax };
    return { min: q.min, max: q.max };
  },
  fake_urgency(s) {
    const u = s.urgency || {};
    const widgets = ["countdown", "stock", "viewers"].filter(w => u[w]);
    return widgets.length ? { widgets } : null;
  },
  blanket_discount(s, p) {
    const d = s.discount;
    if (!d || d.sampled < p.minSampled) return null;
    const deep = d.offs.filter(o => o >= p.deepOff).length;
    if (deep / d.sampled < p.minDeepShare) return null;
    return { deep, sampled: d.sampled, source: d.source, deepOff: p.deepOff };
  },
  boilerplate(s) {
    const phrases = s.identity?.boilerplate || [];
    return phrases.length ? { phrases } : null;
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
    return { phones: codes.map(code => ({ code, regions: D.phoneRegions(code) })) };
  },
  // An address at another brand's domain, even next to the shop's own: policy pages
  // copied from another store, or one operator running several shops.
  other_domain_email(s) {
    const own = ownDomain(s);
    const others = [...new Set((s.identity?.emails || []).map(e => D.registrableDomain(e.split("@")[1])))]
      .filter(d => !D.isFreemail(d) && !D.isServiceEmailDomain(d) &&
                   !D.sameBrand(d, own) && !D.sameBrand(d, s.host || own));
    return others.length ? { domains: others } : null;
  },
  generic_email(s) {
    const emails = s.identity?.emails || [];
    const own = ownDomain(s);
    const domains = emails.map(e => e.split("@")[1]);
    if (domains.some(d => d === own || d.endsWith("." + own))) return null;
    const free = domains.filter(d => D.isFreemail(d));
    return free.length ? { domains: [...new Set(free)] } : null;
  },
  ds_theme(s) {
    const t = s.theme;
    return t?.dsTheme ? { theme: t.name || t.dsTheme } : null;
  }
};

// Observations shown in the popup that carry no points, as { key, params }. The text
// lives in i18n/<language>.js under notes.<key>.
function contextNotes(s) {
  const notes = [];
  const note = (key, params = {}) => notes.push({ key, params });
  if (s.platform) note("platform", { platform: s.platform });
  const ctxApps = appsOfRole(s.apps, "context");
  if (ctxApps.length) note("contextApps", { apps: ctxApps });
  if (s.theme?.name && !s.theme.dsTheme) note("theme", { theme: s.theme.name });
  if (s.domain) {
    const domain = s.domain.name;
    if (s.domain.ageDays != null) note("domainRegistered", { domain, date: s.domain.createdAt.slice(0, 10) });
    else if (!hasRegistrationDate(domain)) note("domainAgeNotChecked", { tld: tldOf(domain) });
    else note("domainAgeUnknown", { domain });
  }
  if (s.tld?.cheap) note("cheapTld", { tld: s.tld.tld });
  const market = s.market && MARKETS[s.market.id];
  if (market) note("market", { market: s.market.id, reason: s.market.reason });
  const pm = s.paymentMethods || [];
  if (pm.length) note("paymentLogos", { methods: pm });
  if (market && pm.length && !pm.some(m => market.localPayments.includes(m))) {
    note("noLocalPayment", { market: s.market.id });
  }
  if (s.identity) {
    if (s.identity.orgNumbers.length) note("orgNumbers", { numbers: s.identity.orgNumbers });
    if (!s.identity.hasAddress) note("noAddress");
  }
  if (s.shipping && !s.shipping.quotes.length) note("noDeliveryTime");
  if (s.catalog) {
    note("catalog", { products: s.catalog.productCount, types: s.catalog.productTypes,
                      sample: s.catalog.typeSample.slice(0, 5) });
  }
  return notes;
}

export function scoreSignals(signals, config) {
  const base = { rulesVersion: config.version, maxScore: maxScore(config), bands: config.bands };
  if (!signals || !signals.isStore) {
    return { ...base, band: "not_store", score: 0, fired: [], context: [] };
  }

  // Per-market changes to a rule's weight or params, e.g. a market where showing a
  // company registration number is not expected.
  const overrides = (signals.market && config.marketOverrides?.[signals.market.id]) || {};

  const candidates = [];
  for (const ruleDef of config.rules) {
    const rule = { ...ruleDef, ...overrides[ruleDef.id] };
    const test = TESTS[rule.id];
    if (!test || rule.weight <= 0) continue;
    const params = test(signals, rule.params || {});
    if (params === null) continue;
    candidates.push({
      corroborating: rule.params?.corroborating === true,
      id: rule.id,
      category: rule.category,
      weight: rule.weight,
      params
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
