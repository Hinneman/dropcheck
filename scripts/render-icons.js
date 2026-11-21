// Renders the icons in assets/ to the PNG sizes Chrome needs (it does not accept SVG icons).
//
//   npm run icons
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "extension", "icons");
// Every size renders icon.svg. The toolbar sizes (16, 32) fill the whole square;
// 48 and 128 render at 75 % with transparent padding: Chrome's guideline for the
// store and management icons (96 px artwork in a 128 px icon).
const SIZES = [
  { size: 16 },
  { size: 32 },
  { size: 48, pad: 6 },
  { size: 128, pad: 16 }
];

const svg = readFileSync(path.join(ROOT, "assets", "icon.svg"), "utf8").replace(/^<\?xml[^>]*\?>/, "");
const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  for (const { size, pad = 0 } of SIZES) {
    const art = size - 2 * pad;
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}` +
      `svg{display:block;width:${art}px;height:${art}px;margin:${pad}px}</style>${svg}`);
    const out = path.join(OUT_DIR, `icon-${size}.png`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(path.relative(ROOT, out));
  }
} finally {
  await browser.close();
}
