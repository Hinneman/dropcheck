import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRegistrationDate, scoreSignals } from "../extension/background/score.js";
import { firedText, notesText, rules, store } from "./helpers.js";

test("a plain Shopify store scores zero", () => {
  const v = scoreSignals(store(), rules);
  assert.equal(v.score, 0);
  assert.equal(v.band, "none");
});

test("non-store pages are not scored", () => {
  assert.equal(scoreSignals({ host: "example.com", isStore: false }, rules).band, "not_store");
});

test("a marketplace page gets the marketplace band and no score", () => {
  const v = scoreSignals({ isStore: false, marketplace: { id: "temu", name: "Temu", open: false } }, rules);
  assert.equal(v.band, "marketplace");
  assert.deepEqual(v.marketplace, { id: "temu", name: "Temu", open: false });
  assert.equal(v.score, 0);
  assert.deepEqual(v.fired, []);
});

test("an open marketplace gets the milder band", () => {
  const v = scoreSignals({ isStore: false, marketplace: { id: "amazon", name: "Amazon", open: true } }, rules);
  assert.equal(v.band, "open_marketplace");
  assert.equal(v.score, 0);
});

test("page-derived detail is inserted literally, not as a replacement pattern", () => {
  const v = scoreSignals(store({ theme: { name: "Shrine $& $' x", dsTheme: "shrine" } }), rules);
  assert.ok(firedText(v, "ds_theme").includes("Shrine $& $' x"));
});

test("a typical dropshipper lands in likely", () => {
  const v = scoreSignals(store({
    apps: ["dsers"],
    urgency: { countdown: true, stock: true, viewers: false },
    discount: { source: "catalog", sampled: 10, offs: Array(10).fill(0.7) },
    shipping: { quotes: [{ min: 10, max: 20 }], fastestMax: 20 },
    identity: { hasCompanyId: false, orgNumbers: [], hasAddress: false,
                emails: ["store@gmail.com"], boilerplate: [] },
    domain: { name: "example.se", createdAt: "2026-09-01T00:00:00Z", ageDays: 80 }
  }), rules);
  assert.equal(v.band, "likely");
  const ids = v.fired.map(f => f.id);
  for (const id of ["dropship_app", "domain_young", "no_org_number", "long_shipping",
                    "fake_urgency", "blanket_discount", "generic_email"]) {
    assert.ok(ids.includes(id), `${id} should fire`);
  }
});

test("category caps stop stacking", () => {
  const v = scoreSignals(store({
    apps: ["dsers", "cj"],
    supplierImageIds: 5,
    shipping: { quotes: [{ min: 14, max: 21 }], fastestMax: 21 },
    theme: { name: "Debutify", dsTheme: "debutify" }
  }), rules);
  assert.equal(v.categories.supply.raw, 100);
  assert.equal(v.categories.supply.counted, 50);
  assert.equal(v.score, 50);
  assert.equal(v.band, "mixed");
  assert.ok(v.fired.every(f => f.capped));
});

test("Amazon product ID tags count as supplier evidence", () => {
  const tagged = scoreSignals(store({ supplierTagIds: 40 }), rules);
  assert.ok(firedText(tagged, "supplier_images").includes("40 products carry an Amazon product ID tag"));
  const mixed = scoreSignals(store({ supplierImageIds: 1, supplierTagIds: 1 }), rules);
  assert.ok(mixed.fired.some(f => f.id === "supplier_images"), "one image and one tag reach the minimum of 2");
  const one = scoreSignals(store({ supplierTagIds: 1 }), rules);
  assert.ok(!one.fired.some(f => f.id === "supplier_images"));
});

test("AI generator file names fire from two images", () => {
  assert.ok(!scoreSignals(store({ aiImages: 1 }), rules).fired.some(f => f.id === "ai_images"));
  const v = scoreSignals(store({ aiImages: 3 }), rules);
  assert.ok(firedText(v, "ai_images").startsWith("3 product images"));
});

test("returns abroad and import charges fire with the page wording", () => {
  const v = scoreSignals(store({
    returnsAbroad: ["place:Kina"],
    importCharge: "Importmoms debiteras dig."
  }), rules);
  assert.ok(firedText(v, "returns_abroad").includes("return address in Kina"));
  assert.ok(firedText(v, "import_charges").includes('"Importmoms debiteras dig."'));
});

test("a Swedish store with a Swedish number does not fire foreign_phone", () => {
  const identity = { ...store().identity, phoneCodes: ["46"] };
  assert.ok(!scoreSignals(store({ identity }), rules).fired.some(f => f.id === "foreign_phone"));
  const abroad = { ...identity, phoneCodes: ["31"] };
  assert.ok(scoreSignals(store({ identity: abroad }), rules).fired.some(f => f.id === "foreign_phone"));
});

test("a neighbouring Nordic country code does not fire foreign_phone", () => {
  for (const phoneCodes of [["47"], ["45", "358"]]) {
    const identity = { ...store().identity, phoneCodes };
    assert.ok(!scoreSignals(store({ identity }), rules).fired.some(f => f.id === "foreign_phone"), phoneCodes.join());
  }
  const mixed = { ...store().identity, phoneCodes: ["47", "86"] };
  assert.ok(scoreSignals(store({ identity: mixed }), rules).fired.some(f => f.id === "foreign_phone"));
});

