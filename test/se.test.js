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

test("Swedish return address abroad and international warehouse", () => {
  const policy = "Returadress\nSkicka din retur till:\nUnit 1, Example Road 8, Example District\nKina\n" +
    "Vår registrerade företagsadress är ingen returadress.";
  assert.deepEqual(D.detectReturnsAbroad(policy), [
    "place:Kina", "notReturnAddress"]);
  assert.deepEqual(D.detectReturnsAbroad("Returer måste skickas till vårt internationella lager."),
    ["warehouse:internationella lager"]);
});

test("a Swedish return address at home is not flagged", () => {
  assert.deepEqual(D.detectReturnsAbroad("Returadress: Kvarngatan 2B, 123 45 Småby. Porslinet tillverkas i Kina."), []);
  assert.deepEqual(D.detectReturnsAbroad("Kontoret är ingen returadress, skicka returer till vårt lager i Småby."), []);
});

test("Swedish import charges paid by the buyer", () => {
  const s = D.detectImportCharges("Leverans 7-12 dagar.\nEventuell importmoms, tull och avgifter debiteras dig och ingår inte i varans pris.");
  assert.ok(s.startsWith("Eventuell importmoms"));
});

test("Swedish import charges limited to other countries, or denied, are not flagged", () => {
  assert.equal(D.detectImportCharges("Vid beställningar utanför EU kan tull tillkomma, som betalas av kunden."), null);
  assert.equal(D.detectImportCharges("Inga tullavgifter tillkommer, vi skickar från vårt lager i Småby."), null);
  assert.equal(D.detectImportCharges("Tull och importavgifter"), null);
  assert.equal(D.detectImportCharges("Klänning i tulle, ingår inte i rean."), null);
});

test("Swedish import charges under a heading for another country are not flagged", () => {
  assert.equal(D.detectImportCharges("Leverans till Storbritannien\nUK VAT, importtull och avgifter betalas av kunden."), null);
  assert.equal(D.detectImportCharges("Frakt till USA tar 5-8 dagar.\nTull tillkommer på din order i vissa stater."), null);
});

test("detectMarket recognises Sweden from the page language", () => {
  assert.equal(D.detectMarket({ host: "example.com", lang: "sv" }).id, "se");
});
