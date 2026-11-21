import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, sanitizeSignals } from "../extension/background/sanitize.js";
import { scoreSignals } from "../extension/background/score.js";
import { rules, store } from "./helpers.js";

test("a normal signal object passes through unchanged, except the worker-only domain", () => {
  const { domain, ...fromPage } = store({ productImages: ["https://example.se/a.jpg"], pagesScanned: ["/pages/contact"] });
  assert.deepEqual(sanitizeSignals(fromPage), fromPage);
  // Domain age comes from the worker's RDAP lookup; a page must not supply its own.
  assert.ok(!("domain" in sanitizeSignals({ ...fromPage, domain })));
});

test("unknown fields and prototype keys are dropped", () => {
  const payload = JSON.parse('{"isStore": true, "extra": 1, "identity": {"__proto__": {"x": 1}, "emails": []}}');
  const out = sanitizeSignals(payload);
  assert.ok(!("extra" in out));
  assert.equal(Object.getPrototypeOf(out.identity), Object.prototype);
  assert.ok(!Object.hasOwn(out.identity, "__proto__"));
});

test("strings, arrays and nesting are bounded", () => {
  const out = sanitizeSignals({
    isStore: true,
    importCharge: "x".repeat(LIMITS.stringLength + 500),
    returnsAbroad: Array(LIMITS.arrayItems + 50).fill("a"),
    catalog: { a: { b: { c: { d: 1 } } } }
  });
  assert.equal(out.importCharge.length, LIMITS.stringLength);
  assert.equal(out.returnsAbroad.length, LIMITS.arrayItems);
  assert.equal(out.catalog.a.b.c, null);
});

test("non-finite numbers become null and isStore must be true", () => {
  const out = sanitizeSignals({ isStore: "yes", aiImages: Infinity });
  assert.equal(out.isStore, false);
  assert.equal(out.aiImages, null);
});

test("an unknown market id is dropped, so scoring cannot index the prototype", () => {
  const out = sanitizeSignals(store({ market: { id: "__proto__", name: "x", reason: "y" } }));
  assert.equal(out.market, null);
  assert.doesNotThrow(() => scoreSignals(out, rules));
});

test("product images must be https and at most three", () => {
  const out = sanitizeSignals({
    isStore: true,
    productImages: ["javascript:alert(1)", "http://example.se/a.jpg", "https://example.se/1.jpg",
                    "https://example.se/2.jpg", "https://example.se/3.jpg", "https://example.se/4.jpg"]
  });
  assert.deepEqual(out.productImages, ["https://example.se/1.jpg", "https://example.se/2.jpg", "https://example.se/3.jpg"]);
});

test("a missing or malformed payload is not a store", () => {
  for (const p of [undefined, null, "x", [1]]) assert.deepEqual(sanitizeSignals(p), { v: 1, isStore: false });
});
