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

test("detectPaymentMethods reads icon markup", () => {
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
  assert.equal(D.countSupplierImageIds(urls), 3);
});

test("countSupplierImageIds accepts the letter after an AliExpress hash", () => {
  const urls = [
    "https://cdn.shopify.com/s/files/1/files/Sd1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6g.jpg?v=1",
    "https://cdn.shopify.com/s/files/1/files/H0123456789abcdef0123456789abcdefk.webp",
    "https://cdn.shopify.com/s/files/1/files/Sd1c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6gx.jpg"
  ];
  assert.equal(D.countSupplierImageIds(urls), 2);
});

test("countSupplierImageIds finds Alibaba, Taobao and 1688 image IDs", () => {
  const urls = [
    "https://cdn.shopify.com/s/files/1/files/O1CN01AbCdEf1gHiJkLmNoP__2200000000000-0-cib.jpg?v=1",
    "https://cdn.shopify.com/s/files/1/files/O1CN01AbCdEf1gHiJkLmNoP__2200000000000-0-cib_0f0f0f0f.jpg",
    "https://cdn.shopify.com/s/files/1/files/O1CN01ZyXwVu9tSrQpOnMlK.jpg",
    "https://cdn.shopify.com/s/files/1/files/O1CN-poster.jpg"
  ];
  assert.equal(D.countSupplierImageIds(urls), 2);
});

test("countAiImages finds default AI generator file names", () => {
  const urls = [
    "https://cdn.shopify.com/s/files/1/files/ChatGPT_Image_Sep_4_2026_12_32_05_AM_0f0f.png?v=1",
    "https://cdn.shopify.com/s/files/1/files/ChatGPTImage31aug2026_16_04_15.png",
    "https://cdn.shopify.com/s/files/1/files/Gemini_Generated_Image_ab12cd.png",
    "https://cdn.shopify.com/s/files/1/files/DALL%C2%B7E_2026-01-01_12.00.00.png",
    "https://cdn.shopify.com/s/files/1/files/hf_20260703_190536_0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f.png",
    "https://cdn.shopify.com/s/files/1/files/hf_20260703_190537_0f0f0f0f-0f0f-4f0f-af0f-0f0f0f0f0f0f-edited-2.webp",
    "https://cdn.shopify.com/s/files/1/files/chatgpt-guide-cover.jpg",
    "https://cdn.shopify.com/s/files/1/files/gemini-necklace.jpg",
    "https://cdn.shopify.com/s/files/1/files/hf_logo.png",
    "https://cdn.shopify.com/s/files/1/files/hf_20260703_190538_0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f.png"
  ];
  assert.equal(D.countAiImages(urls), 6);
});

test("countSupplierTags counts distinct Amazon product ID tags", () => {
  const tags = ["amazon-B0AAAA1111", "amazon-B0AAAA1111", " amazon-b0bbbb2222", "Summer",
                "amazon-best-seller", "import_2019_02_28_103625"];
  assert.equal(D.countSupplierTags(tags), 2);
  assert.equal(D.countSupplierTags([]), 0);
});

test("countImportSourceTags counts import-source ID tags only", () => {
  const tags = ["import-source:0123456789abcdef01234567", "import-source:abc", "import_2019_03_16_160504"];
  assert.equal(D.countImportSourceTags(tags), 1);
});

test("returns abroad in English and German", () => {
  assert.deepEqual(D.detectReturnsAbroad("Approved returns must be sent to the following address: Unit 1, Example Road, Shenzhen, China."),
    ["return address in Shenzhen"]);
  assert.deepEqual(D.detectReturnsAbroad("Bestätigte Rückgaben werden an folgende Adresse gesendet: Beispielstraße 1, Guangzhou, China"),
    ["return address in Guangzhou"]);
  assert.deepEqual(D.detectReturnsAbroad("Returns are handled by our overseas warehouse."),
    ['returns go to an "overseas warehouse"']);
});

