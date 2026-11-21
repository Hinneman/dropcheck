import "../shared/config.js";
import { NO_REGISTRATION_DATE_TLDS, formatTldList } from "../background/score.js";
import { LANGUAGE_NAMES, bandLabel, noteText, ruleText, ui } from "../i18n/format.js";
import { getLanguage, setLanguage } from "../i18n/language.js";

const $ = id => document.getElementById(id);

// What is on screen, kept so a language change can redraw it.
let lang = "en";
/** @type {(t: ReturnType<typeof ui>) => string} */
let status = t => t.scanning;
let entry = null;
let imagesShown = false;

function li(text, extra) {
  const el = document.createElement("li");
  el.textContent = text;
  if (extra) {
    const span = document.createElement("span");
    span.className = "points";
    span.textContent = extra;
    el.append(span);
  }
  return el;
}

// The fixed texts: everything marked data-i18n, plus the footer and labels.
function applyStatic() {
  const t = ui(lang);
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t[/** @type {HTMLElement} */ (el).dataset.i18n];
  }
  $("settings").setAttribute("aria-label", t.settings);
  $("footer").textContent = t.footer(formatTldList(NO_REGISTRATION_DATE_TLDS, t.and));
  $("status").textContent = status(t);
}

// One group per category: a header with the points that count (and the cap when it
// applied), then each fired rule with its own weight.
function firedByCategory(verdict) {
  const t = ui(lang);
  const order = [...new Set(verdict.fired.map(f => f.category))];
  return order.map(cat => {
    const { raw, counted } = verdict.categories[cat];
    const group = document.createElement("li");
    group.className = "category";

    const head = document.createElement("div");
    head.className = "category-head";
    const name = document.createElement("span");
    name.textContent = t.categories[cat] || cat;
    const total = document.createElement("span");
    total.className = "points";
    total.textContent = raw > counted ? t.capped(raw, counted) : `+${counted}`;
    head.append(name, total);

    // A lone rule's weight would just repeat the header total, so it is left off.
    const inCategory = verdict.fired.filter(f => f.category === cat);
    const rules = document.createElement("ul");
    rules.replaceChildren(...inCategory.map(f =>
      li(ruleText(f, lang), inCategory.length > 1 ? `+${f.weight}` : null)));

    group.append(head, rules);
    return group;
  });
}

function render() {
  const { verdict, signals } = entry;
  const t = ui(lang);
  const band = bandLabel(verdict.band, lang);
  // The status stays in the page, visually hidden, so screen readers announce the result.
  setStatus(tt => tt.result(bandLabel(verdict.band, lang)));
  $("status").classList.add("visually-hidden");
  $("result").hidden = false;

  $("verdict").dataset.band = verdict.band;
  $("band").textContent = band;
  $("score").textContent = verdict.band === "not_store"
    ? t.bandNotes.not_store
    : `${t.score(verdict.score, verdict.maxScore)} ${t.bandNotes[verdict.band]}`;
  $("caveat").hidden = verdict.band !== "mixed";
  $("caveat").textContent = t.caveat;

  $("fired-section").hidden = verdict.fired.length === 0;
  $("fired").replaceChildren(...firedByCategory(verdict));

  $("context-section").hidden = verdict.context.length === 0;
  $("context").replaceChildren(...verdict.context.map(n => li(noteText(n, lang))));

  $("images-section").hidden = (signals.productImages || []).length === 0;
  if (imagesShown) showImages();
}

// Loaded on request only: the store's image server would otherwise see every popup open.
function setupImages() {
  $("show-images").addEventListener("click", () => {
    $("show-images").hidden = true;
    $("images").hidden = false;
    imagesShown = true;
    showImages();
  }, { once: true });
}

function showImages() {
  const t = ui(lang);
  const images = entry.signals.productImages || [];
  $("images").replaceChildren(...images.map((url, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = t.lensTitle;
    btn.setAttribute("aria-label", t.lensLabel(i + 1, images.length));
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    btn.append(img);
    btn.addEventListener("click", () => chrome.tabs.create({
      url: "https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(url)
    }));
    return btn;
  }));
}

function setStatus(fn) {
  status = fn;
  $("status").textContent = fn(ui(lang));
}

function setupLanguage() {
  const select = /** @type {HTMLSelectElement} */ ($("language"));
  select.replaceChildren(...Object.entries(LANGUAGE_NAMES).map(([code, name]) => {
    const option = new Option(name, code, false, code === lang);
    option.lang = code;
    return option;
  }));
  select.addEventListener("change", () => {
    lang = select.value;
    setLanguage(lang).catch(err => console.error("DropCheck language setting:", err));
    applyStatic();
    if (entry) render();
  });
}

// Only toggles the permission; the worker reacts to it. The permission dialog can close
// the popup before request() resolves.
const AUTO_SCAN = { origins: [...globalThis.DropCheckConfig.AUTO_SCAN_ORIGINS] };

async function setupAutoScan() {
  const box = /** @type {HTMLInputElement} */ ($("auto-scan"));
  box.checked = await chrome.permissions.contains(AUTO_SCAN);
  box.addEventListener("change", async () => {
    const granted = box.checked
      ? await chrome.permissions.request(AUTO_SCAN)
      : !(await chrome.permissions.remove(AUTO_SCAN));
    box.checked = granted;
  });
}

async function main() {
  lang = await getLanguage();
  applyStatic();
  setupLanguage();
  setupImages();
  setupAutoScan().catch(err => console.error("DropCheck auto-scan setting:", err));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try { host = new URL(tab.url).hostname; } catch { /* no URL access for this tab */ }
  $("host").textContent = host;

  if (!tab?.url?.startsWith("https://")) {
    setStatus(t => t.httpsOnly);
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: "GET_VERDICT", tabId: tab.id });
  if (!res || res.error) {
    setStatus(res?.error === "timeout" ? t => t.timeout : t => t.cannotRead);
    return;
  }
  entry = res;
  render();
}

main().catch(err => setStatus(t => t.error(err.message)));
