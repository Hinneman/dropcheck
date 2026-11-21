// Renders the Chrome Web Store graphics into store/screenshots/:
//   screenshot-reseller.png, screenshot-honest.png (1280x800), promo-small.png (440x280)
//
//   npm run store-screenshots
//
// Both shops are fictional and live only inside this script: every request to
// www.example.se and keramik.example.se (and the Shopify CDN) is answered here, so no real
// shop is contacted or shown. The extension runs from a temporary copy with automatic
// scanning granted, as in eval/run.js, and the popup is opened with chrome.action.openPopup().
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "store", "screenshots");
const DAY = 86400000;
const iso = daysAgo => new Date(Date.now() - daysAgo * DAY).toISOString();

// ---------- Fictional shops ----------

const RESELLER_PRODUCTS = [
  "Stickad kofta Elsa", "Ullkappa Maja", "Vadderad jacka Ingrid", "Klänning Sofia", "Boots Freja",
  "Polotröja Karin", "Väst Astrid", "Kappa Linnea", "Sneakers Ebba", "Blus Wilma",
  "Hoodie Alva", "Jacka Selma"
].map((title, i) => ({
  title,
  // Supplier and AI file names of the kinds DropCheck recognises; the IDs are made up.
  images: [
    `O1CN01Ab${String(i).padStart(2, "0")}Ef1gHiJkLmNoP__2200000000000-0-cib.jpg`,
    `S${(i + 10).toString(16).padStart(2, "0")}d1c2e3f4a5b6c7d8e9f0a1b2c3d4e5fg.jpg`,
    `ChatGPT_Image_${i + 1}_okt_2026_12_00_00.png`
  ],
  type: i < 6 ? "Ytterkläder" : "Stickat",
  created: iso(20 + i * 3),
  price: "299.00",
  compare: "999.00"
}));

const HONEST_PRODUCTS = [
  "Mugg blå glasyr", "Skål vit", "Tallrik grå", "Vas hög", "Kanna liten", "Fat ovalt"
].map((title, i) => ({
  title,
  images: [`keramik-${i + 1}.jpg`],
  type: i < 3 ? "Servis" : "Inredning",
  created: iso(1800 - i * 120),
  price: "345.00",
  compare: null
}));

const productsJson = products => JSON.stringify({
  products: products.map((p, i) => ({
    id: 1000 + i, title: p.title, handle: `produkt-${i + 1}`, created_at: p.created,
    vendor: "", product_type: p.type, tags: [],
    variants: [{ price: p.price, compare_at_price: p.compare }],
    images: p.images.map(f => ({ src: `https://cdn.shopify.com/s/files/1/0000/0001/files/${f}` }))
  }))
});

const page = (title, body) => `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<title>${title}</title>
<script src="https://cdn.shopify.com/s/files/1/0000/0001/t/1/assets/theme.js"></script>
<script>Shopify = window.Shopify || {}; Shopify.theme = {"name":"Dawn","id":1};</script>
<style>
  body { margin: 0; font: 16px/1.5 Georgia, serif; color: #222; background: #fff; }
  .bar { background: #222; color: #fff; text-align: center; padding: 8px; font: 14px sans-serif; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 20px 48px; border-bottom: 1px solid #eee; }
  header b { font-size: 26px; letter-spacing: 2px; }
  nav a { margin-left: 24px; color: #222; text-decoration: none; font: 15px sans-serif; }
  .hero { padding: 36px 48px 12px; }
  .hero h1 { margin: 0; font-size: 34px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; padding: 24px 48px; }
  .card img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; }
  .card p { margin: 8px 0 0; font: 14px sans-serif; }
  s { color: #888; margin-right: 6px; }
  .sale { color: #b42318; }
  footer { padding: 24px 48px; font: 13px sans-serif; color: #555; border-top: 1px solid #eee; }
</style></head><body>${body}</body></html>`;

const card = (p, i) => `<div class="card"><a href="/products/produkt-${i + 1}">
  <img src="https://cdn.shopify.com/s/files/1/0000/0001/files/${p.images[0]}" alt="${p.title}" width="300" height="375"></a>
  <p>${p.title}</p>
  <p>${p.compare ? `<s>${parseInt(p.compare)} kr</s><span class="sale">${parseInt(p.price)} kr</span>` : `${parseInt(p.price)} kr`}</p></div>`;

