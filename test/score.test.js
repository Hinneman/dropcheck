import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRegistrationDate, scoreSignals } from "../extension/background/score.js";
import { rules, store } from "./helpers.js";

test("a plain Shopify store scores zero", () => {
  const v = scoreSignals(store(), rules);
  assert.equal(v.score, 0);
  assert.equal(v.band, "none");
});

test("non-store pages are not scored", () => {
  assert.equal(scoreSignals({ host: "example.com", isStore: false }, rules).band, "not_store");
});

test("page-derived detail is inserted literally, not as a replacement pattern", () => {
  const v = scoreSignals(store({ theme: { name: "Shrine $& $' x", dsTheme: "shrine" } }), rules);
  const fired = v.fired.find(f => f.id === "ds_theme");
  assert.ok(fired.text.includes("Shrine $& $' x"));
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
  const tagged = scoreSignals(store({ supplierTagIds: 40 }), rules).fired.find(f => f.id === "supplier_images");
  assert.ok(tagged);
  assert.ok(tagged.text.includes("40 products carry an Amazon product ID tag"));
  const mixed = scoreSignals(store({ supplierImageIds: 1, supplierTagIds: 1 }), rules);
  assert.ok(mixed.fired.some(f => f.id === "supplier_images"), "one image and one tag reach the minimum of 2");
  const one = scoreSignals(store({ supplierTagIds: 1 }), rules);
  assert.ok(!one.fired.some(f => f.id === "supplier_images"));
});

test("AI generator file names fire from two images", () => {
  assert.ok(!scoreSignals(store({ aiImages: 1 }), rules).fired.some(f => f.id === "ai_images"));
  const v = scoreSignals(store({ aiImages: 3 }), rules);
  assert.ok(v.fired.find(f => f.id === "ai_images").text.startsWith("3 product images"));
});

test("returns abroad and import charges fire with the page wording", () => {
  const v = scoreSignals(store({
    returnsAbroad: ["return address in Kina"],
    importCharge: "Importmoms debiteras dig."
  }), rules);
  assert.ok(v.fired.find(f => f.id === "returns_abroad").text.includes("return address in Kina"));
  assert.ok(v.fired.find(f => f.id === "import_charges").text.includes('"Importmoms debiteras dig."'));
});

test("a Swedish store with a Swedish number does not fire foreign_phone", () => {
  const identity = { ...store().identity, phoneCodes: ["46"] };
  assert.ok(!scoreSignals(store({ identity }), rules).fired.some(f => f.id === "foreign_phone"));
  const abroad = { ...identity, phoneCodes: ["31"] };
  assert.ok(scoreSignals(store({ identity: abroad }), rules).fired.some(f => f.id === "foreign_phone"));
});

test("Printful alone is context, not a signal", () => {
  const v = scoreSignals(store({ apps: ["printful"] }), rules);
  assert.equal(v.score, 0);
  assert.ok(v.context.some(n => n.includes("Printful")));
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
  const noId = { identity: { ...store().identity, hasCompanyId: false, orgNumbers: [] } };
  const norway = scoreSignals(store({ ...noId, market: { id: "no", name: "Norwegian", reason: "" } }), config);
  const sweden = scoreSignals(store(noId), config);
  assert.ok(!norway.fired.some(f => f.id === "no_org_number"));
  assert.ok(sweden.fired.some(f => f.id === "no_org_number"));
});

test("unknown domain age never fires domain_young", () => {
  const v = scoreSignals(store({ domain: { name: "example.com", createdAt: null, ageDays: null } }), rules);
  assert.ok(!v.fired.some(f => f.id === "domain_young"));
  assert.ok(v.context.some(n => n.includes("unknown")));
});

test("only domains whose registry publishes a date are looked up", () => {
  for (const name of ["example.no", "example.com", "example.shop"]) assert.ok(hasRegistrationDate(name), name);
  for (const name of ["example.se", "example.dk", "example.de"]) assert.ok(!hasRegistrationDate(name), name);
});

test("domains whose registry publishes no date say so instead of 'unknown'", () => {
  for (const name of ["example.se", "example.dk", "example.de"]) {
    const v = scoreSignals(store({ domain: { name, createdAt: null, ageDays: null } }), rules);
    assert.ok(!v.fired.some(f => f.id === "domain_young"));
    assert.ok(v.context.some(n => n.includes("not checked")), name);
    assert.ok(!v.context.some(n => n.includes("unknown")), name);
  }
});
