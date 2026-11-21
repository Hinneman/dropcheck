import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreSignals } from "../extension/background/score.js";

const rules = JSON.parse(readFileSync(new URL("../extension/rules/signals.json", import.meta.url), "utf8"));

function store(overrides = {}) {
  return {
    host: "example.se",
    isStore: true,
    platform: "shopify",
    apps: [],
    theme: { name: "Dawn", dsTheme: null },
    tld: { tld: "se", cheap: false },
    presentsSwedish: true,
    urgency: { countdown: false, stock: false, viewers: false },
    discount: { source: "catalog", sampled: 20, offs: Array(20).fill(0) },
    shipping: { quotes: [{ min: 1, max: 3 }], fastestMax: 3 },
    identity: { hasCompanyId: true, orgNumbers: ["559999-9991"], hasAddress: true,
                emails: ["hej@example.se"], boilerplate: [] },
    paymentMethods: ["visa", "klarna", "swish"],
    supplierImageIds: 0,
    domain: { name: "example.se", createdAt: "2015-01-01T00:00:00Z", ageDays: 4000 },
    ...overrides
  };
}

test("a plain Shopify store scores zero", () => {
  const v = scoreSignals(store(), rules);
  assert.equal(v.score, 0);
  assert.equal(v.band, "none");
});

test("non-store pages are not scored", () => {
  assert.equal(scoreSignals({ host: "example.com", isStore: false }, rules).band, "not_store");
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

test("unknown domain age never fires domain_young", () => {
  const v = scoreSignals(store({ domain: { name: "example.se", createdAt: null, ageDays: null } }), rules);
  assert.ok(!v.fired.some(f => f.id === "domain_young"));
  assert.ok(v.context.some(n => n.includes("unknown")));
});
