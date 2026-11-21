// The scorer returns ids and parameters; i18n/<language>.js turns them into text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreSignals } from "../extension/background/score.js";
import { LANGUAGES, LANGUAGE_NAMES, bandLabel, noteText, pickLanguage, ruleText }
  from "../extension/i18n/format.js";
import { rules, store } from "./helpers.js";

// A shop that fires every rule.
const everything = store({
  apps: ["dsers", "cj", "printful"],
  supplierImageIds: 2,
  supplierTagIds: 1,
  aiImages: 3,
  returnsAbroad: ["place:Kina", "warehouse:internationella lager", "notReturnAddress"],
  importCharge: "Importmoms debiteras dig.",
  domain: { name: "example.com", createdAt: "2026-09-01T00:00:00Z", ageDays: 80 },
  catalog: { productCount: 12, productTypes: 2, typeSample: ["Lamps", "Mugs"], vendors: [], oldestProductDays: 20 },
  identity: { hasCompanyId: false, orgNumbers: [], hasAddress: false, phoneCodes: ["44"],
              emails: ["shop@gmail.com", "info@otherbrand.example"], boilerplate: ["Your Company Name"] },
  shipping: { quotes: [{ min: 10, max: 20 }], fastestMax: 20 },
  urgency: { countdown: true, stock: true, viewers: true },
  discount: { source: "page", sampled: 5, offs: [0.6, 0.6, 0.7, 0.8, 0.1] },
  theme: { name: "Debutify", dsTheme: "debutify" }
});

test("every rule in signals.json has a text in every language", () => {
  for (const [lang, table] of Object.entries(LANGUAGES)) {
    for (const rule of rules.rules) assert.equal(typeof table.rules[rule.id], "function", `${lang}: ${rule.id}`);
  }
});

test("English rule texts", () => {
  const v = scoreSignals(everything, rules);
  const text = Object.fromEntries(v.fired.map(f => [f.id, ruleText(f, "en")]));
  assert.deepEqual(text, {
    dropship_app: "The page loads code from a dropshipping fulfilment app (DSers, CJ Dropshipping).",
    supplier_images: "Products copied from a marketplace: 2 product images keep AliExpress, Alibaba or " +
      "Amazon file names; 1 product carries an Amazon product ID tag.",
    ai_images: "3 product images keep the default file name of an AI image generator " +
      "(ChatGPT, Gemini, DALL-E or Higgsfield).",
    returns_abroad: "Returns are sent outside the EU or to an unnamed warehouse: return address in Kina; " +
      'returns go to an "internationella lager"; the company address is "not a return address".',
    import_charges: "Buyers are told to pay import VAT or customs, so goods come from outside the EU: " +
      '"Importmoms debiteras dig."',
    domain_young: "The domain was registered about 3 months ago.",
    catalog_young: "The oldest product in the catalog was added 20 days ago.",
    no_org_number: "No company registration or VAT number found on the page or its terms, " +
      "shipping and contact pages.",
    long_shipping: "Stated delivery time is 10-20 days.",
    fake_urgency: 'Pressure widgets on the page: countdown timer, "only N left" stock counter, ' +
      '"N people viewing" counter.',
    blanket_discount: '4 of 5 products on this page are marked down 50 % or more from a struck-through ' +
      '"regular" price.',
    boilerplate: "Unfilled template text: Your Company Name.",
    foreign_phone: "Every phone number listed has a foreign country code: +44 (United Kingdom).",
    other_domain_email: "The pages give an email address at another brand's domain (otherbrand.example).",
    generic_email: "Contact email is a free mailbox (gmail.com), not an address at the shop's own domain.",
    ds_theme: "Uses the Debutify theme, which is marketed almost only to dropshippers."
  });
});

// Fires every context note except the alternatives for unknown or unchecked domain age.
const allNotes = {
  ...everything,
  tld: { tld: "shop", cheap: true },
  paymentMethods: ["visa", "paypal"],
  identity: { ...everything.identity, orgNumbers: ["559999-9991"] },
  shipping: { quotes: [], fastestMax: null }
};

test("English context notes", () => {
  const v = scoreSignals(allNotes, rules);
  assert.deepEqual(v.context.map(n => noteText(n, "en")), [
    "Platform: shopify. Platform alone is not evidence and scores nothing.",
    "Also loads: Printful.",
    "Domain example.com registered 2026-09-01.",
    "Uses the .shop top-level domain.",
    "Market: Swedish (from the .se domain).",
    "Payment logos: visa, paypal.",
    "Presents itself as Swedish but shows no Klarna, Swish or invoice option.",
    "Org. no. shown: 559999-9991.",
    "No postal address found.",
    "No delivery time stated on the pages read.",
    "Catalog: 12 products in 2 product types (Lamps, Mugs)."
  ]);
});

test("band labels, and an unknown language falls back to English", () => {
  assert.equal(bandLabel("likely", "en"), "Likely dropshipper");
  assert.equal(bandLabel("likely", "xx"), "Likely dropshipper");
  assert.equal(bandLabel("likely", "__proto__"), "Likely dropshipper");
  assert.equal(bandLabel("none"), "No dropshipping signals found");
  assert.equal(bandLabel("likely", "sv"), "Trolig dropshippingbutik");
  assert.equal(bandLabel("likely", "nb"), "Sannsynlig dropshippingbutikk");
});

