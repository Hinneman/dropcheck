// Sweden: Swedish wording, org. numbers, addresses, prices and market detection.
import { test } from "node:test";
import assert from "node:assert/strict";
import "../extension/content/markets.js";
import "../extension/content/detectors.js";

const D = globalThis.DropCheckDetectors;

test("payment detection ignores Swedish 'Visa mer'", () => {
  assert.deepEqual(D.detectPaymentMethods("Visa mer"), []);
});

test("Swedish urgency wording", () => {
  assert.ok(D.detectCountdownText("Rean slutar om 02:14:33"));
  assert.ok(D.detectStockUrgency("Skynda! Bara 3 kvar i lager"));
});

test("Swedish delivery times, ignoring ångerrätt and returns", () => {
  const text = "Leveranstid: 4-8 arbetsdagar.\nDu har 14 dagars ångerrätt. Returns accepted within 30 days.";
  assert.deepEqual(D.extractShippingQuotes(text), [{ min: 4, max: 8 }]);
});

test("findCompanyIds finds Swedish org. no. and VAT numbers", () => {
  assert.deepEqual(D.findCompanyIds("Org.nr 559999-9991").orgNumbers, ["559999-9991"]);
  assert.ok(D.findCompanyIds("VAT number SE559999999101").hasCompanyId);
});

test("Swedish org. no. needs a valid check digit", () => {
  assert.deepEqual(D.findCompanyIds("Org.nr 559999-9992").orgNumbers, []);
});

test("Swedish addresses", () => {
  assert.ok(D.detectAddress("Kvarngatan 2B, 123 45 Småby"));
});

test("Swedish prices", () => {
  assert.deepEqual(D.parsePrices("1 299,00 kr"), [1299]);
  assert.deepEqual(D.parsePrices("Ord. 899 kr Nu 269 kr"), [899, 269]);
  assert.deepEqual(D.parsePrices("199:-"), [199]);
});

test("detectMarket recognises Sweden from the page language", () => {
  assert.equal(D.detectMarket({ host: "example.com", lang: "sv" }).id, "se");
});
