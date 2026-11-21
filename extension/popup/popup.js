import { NO_REGISTRATION_DATE_TLDS, formatTldList } from "../background/score.js";
import { bandLabel, noteText, ruleText, ui } from "../i18n/format.js";
import { getLanguage } from "../i18n/language.js";
import { HINT_DISMISSED_KEY, setupAutoScan, setupLanguage, translatePage } from "../settings/settings.js";

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

// A note as a table row: "Theme: Example." becomes the label "Theme" beside "Example".
// Only a short lead-in counts as a label, so a sentence that merely contains a colon
// ("Domain age is not checked for .se domains: ...") stays one block of text. A lone
// trailing full stop is dropped from a value; a value of several sentences keeps it.
function noteRow(text) {
  const el = document.createElement("li");
  const colon = text.indexOf(": ");
  const label = colon > 0 ? text.slice(0, colon) : "";
  if (!label || label.split(" ").length > 3) {
    el.className = "note-plain";
    el.textContent = text;
    return el;
  }
  let value = text.slice(colon + 2);
  if (value.endsWith(".") && !value.slice(0, -1).includes(". ")) value = value.slice(0, -1);
  const name = document.createElement("span");
  name.className = "note-label";
  name.textContent = label;
  const body = document.createElement("span");
  body.textContent = value;
  el.append(name, body);
  return el;
}

// The fixed texts: everything marked data-i18n, plus the footer and labels.
function applyStatic() {
  const t = ui(lang);
  translatePage(t, lang);
  $("footer").textContent = t.footer(formatTldList(NO_REGISTRATION_DATE_TLDS, t.and));
  $("status").textContent = status(t);
}

const pct = (part, whole) => `${Math.min(100, (part / whole) * 100)}%`;

// A bar per category: the counted points against the cap, full once the cap is reached.
// A missing cap (Infinity turns into null in a message) fills the bar.
function categoryBar({ raw, counted, cap }) {
  const scale = cap ?? raw;
  const bar = document.createElement("div");
  bar.className = "category-bar";
  bar.setAttribute("aria-hidden", "true");
  const fill = document.createElement("span");
  fill.className = "fill";
  fill.classList.toggle("full", counted >= scale);
  fill.style.width = pct(counted, scale);
  bar.append(fill);
  return bar;
}

// One group per category: a header with the points that count, a bar against the cap,
// then each fired rule with its own weight.
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
    if (raw > counted) {
      const found = document.createElement("span");
      found.className = "found";
      found.textContent = t.capped(raw, counted);
      total.append(found, `+${counted}`);
    } else {
      total.textContent = `+${counted}`;
    }
    head.append(name, total);

    // A lone rule's weight would just repeat the header total, so it is left off.
    const inCategory = verdict.fired.filter(f => f.category === cat);
    const rules = document.createElement("ul");
    rules.replaceChildren(...inCategory.map(f =>
      li(ruleText(f, lang), inCategory.length > 1 ? `+${f.weight}` : null)));

    group.append(head, categoryBar(verdict.categories[cat]), rules);
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
  const gauge = verdict.band !== "not_store" && verdict.bands != null;
  $("gauge").hidden = !gauge;
  if (gauge) renderGauge(verdict, t);
  $("score").textContent = verdict.band === "not_store" ? t.bandNotes.not_store
    : gauge ? t.bandNotes[verdict.band]
    : `${t.score(verdict.score, verdict.maxScore)} ${t.bandNotes[verdict.band]}`;
  $("caveat").hidden = verdict.band !== "mixed";
  $("caveat").textContent = t.caveat;

  $("fired-section").hidden = verdict.fired.length === 0;
  $("fired").replaceChildren(...firedByCategory(verdict));

  $("context-section").hidden = verdict.context.length === 0;
  $("context").replaceChildren(...verdict.context.map(n => noteRow(noteText(n, lang))));

  $("images-section").hidden = (signals.productImages || []).length === 0;
  if (imagesShown) showImages();
}

// The score as a ring in the band's colour, filled to its share of the maximum, with the
// number inside. Screen readers get the score from the meter, so the number is hidden from them.
function renderGauge({ score, maxScore }, t) {
  const share = Math.min(100, (score / maxScore) * 100);
  // On the next frame, so the ring fills from empty when the popup opens.
  requestAnimationFrame(() => $("gauge-arc").setAttribute("stroke-dasharray", `${share} 100`));
  $("gauge").setAttribute("aria-valuemax", String(maxScore));
  $("gauge").setAttribute("aria-valuenow", String(score));
  $("gauge").setAttribute("aria-valuetext", t.score(score, maxScore));
  // The maximum under the number, so 100 does not read as full marks when the scale is 115.
  const max = document.createElement("span");
  max.className = "score-max";
  max.textContent = `/${maxScore}`;
  $("score-number").replaceChildren(String(score), max);
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

// The gear swaps the page's result for the settings; Escape or the back arrow swaps back.
function showSettings(open) {
  $("settings").hidden = !open;
  $("page-view").hidden = open;
  $("open-settings").setAttribute("aria-expanded", String(open));
  (open ? $("auto-scan") : $("open-settings")).focus();
}

function setupSettingsView() {
  $("open-settings").addEventListener("click", () => showSettings($("settings").hidden));
  $("close-settings").addEventListener("click", () => showSettings(false));
  $("hint-open").addEventListener("click", () => showSettings(true));
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || $("settings").hidden) return;
    e.preventDefault();
    showSettings(false);
  });
  setupLanguage(/** @type {HTMLSelectElement} */ ($("language")), lang, chosen => {
    lang = chosen;
    applyStatic();
    if (entry) render();
  });
}

// A tip under the verdict while automatic scanning is off, until it is closed once.
async function setupHint() {
  const autoScan = await setupAutoScan(/** @type {HTMLInputElement} */ ($("auto-scan")),
    enabled => { if (enabled) $("hint").hidden = true; });
  /** @type {Record<string, any>} */
  const stored = await chrome.storage.local.get(HINT_DISMISSED_KEY);
  $("hint").hidden = autoScan || stored[HINT_DISMISSED_KEY] === true;
  $("hint-dismiss").addEventListener("click", () => {
    $("hint").hidden = true;
    chrome.storage.local.set({ [HINT_DISMISSED_KEY]: true })
      .catch(err => console.error("DropCheck tip setting:", err));
  });
}

async function main() {
  lang = await getLanguage();
  applyStatic();
  setupSettingsView();
  setupImages();
  setupHint().catch(err => console.error("DropCheck auto-scan setting:", err));
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
