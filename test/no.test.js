// Norway: Norwegian wording, org. numbers, addresses, prices, market detection and scoring.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../extension/content/markets.js";
import "../extension/content/detectors.js";
import { scoreSignals } from "../extension/background/score.js";
import { firedText, notesText, rules, store } from "./helpers.js";

const D = globalThis.DropCheckDetectors;

test("Norwegian returns abroad and import charges", () => {
  assert.deepEqual(D.detectReturnsAbroad("Returer sendes til vårt internasjonale lager."),
    ["warehouse:internasjonale lager"]);
  assert.ok(D.detectImportCharges("Toll og importmva betales av kunden ved levering."));
  assert.equal(D.detectImportCharges("Ingen toll eller avgifter, vi sender fra Norge."), null);
  assert.equal(D.detectImportCharges("For bestillinger utenfor Norge kan toll tilkomme, som betales av kunden."), null);
});

test("a Norwegian store with only a foreign phone number fires foreign_phone", () => {
  const no = { market: { id: "no", name: "Norwegian", reason: { by: "tld", value: "no" } } };
  const identity = { ...store().identity, phoneCodes: ["44"] };
  const v = scoreSignals(store({ ...no, identity }), rules);
  assert.ok(firedText(v, "foreign_phone").includes("+44 (United Kingdom)"));
  const both = { ...identity, phoneCodes: ["44", "47"] };
  assert.ok(!scoreSignals(store({ ...no, identity: both }), rules).fired.some(f => f.id === "foreign_phone"));
});

test("Norwegian urgency wording", () => {
  assert.ok(D.detectStockUrgency("Skynd deg! Kun 3 igjen på lager"));
  assert.ok(D.detectViewerCount("12 personer ser på dette nå"));
  assert.ok(D.detectCountdownText("Tilbudet slutter om 01:22:33"));
});

test("Norwegian delivery times, ignoring angrerett", () => {
  assert.deepEqual(D.extractShippingQuotes("Leveringstid: 2-5 virkedager.\nDu har 14 dagers angrerett."),
    [{ min: 2, max: 5 }]);
  assert.deepEqual(D.extractShippingQuotes("Levering tar 10 til 20 arbeidsdager"), [{ min: 10, max: 20 }]);
  assert.deepEqual(D.extractShippingQuotes("Frakt\n2-3 uker"), [{ min: 14, max: 21 }]);
});

test("Norwegian org. no. needs a keyword or MVA form and a valid check digit", () => {
  assert.deepEqual(D.findCompanyIds("Org.nr: 999 999 999").orgNumbers, ["999 999 999"]);
  assert.deepEqual(D.findCompanyIds("NO 999999999 MVA").orgNumbers, ["999999999"]);
  assert.deepEqual(D.findCompanyIds("Org.nr: 999 999 998").orgNumbers, []);   // bad check digit
  assert.deepEqual(D.findCompanyIds("Ordrenummer 999999999").orgNumbers, []);  // no keyword
});

test("Norwegian addresses", () => {
  assert.ok(D.detectAddress("Storgata 12, 1234 Småby"));
  assert.ok(D.detectAddress("Postboks 44, 1234 Småby, Norge"));
});

test("Norwegian prices and payment methods", () => {
  assert.deepEqual(D.parsePrices("Før 899,- Nå 299,-"), [899, 299]);
  assert.deepEqual(D.parsePrices("kr 1 299,-"), [1299]);
  assert.deepEqual(D.detectPaymentMethods('alt="Vipps" klarna'), ["klarna", "vipps"]);
});

test("detectMarket: domain, then language, then Shopify market, then currency", () => {
  assert.equal(D.detectMarket({ host: "example.no", lang: "en" }).id, "no");
  assert.equal(D.detectMarket({ host: "example.com", lang: "nb-NO" }).id, "no");
  assert.equal(D.detectMarket({ host: "example.com", lang: "en", shopifyCountry: "NO" }).id, "no");
  assert.equal(D.detectMarket({ host: "example.com", lang: "en", text: "Pris 299 NOK" }).id, "no");
});

test("a Norwegian store without Vipps, Klarna or invoice gets a context note", () => {
  const v = scoreSignals(store({
    host: "example.no",
    market: { id: "no", name: "Norwegian", reason: { by: "tld", value: "no" } },
    paymentMethods: ["visa", "paypal"]
  }), rules);
  assert.ok(notesText(v).some(n => n.includes("Norwegian but shows no Vipps, Klarna or invoice")));
  assert.equal(v.score, 0);
});