// Every key path of an object, functions as leaves: ["bands.likely", "ui.footer", ...].
const keyPaths = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) =>
  v && typeof v === "object" ? keyPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]).sort();

test("every language has the same keys as English, and a name in the popup", () => {
  const english = keyPaths(LANGUAGES.en);
  for (const [lang, table] of Object.entries(LANGUAGES)) {
    assert.deepEqual(keyPaths(table), english, lang);
    assert.ok(LANGUAGE_NAMES[lang], lang);
  }
});

test("every rule, note and band renders in every language without gaps", () => {
  const verdicts = [
    scoreSignals(allNotes, rules),
    scoreSignals(store({ domain: { name: "example.com", createdAt: null, ageDays: null } }), rules),
    scoreSignals(store({ domain: { name: "example.se", createdAt: null, ageDays: null } }), rules)
  ];
  for (const lang of Object.keys(LANGUAGES)) {
    const texts = verdicts.flatMap(v => [
      bandLabel(v.band, lang), ...v.fired.map(f => ruleText(f, lang)), ...v.context.map(n => noteText(n, lang))
    ]);
    for (const text of texts) assert.ok(text && !/undefined|null|NaN|\[object/.test(text), `${lang}: ${text}`);
  }
});

test("Swedish and Norwegian sentences", () => {
  const v = scoreSignals(everything, rules);
  const text = (id, lang) => ruleText(v.fired.find(f => f.id === id), lang);
  assert.equal(text("domain_young", "sv"), "Domänen registrerades för ungefär 3 månader sedan.");
  assert.equal(text("domain_young", "nb"), "Domenet ble registrert for omtrent 3 måneder siden.");
  assert.equal(text("long_shipping", "sv"), "Angiven leveranstid är 10-20 dagar.");
  assert.equal(text("foreign_phone", "sv"),
    "Alla telefonnummer som anges har utländsk landskod: +44 (Storbritannien).");
  assert.equal(text("returns_abroad", "nb"), "Returer sendes ut av EU eller til et ikke navngitt lager: " +
    'returadresse i Kina; returer går til et "internationella lager"; firmaadressen er "ikke en returadresse".');
  const notes = scoreSignals(allNotes, rules).context.map(n => noteText(n, "sv"));
  assert.ok(notes.includes("Marknad: Sverige (enligt .se-domänen)."));
  assert.ok(notes.includes("Riktar sig till Sverige men visar inte Klarna, Swish eller faktura som betalsätt."));
});

test("a phone code that rings two countries names both", () => {
  const identity = { ...store().identity, phoneCodes: ["1"] };
  const v = scoreSignals(store({ identity }), rules);
  const text = lang => ruleText(v.fired.find(f => f.id === "foreign_phone"), lang);
  assert.ok(text("en").endsWith("+1 (United States or Canada)."), text("en"));
  assert.ok(text("nb").endsWith("+1 (USA eller Canada)."), text("nb"));
});

test("singular forms", () => {
  const catalog = { productCount: 1, productTypes: 1, typeSample: [], vendors: [], oldestProductDays: 1 };
  const v = scoreSignals(store({ catalog }), rules);
  const note = lang => noteText(v.context.find(n => n.key === "catalog"), lang);
  assert.equal(note("en"), "Catalog: 1 product in 1 product type.");
  assert.equal(note("sv"), "Sortiment: 1 produkt i 1 produkttyp.");
  assert.equal(ruleText(v.fired.find(f => f.id === "catalog_young"), "en"),
    "The oldest product in the catalog was added 1 day ago.");
});

test("a return finding from an older stored verdict is shown as it is", () => {
  const v = scoreSignals(store({ returnsAbroad: ["return address in Kina"] }), rules);
  assert.ok(ruleText(v.fired.find(f => f.id === "returns_abroad"), "sv").includes("return address in Kina"));
});

test("the market reason is worded in each language", () => {
  const market = reason => scoreSignals(store({ market: { id: "se", name: "Swedish", reason } }), rules)
    .context.find(n => n.key === "market");
  assert.equal(noteText(market({ by: "lang", value: "sv-SE" }), "en"), 'Market: Swedish (from the page language "sv-SE").');
  assert.equal(noteText(market({ by: "shopify", value: "SE" }), "nb"), "Marked: Sverige (ut fra Shopify-markedet SE).");
  assert.equal(noteText(market({ by: "currency", value: "" }), "sv"), "Marknad: Sverige (enligt valutakoden).");
});

test("the browser language picks the popup language", () => {
  assert.equal(pickLanguage("sv"), "sv");
  assert.equal(pickLanguage("sv-FI"), "sv");
  for (const locale of ["nb", "nb-NO", "nn", "no"]) assert.equal(pickLanguage(locale), "nb", locale);
  for (const locale of ["en-US", "de", "da", ""]) assert.equal(pickLanguage(locale), "en", locale);
});