test("no_org_number counts only when the other signs already reach mixed", () => {
  const identity = { ...store().identity, hasCompanyId: false, orgNumbers: [] };
  const alone = scoreSignals(store({ identity }), rules);
  assert.ok(!alone.fired.some(f => f.id === "no_org_number"));
  assert.equal(alone.score, 0);
  // A free mailbox (10) stays below the mixed band, so the missing number adds nothing.
  const weak = scoreSignals(store({ identity: { ...identity, emails: ["store@gmail.com"] } }), rules);
  assert.ok(!weak.fired.some(f => f.id === "no_org_number"));
  assert.equal(weak.band, "none");
  // Supplier images (30) reach mixed; then the missing number counts too.
  const strong = scoreSignals(store({ identity, supplierImageIds: 5 }), rules);
  assert.ok(strong.fired.some(f => f.id === "no_org_number"));
  assert.equal(strong.score, 50);
});

test("catalog_young fires on a new catalog and says when the first page was capped", () => {
  const catalog = { productCount: 250, productTypes: 1, typeSample: [], vendors: [], oldestProductDays: 40 };
  assert.ok(firedText(scoreSignals(store({ catalog }), rules), "catalog_young")
    .includes("40 days ago (of the first 250 checked)"));
  const small = { ...catalog, productCount: 12 };
  assert.equal(firedText(scoreSignals(store({ catalog: small }), rules), "catalog_young"),
    "The oldest product in the catalog was added 40 days ago.");
  const old = { ...catalog, oldestProductDays: 900 };
  assert.ok(!scoreSignals(store({ catalog: old }), rules).fired.some(f => f.id === "catalog_young"));
});

test("other_domain_email fires on another brand's address, even next to the shop's own", () => {
  const withEmails = emails => store({ identity: { ...store().identity, emails } });
  // ".example" is a reserved top-level domain, so "otherbrand.example" is fictional too.
  assert.ok(firedText(scoreSignals(withEmails(["info@otherbrand.example"]), rules), "other_domain_email")
    .includes("otherbrand.example"));
  assert.ok(scoreSignals(withEmails(["hej@example.se", "info@otherbrand.example"]), rules).fired
    .some(f => f.id === "other_domain_email"));
  for (const emails of [["hej@example.se", "order@example.com"], ["hej@example-shop.com"],
                        ["kundservice@klarna.se"], ["store@gmail.com"]]) {
    assert.ok(!scoreSignals(withEmails(emails), rules).fired.some(f => f.id === "other_domain_email"),
      emails.join(" "));
  }
});

test("Printful alone is context, not a signal", () => {
  const v = scoreSignals(store({ apps: ["printful"] }), rules);
  assert.equal(v.score, 0);
  assert.ok(notesText(v).some(n => n.includes("Printful")));
});

test("a free mailbox does not fire when the shop also uses its own domain", () => {
  const ownAndFree = store({ identity: { ...store().identity, emails: ["hej@example.se", "x@gmail.com"] } });
  assert.ok(!scoreSignals(ownAndFree, rules).fired.some(f => f.id === "generic_email"));
});

test("a single domestic delivery quote keeps long_shipping off", () => {
  const v = scoreSignals(store({
    shipping: { quotes: [{ min: 1, max: 3 }, { min: 10, max: 20 }], fastestMax: 3 }
  }), rules);
  assert.ok(!v.fired.some(f => f.id === "long_shipping"));
});

test("market overrides change a rule for that market only", () => {
  const config = { ...rules, marketOverrides: { no: { no_org_number: { weight: 0 } } } };
  // Supplier images as well: no_org_number counts only once other signs reach "mixed".
  const noId = { identity: { ...store().identity, hasCompanyId: false, orgNumbers: [] }, supplierImageIds: 5 };
  const norway = scoreSignals(store({ ...noId, market: { id: "no", name: "Norwegian", reason: { by: "tld", value: "no" } } }), config);
  const sweden = scoreSignals(store(noId), config);
  assert.ok(!norway.fired.some(f => f.id === "no_org_number"));
  assert.ok(sweden.fired.some(f => f.id === "no_org_number"));
});

test("unknown domain age never fires domain_young", () => {
  const v = scoreSignals(store({ domain: { name: "example.com", createdAt: null, ageDays: null } }), rules);
  assert.ok(!v.fired.some(f => f.id === "domain_young"));
  assert.ok(notesText(v).some(n => n.includes("unknown")));
});

test("only domains whose registry publishes a date are looked up", () => {
  for (const name of ["example.com", "example.shop"]) assert.ok(hasRegistrationDate(name), name);
  // .no: Norid's date restarts when the domain changes holder, so it is not used.
  for (const name of ["example.se", "example.dk", "example.de", "example.no"]) assert.ok(!hasRegistrationDate(name), name);
});

test("domains whose registry publishes no date say so instead of 'unknown'", () => {
  for (const name of ["example.se", "example.dk", "example.de", "example.no"]) {
    const v = scoreSignals(store({ domain: { name, createdAt: null, ageDays: null } }), rules);
    assert.ok(!v.fired.some(f => f.id === "domain_young"));
    assert.ok(notesText(v).some(n => n.includes("not checked")), name);
    assert.ok(!notesText(v).some(n => n.includes("unknown")), name);
  }
});