test("import charges in English and German", () => {
  assert.ok(D.detectImportCharges("Import duties and taxes are the responsibility of the customer."));
  assert.equal(D.detectImportCharges("For customers outside the EU, customs duties may apply and are paid by the customer."), null);
  assert.equal(D.detectImportCharges("No customs fees, everything ships from Europe and is paid by us."), null);
  assert.ok(D.detectImportCharges("Zollgebühren sind vom Käufer zu tragen."));
  assert.equal(D.detectImportCharges("Bei Lieferungen in Nicht-EU-Länder sind Zollgebühren vom Empfänger zu tragen."), null);
});

test("extractPhoneCodes reads international numbers", () => {
  assert.deepEqual(D.extractPhoneCodes("Telefon: +1 (555) 010 0199\nTel +46 8 123 456 78"), ["1", "46"]);
  assert.deepEqual(D.extractPhoneCodes("Ring +31612345678 eller +358 40 1234567"), ["31", "358"]);
  assert.deepEqual(D.extractPhoneCodes("Spara +50 kr och 12+ år"), []);
});

test("sameBrand compares domain names, not top-level domains", () => {
  assert.ok(D.sameBrand("example.se", "shop.example.com"));
  assert.ok(D.sameBrand("example-shop.se", "example.com"));
  assert.ok(!D.sameBrand("example-mode.se", "examplestockholm.com"));
  assert.ok(!D.sameBrand("abc.se", "abcd.se"));
});

test("registrableDomain strips subdomains", () => {
  assert.equal(D.registrableDomain("shop.example.se"), "example.se");
  assert.equal(D.registrableDomain("www.example.co.uk"), "example.co.uk");
});

test("urgency detectors", () => {
  assert.ok(!D.detectCountdownText("Open 10:00:00 to 18:00"));
  assert.ok(D.detectViewerCount("17 people are viewing this right now"));
  assert.ok(!D.detectViewerCount("Over 200 people love it"));
});

test("extractShippingQuotes ignores processing time and reads weeks", () => {
  const ds = "Processing time 1-3 days. Shipping takes 10-20 business days.";
  assert.deepEqual(D.extractShippingQuotes(ds), [{ min: 10, max: 20 }]);

  const weeks = "Delivery\n2-3 weeks";
  assert.deepEqual(D.extractShippingQuotes(weeks), [{ min: 14, max: 21 }]);
});

test("extractShippingQuotes accepts en and em dashes in ranges", () => {
  assert.deepEqual(D.extractShippingQuotes("Shipping 4\u20138 days"), [{ min: 4, max: 8 }]);
  assert.deepEqual(D.extractShippingQuotes("Shipping 4\u20148 days"), [{ min: 4, max: 8 }]);
});

test("findCompanyIds needs registration wording or a number", () => {
  assert.ok(!D.findCompanyIds("Contact us any time").hasCompanyId);
});

test("detectAddress handles English addresses", () => {
  assert.ok(D.detectAddress("12 Sample Street, Smalltown"));
  assert.ok(!D.detectAddress("We ship worldwide"));
});

test("extractEmails skips image names and platform addresses", () => {
  const emails = D.extractEmails("Mail shopname@gmail.com or logo@2x.png or x@sentry.io");
  assert.deepEqual(emails, ["shopname@gmail.com"]);
});

test("detectBoilerplate finds placeholders and the fake phone number", () => {
  assert.deepEqual(D.detectBoilerplate("Welcome to [Company Name]"), ['placeholder "[Company Name]"']);
  assert.deepEqual(D.detectBoilerplate("Ring +46 8 123 456 78"), ["placeholder phone number (123 456 7...)"]);
  assert.deepEqual(D.detectBoilerplate("Ring 08-555 123 45"), []);
});

test("parsePrices handles US and euro formats", () => {
  assert.deepEqual(D.parsePrices("$29.99"), [29.99]);
  assert.deepEqual(D.parsePrices("€1.299"), [1299]);
});

test("detectMarket returns null without any market evidence", () => {
  assert.equal(D.detectMarket({ host: "example.com", lang: "en", text: "$29" }), null);
});

test("discountOff", () => {
  assert.equal(D.discountOff("269.00", "899.00"), 0.7);
  assert.equal(D.discountOff("100", null), 0);
});
