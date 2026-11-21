// Renders the icons in assets/ to the PNG sizes Chrome needs (it does not accept SVG icons).
//
//   npm run icons
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "extension", "icons");
// The toolbar sizes (16, 32) have their own simplified drawings, because the full
// icon's details blur together there. 48 and 128 render icon.svg at 75 % with
// transparent padding: Chrome's guideline for the store and management icons
// (96 px artwork in a 128 px icon).
const SIZES = [
  { size: 16, file: "icon-16.svg" },
  { size: 32, file: "icon-32.svg" },
  { size: 48, pad: 6 },
  { size: 128, pad: 16 }
];

const read = file => readFileSync(path.join(ROOT, "assets", file), "utf8").replace(/^<\?xml[^>]*\?>/, "");
const source = read("icon.svg");
const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  for (const { size, file, pad = 0 } of SIZES) {
    const svg = file ? read(file) : source;
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
