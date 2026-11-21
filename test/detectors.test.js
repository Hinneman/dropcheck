import { test } from "node:test";
import assert from "node:assert/strict";
import "../extension/content/markets.js";
import "../extension/content/detectors.js";

const D = globalThis.DropCheckDetectors;

test("detectPlatform recognises Shopify from the CDN", () => {
  assert.equal(D.detectPlatform(["https://cdn.shopify.com/s/files/theme.js"], ""), "shopify");
  assert.equal(D.detectPlatform([], '<link href="/wp-content/plugins/woocommerce/x.css">'), "woocommerce");
  assert.equal(D.detectPlatform([], "<p>hello</p>"), null);
});

test("detectApps matches signatures in code markup", () => {
  const code = "https://cdn.dsers.com/app.js\nhttps://loox.io/widget/loox.js";
  assert.deepEqual(D.detectApps(code), ["dsers", "loox"]);
  assert.deepEqual(D.detectApps("https://example.com/app.js"), []);
});

test("detectTheme reads Shopify.theme and flags dropship themes", () => {
  const t = D.detectTheme('Shopify.theme = {"name":"Debutify 4.0","id":123};');
  assert.equal(t.name, "Debutify 4.0");
  assert.equal(t.dsTheme, "debutify");
  const dawn = D.detectTheme('Shopify.theme = {"name":"Dawn","id":1};');
  assert.equal(dawn.dsTheme, null);
});

test("payment detection ignores Swedish 'Visa mer'", () => {
  assert.deepEqual(D.detectPaymentMethods("Visa mer"), []);
  assert.deepEqual(D.detectPaymentMethods('aria-labelledby="pi-visa" pi-klarna swish'), ["visa", "klarna", "swish"]);
});

test("countSupplierImageIds finds AliExpress and Amazon file names", () => {
  const urls = [
    "https://cdn.shopify.com/s/files/1/products/Sd1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6.jpg?v=1",
    "https://cdn.shopify.com/s/files/1/products/H0123456789abcdef0123456789abcdefX.webp",
    "https://cdn.shopify.com/s/files/1/files/61AbCdEfGhL._AC_SL1500.jpg?v=1",
    "https://cdn.shopify.com/s/files/1/files/61AbCdEfGhL._AC_SL1500.jpg?v=2",
    "https://cdn.shopify.com/s/files/1/products/canvas-sneaker.jpg"
  ];
  assert.equal(D.countSupplierImageIds(urls), 2);
});

test("registrableDomain strips subdomains", () => {
  assert.equal(D.registrableDomain("shop.example.se"), "example.se");
  assert.equal(D.registrableDomain("www.example.co.uk"), "example.co.uk");
});

test("urgency detectors", () => {
  assert.ok(D.detectCountdownText("Rean slutar om 02:14:33"));
  assert.ok(!D.detectCountdownText("Open 10:00:00 to 18:00"));
  assert.ok(D.detectStockUrgency("Skynda! Bara 3 kvar i lager"));
  assert.ok(D.detectViewerCount("17 people are viewing this right now"));
  assert.ok(!D.detectViewerCount("Over 200 people love it"));
});

test("extractShippingQuotes ignores returns and processing", () => {
  const text = "Leveranstid: 4–8 arbetsdagar.\nDu har 14 dagars ångerrätt. Returns accepted within 30 days.";
  assert.deepEqual(D.extractShippingQuotes(text), [{ min: 4, max: 8 }]);

  const ds = "Processing time 1-3 days. Shipping takes 10-20 business days.";
  assert.deepEqual(D.extractShippingQuotes(ds), [{ min: 10, max: 20 }]);

  const weeks = "Delivery\n2-3 weeks";
  assert.deepEqual(D.extractShippingQuotes(weeks), [{ min: 14, max: 21 }]);
});

test("findCompanyIds finds Swedish org. no. and VAT numbers", () => {
  assert.deepEqual(D.findCompanyIds("Org.nr 559999-9991").orgNumbers, ["559999-9991"]);
  assert.ok(D.findCompanyIds("VAT number SE559999999101").hasCompanyId);
  assert.ok(!D.findCompanyIds("Contact us any time").hasCompanyId);
});

test("detectAddress handles Swedish and English addresses", () => {
  assert.ok(D.detectAddress("Kvarngatan 2B, 123 45 Småby"));
  assert.ok(D.detectAddress("12 Sample Street, Smalltown"));
  assert.ok(!D.detectAddress("We ship worldwide"));
});

test("extractEmails skips image names and platform addresses", () => {
  const emails = D.extractEmails("Mail shopname@gmail.com or logo@2x.png or x@sentry.io");
  assert.deepEqual(emails, ["shopname@gmail.com"]);
});

test("detectBoilerplate finds placeholders and the fake phone number", () => {
  assert.deepEqual(D.detectBoilerplate("Welcome to [Company Name]"), ['placeholder "[Company Name]"']);
  assert.deepEqual(D.detectBoilerplate("Ring +46 8 123 456 78"), ["placeholder phone number (123 456 7…)"]);
  assert.deepEqual(D.detectBoilerplate("Ring 08-555 123 45"), []);
});

test("parsePrices handles Swedish, US and euro formats", () => {
  assert.deepEqual(D.parsePrices("1 299,00 kr"), [1299]);
  assert.deepEqual(D.parsePrices("Ord. 899 kr Nu 269 kr"), [899, 269]);
  assert.deepEqual(D.parsePrices("$29.99"), [29.99]);
  assert.deepEqual(D.parsePrices("€1.299"), [1299]);
  assert.deepEqual(D.parsePrices("199:-"), [199]);
});

// ---------- Norway ----------

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

test("Swedish org. no. needs a valid check digit", () => {
  assert.deepEqual(D.findCompanyIds("Org.nr 559999-9992").orgNumbers, []);
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
  assert.equal(D.detectMarket({ host: "example.com", lang: "sv" }).id, "se");
  assert.equal(D.detectMarket({ host: "example.com", lang: "en", shopifyCountry: "NO" }).id, "no");
  assert.equal(D.detectMarket({ host: "example.com", lang: "en", text: "Pris 299 NOK" }).id, "no");
  assert.equal(D.detectMarket({ host: "example.com", lang: "en", text: "$29" }), null);
});

test("discountOff", () => {
  assert.equal(D.discountOff("269.00", "899.00"), 0.7);
  assert.equal(D.discountOff("100", null), 0);
});
