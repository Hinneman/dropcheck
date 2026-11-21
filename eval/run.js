// Evaluation harness: loads each labeled store in Chrome with the extension installed,
// reads the extension's own verdict, writes a CSV and prints the false positive rate.
//
//   npm run eval                                   # docs/dataset.csv (not in the repo)
//   npm run eval -- path/to/stores.csv
//   npm run eval -- --limit 5 --headful
//   npm run eval -- --extension path/to/extension   # e.g. a checkout of an older commit
//
// Any CSV works as long as one row has a "URL" and a "Label" column header, so the
// spreadsheet export can be passed as is. Rows without both values are skipped.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION = path.join(ROOT, "extension");
const PAGE_TIMEOUT_MS = 45000;
const VERDICT_TIMEOUT_MS = 40000;

function parseArgs(argv) {
  const opts = { dataset: path.join(ROOT, "docs", "dataset.csv"), out: path.join(ROOT, "eval", "results.csv"),
                 limit: Infinity, headful: false, extension: EXTENSION };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = path.resolve(argv[++i]);
    else if (a === "--extension") opts.extension = path.resolve(argv[++i]);
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else if (a === "--headful") opts.headful = true;
    else opts.dataset = path.resolve(a);
  }
  return opts;
}

function parseCsv(src) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadDataset(file) {
  const rows = parseCsv(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const headerIdx = rows.findIndex(r => {
    const lower = r.map(c => c.trim().toLowerCase());
    return lower.includes("url") && lower.includes("label");
  });
  if (headerIdx < 0) throw new Error(`No header row with "URL" and "Label" columns in ${file}`);
  const header = rows[headerIdx].map(c => c.trim().toLowerCase());
  const urlCol = header.indexOf("url"), labelCol = header.indexOf("label");
  return rows.slice(headerIdx + 1)
    .map(r => ({ url: (r[urlCol] || "").trim(), label: (r[labelCol] || "").trim() }))
    .filter(r => /^https:\/\//.test(r.url) && r.label);
}

const csvCell = v => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Headless Chrome cannot click through the permission prompt, so the eval loads a copy
// of the extension with automatic scanning granted in the manifest. Versions before
// opt-in scanning declare static content scripts and are copied unchanged.
function autoScanCopy(source) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dropcheck-eval-"));
  cpSync(source, dir, { recursive: true });
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const staticScripts = Boolean(manifest.content_scripts?.length);
  if (manifest.optional_host_permissions) {
    manifest.host_permissions = manifest.optional_host_permissions;
    delete manifest.optional_host_permissions;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return { dir, staticScripts };
}

// Verdicts are read from chrome.storage.session through an extension page. The
// service worker is not used for this because Chrome stops it when idle.
async function openProbe(browser, staticScripts) {
  const target = await browser.waitForTarget(
    t => t.type() === "service_worker" && t.url().endsWith("background/worker.js"),
    { timeout: 30000 });
  const extensionId = new URL(target.url()).host;
  const probe = await browser.newPage();
  await probe.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  if (!staticScripts) await probe.waitForFunction(
    async () => (await chrome.scripting.getRegisteredContentScripts()).length > 0,
    { timeout: 30000, polling: 250 });
  return probe;
}

async function verdictFor(probe, page, url) {
  const started = Date.now();
  await page.bringToFront();
  await page.goto(url, { waitUntil: "networkidle2", timeout: PAGE_TIMEOUT_MS }).catch(err => {
    if (!/timeout/i.test(err.message)) throw err;   // slow pages still get scanned
  });
  const host = new URL(page.url()).hostname;
  while (Date.now() - started < PAGE_TIMEOUT_MS + VERDICT_TIMEOUT_MS) {
    const entry = await probe.evaluate(
      async key => (await chrome.storage.session.get(key))[key] || null, `host:${host}`);
    if (entry && entry.at >= started) return entry;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error("no verdict (content script did not report)");
}

// What the verdict was based on, so a false alarm can be traced to missing input.
// Pages that were not stores have none of these fields.
function basis(s) {
  return {
    market: s?.market?.id ?? "",
    domain: s?.domain?.name ?? "",
    domainAgeDays: s?.domain?.ageDays ?? "",
    hasCompanyId: s?.identity ? String(s.identity.hasCompanyId) : "",
    orgNumbers: (s?.identity?.orgNumbers || []).join(" "),
    pagesScanned: (s?.pagesScanned || []).join(" ")
  };
}

function summarise(results) {
  const byLabel = new Map();
  for (const r of results) {
    const key = r.label.toLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, { label: r.label, n: 0, likely: 0, mixed: 0, none: 0, not_store: 0, error: 0 });
    const s = byLabel.get(key);
    s.n++;
    s[r.band || "error"]++;
  }
  const pctOf = (x, n) => (n ? `${Math.round((100 * x) / n)} %` : "-");
  console.log("\nlabel                 n   likely   mixed   none   not_store  error");
  for (const s of byLabel.values()) {
    console.log(`${s.label.padEnd(20)} ${String(s.n).padStart(3)}   ${pctOf(s.likely, s.n).padStart(6)}  ` +
      `${pctOf(s.mixed, s.n).padStart(6)}  ${pctOf(s.none, s.n).padStart(5)}  ${String(s.not_store).padStart(9)}  ${String(s.error).padStart(5)}`);
  }
  const legit = [...byLabel.values()].find(s => s.label.toLowerCase().startsWith("legit"));
  if (legit) {
    const scored = legit.n - legit.error - legit.not_store;
    console.log(`\nFalse positive rate (legitimate stores in "Likely reseller"): ` +
      `${legit.likely}/${scored} = ${pctOf(legit.likely, scored)}   target: under 10 %`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rows = loadDataset(opts.dataset).slice(0, opts.limit);
  console.log(`Evaluating ${rows.length} stores from ${path.relative(ROOT, opts.dataset)}`);

  const { dir: extensionDir, staticScripts } = autoScanCopy(opts.extension);
  const browser = await puppeteer.launch({
    headless: !opts.headful,
    pipe: true,
    enableExtensions: [extensionDir]
  });
  const results = [];
  try {
    const probe = await openProbe(browser, staticScripts);
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    for (const row of rows) {
      process.stdout.write(`${row.url} ... `);
      try {
        const { verdict, signals } = await verdictFor(probe, page, row.url);
        results.push({ ...row, score: verdict.score, band: verdict.band,
                       rulesFired: verdict.fired.map(f => f.id).join(" "), ...basis(signals) });
        console.log(`${verdict.band} (${verdict.score})`);
      } catch (err) {
        results.push({ ...row, score: "", band: "", rulesFired: "", error: err.message });
        console.log(`error: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
    rmSync(extensionDir, { recursive: true, force: true });
  }

  const header = ["url", "label", "score", "band", "rulesFired", "market", "domain", "domainAgeDays",
                  "hasCompanyId", "orgNumbers", "pagesScanned", "error"];
  writeFileSync(opts.out, [header.join(","), ...results.map(r => header.map(h => csvCell(r[h])).join(","))].join("\n") + "\n");
  console.log(`\nWrote ${path.relative(ROOT, opts.out)}`);
  summarise(results);
}

main().catch(err => { console.error(err); process.exit(1); });