const SHOPS = {
  "www.example.se": {
    file: "screenshot-reseller.png",
    products: RESELLER_PRODUCTS,
    pages: {
      "/": page("Exempel Stockholm", `
        <div class="bar">VINTERREA - upp till 70 % rabatt. Rean slutar om 02:14:33</div>
        <header><b>EXEMPEL STOCKHOLM</b><nav><a href="/collections/all">Dam</a><a href="/pages/kontakt">Kontakt</a>
          <a href="/policies/refund-policy">Returer</a><a href="/policies/shipping-policy">Frakt</a><a href="/cart">Varukorg</a></nav></header>
        <section class="hero"><h1>Skandinavisk vinterstil</h1><p>Bara 3 kvar i lager av våra populäraste kappor.</p></section>
        <section class="grid">${RESELLER_PRODUCTS.slice(0, 8).map(card).join("")}</section>
        <footer>Kundservice: info@exempelmode.example, +86 755 1234 5678</footer>`),
      "/policies/refund-policy": page("Returer", `<main><h1>Retur- och återbetalningspolicy</h1>
        <p>Du har 14 dagars ångerrätt.</p>
        <p>Returadress</p><p>Skicka din retur till:</p><p>Unit 1, Example Road 8, Example District</p><p>Shenzhen</p><p>Kina</p>
        <p>Vår registrerade företagsadress är ingen returadress.</p>
        <p>Eventuell importmoms, tull och avgifter debiteras dig och ingår inte i varans pris.</p></main>`),
      "/policies/shipping-policy": page("Frakt", `<main><h1>Frakt</h1>
        <p>Beställningar behandlas inom 1 till 3 arbetsdagar.</p><p>Leveranstid: 10-20 arbetsdagar.</p></main>`),
      "/pages/kontakt": page("Kontakt", `<main><h1>Kontakt</h1>
        <p>E-post: info@exempelmode.example</p><p>Telefon: +86 755 1234 5678</p></main>`)
    }
  },
  "keramik.example.se": {
    file: "screenshot-honest.png",
    products: HONEST_PRODUCTS,
    pages: {
      "/": page("Småby Keramik", `
        <div class="bar">Fri frakt över 600 kr</div>
        <header><b>SMÅBY KERAMIK</b><nav><a href="/collections/all">Keramik</a><a href="/pages/om-oss">Om oss</a>
          <a href="/policies/shipping-policy">Frakt</a><a href="/cart">Varukorg</a></nav></header>
        <section class="hero"><h1>Handdrejat i Småby sedan 2019</h1><p>Varje del drejas och glaseras i vår verkstad.</p></section>
        <section class="grid">${HONEST_PRODUCTS.slice(0, 4).map(card).join("")}</section>
        <footer>Småby Keramik AB, Org.nr 559999-9991, Kvarngatan 2B, 123 45 Småby, hej@example.se</footer>`),
      "/policies/shipping-policy": page("Frakt", `<main><h1>Frakt och returer</h1>
        <p>Leveranstid: 1-3 arbetsdagar med PostNord.</p>
        <p>Returadress: Kvarngatan 2B, 123 45 Småby.</p></main>`),
      "/pages/om-oss": page("Om oss", `<main><h1>Om oss</h1>
        <p>Småby Keramik AB, Org.nr 559999-9991, Kvarngatan 2B, 123 45 Småby.</p></main>`)
    }
  }
};

// Plain colored placeholder for every product image, with its name.
const imageSvg = name => {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="375">
    <rect width="300" height="375" fill="hsl(${hue},28%,78%)"/>
    <rect x="70" y="80" width="160" height="210" rx="18" fill="hsl(${hue},30%,62%)"/></svg>`;
};

function answer(req) {
  const url = new URL(req.url());
  const shop = SHOPS[url.hostname];
  if (url.hostname === "cdn.shopify.com") {
    if (/\.(jpe?g|png|webp)$/i.test(url.pathname)) {
      return req.respond({ status: 200, contentType: "image/svg+xml", body: imageSvg(url.pathname) });
    }
    return req.respond({ status: 200, contentType: "application/javascript", body: "" });
  }
  if (!shop) return req.abort();
  if (url.pathname === "/products.json") {
    return req.respond({ status: 200, contentType: "application/json", body: productsJson(shop.products) });
  }
  const html = shop.pages[url.pathname];
  return html
    ? req.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html })
    : req.respond({ status: 404, contentType: "text/html", body: "Not found" });
}

// ---------- Extension and browser ----------

function autoScanCopy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dropcheck-shots-"));
  cpSync(path.join(ROOT, "extension"), dir, { recursive: true });
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_host_permissions;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

async function verdictStored(probe, host, since) {
  for (let i = 0; i < 60; i++) {
    const entry = await probe.evaluate(
      async key => (await chrome.storage.session.get(key))[key] || null, `host:${host}`);
    if (entry && entry.at >= since) return entry;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`no verdict for ${host}`);
}

async function shootShop(browser, worker, probe, host, shop) {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1280, height: 800 });
  await tab.setRequestInterception(true);
  tab.on("request", answer);
  const started = Date.now();
  await tab.goto(`https://${host}/`, { waitUntil: "load" });
  const { verdict } = await verdictStored(probe, host, started);
  const background = await tab.screenshot({ encoding: "base64" });

  await tab.bringToFront();
  await worker.evaluate("chrome.action.openPopup()");
  const target = await browser.waitForTarget(t => t.type() === "page" && t.url().endsWith("popup/popup.html"));
  const popup = await target.asPage();
  await popup.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await popup.waitForSelector("#result:not([hidden])");
  await new Promise(r => setTimeout(r, 300));
  // The visible popup only (Chrome caps popups at 600 px and scrolls the rest), as users
  // see it; a full-page capture of a popup window repeats its content.
  const popupPng = await popup.screenshot({ encoding: "base64" });
  await popup.close();

  // The popup over the shop, where Chrome shows it under the toolbar, cut off at the bottom.
  const canvas = await browser.newPage();
  await canvas.setViewport({ width: 1280, height: 800 });
  await canvas.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;position:relative">
    <img src="data:image/png;base64,${background}" style="position:absolute;inset:0;filter:brightness(0.92)">
    <img src="data:image/png;base64,${popupPng}" style="position:absolute;right:24px;top:12px;
      border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.35)"></body></html>`);
  await canvas.screenshot({ path: path.join(OUT, shop.file) });
  await canvas.close();
  await tab.close();
  console.log(`${shop.file}: ${verdict.band} (${verdict.score})`);
}

async function shootPromo(browser) {
  const icon = readFileSync(path.join(ROOT, "assets", "icon.svg"), "base64");
  const tile = await browser.newPage();
  await tile.setViewport({ width: 440, height: 280 });
  await tile.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;display:flex;
    align-items:center;gap:22px;padding:0 34px;box-sizing:border-box;background:#fbfaf8;
    font-family:system-ui,'Segoe UI',sans-serif;color:#1d1d1b">
    <img src="data:image/svg+xml;base64,${icon}" width="96" height="96">
    <div><div style="font-size:38px;font-weight:700;line-height:1.1">DropCheck</div>
    <div style="font-size:18px;margin-top:8px;color:#5d5b57">Spot dropshipping shops<br>before you buy</div></div>
    </body></html>`);
  await tile.screenshot({ path: path.join(OUT, "promo-small.png") });
  await tile.close();
  console.log("promo-small.png");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const extensionDir = autoScanCopy();
  const browser = await puppeteer.launch({ headless: true, pipe: true, enableExtensions: [extensionDir] });
  try {
    const workerTarget = await browser.waitForTarget(
      t => t.type() === "service_worker" && t.url().endsWith("background/worker.js"));
    const worker = await workerTarget.worker();
    const extensionId = new URL(workerTarget.url()).host;
    const probe = await browser.newPage();
    await probe.goto(`chrome-extension://${extensionId}/popup/popup.html?probe`);
    await probe.waitForFunction(
      async () => (await chrome.scripting.getRegisteredContentScripts()).length > 0, { polling: 250 });
    for (const [host, shop] of Object.entries(SHOPS)) await shootShop(browser, worker, probe, host, shop);
    await shootPromo(browser);
  } finally {
    await browser.close();
    rmSync(extensionDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
