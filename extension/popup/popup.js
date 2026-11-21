import "../shared/config.js";
import { BAND_LABELS, NO_REGISTRATION_DATE_TLDS, formatTldList } from "../background/score.js";

const $ = id => document.getElementById(id);

const BAND_NOTES = {
  likely: "Several independent signals point to third-party fulfilment: expect a markup over the supplier price and longer delivery than a local shop.",
  mixed: "Some signals are present, but they do not settle it.",
  none: "Nothing detected. That is not a guarantee of anything.",
  not_store: "This page does not look like an online store, so nothing was scored."
};

const CAVEAT = "Why this might be wrong: small shops that print on demand, make to order or " +
  "import their own designs can show the same signals as a reseller.";

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

const CATEGORY_LABELS = {
  supply: "Supply",
  identity: "Identity",
  pressure: "Sales pressure",
  pricing: "Pricing"
};

// One group per category: a header with the points that count (and the cap when it
// applied), then each fired rule with its own weight.
function firedByCategory(verdict) {
  const order = [...new Set(verdict.fired.map(f => f.category))];
  return order.map(cat => {
    const { raw, counted } = verdict.categories[cat];
    const group = document.createElement("li");
    group.className = "category";

    const head = document.createElement("div");
    head.className = "category-head";
    const name = document.createElement("span");
    name.textContent = CATEGORY_LABELS[cat] || cat;
    const total = document.createElement("span");
    total.className = "points";
    total.textContent = raw > counted ? `${raw}, capped to ${counted}` : `+${counted}`;
    head.append(name, total);

    // A lone rule's weight would just repeat the header total, so it is left off.
    const inCategory = verdict.fired.filter(f => f.category === cat);
    const rules = document.createElement("ul");
    rules.replaceChildren(...inCategory.map(f =>
      li(f.text, inCategory.length > 1 ? `+${f.weight}` : null)));

    group.append(head, rules);
    return group;
  });
}

function render(entry) {
  const { verdict, signals } = entry;
  // The status stays in the page, visually hidden, so screen readers announce the result.
  $("status").textContent = `Result: ${BAND_LABELS[verdict.band]}.`;
  $("status").classList.add("visually-hidden");
  $("result").hidden = false;

  $("verdict").dataset.band = verdict.band;
  $("band").textContent = BAND_LABELS[verdict.band];
  $("score").textContent = verdict.band === "not_store"
    ? BAND_NOTES.not_store
    : `Score ${verdict.score} of ${verdict.maxScore}. ${BAND_NOTES[verdict.band]}`;
  $("caveat").hidden = verdict.band !== "mixed";
  $("caveat").textContent = CAVEAT;

  $("fired-section").hidden = verdict.fired.length === 0;
  $("fired").replaceChildren(...firedByCategory(verdict));

  $("context-section").hidden = verdict.context.length === 0;
  $("context").replaceChildren(...verdict.context.map(t => li(t)));

  // Loaded on request only: the store's image server would otherwise see every popup open.
  const images = signals.productImages || [];
  $("images-section").hidden = images.length === 0;
  $("show-images").addEventListener("click", () => {
    $("show-images").hidden = true;
    $("images").hidden = false;
    showImages(images);
  }, { once: true });
}

function showImages(images) {
  $("images").replaceChildren(...images.map((url, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Search this image with Google Lens";
    btn.setAttribute("aria-label", `Search product image ${i + 1} of ${images.length} with Google Lens`);
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
  $("no-lookup-tlds").textContent = formatTldList(NO_REGISTRATION_DATE_TLDS);
  setupAutoScan().catch(err => console.error("DropCheck auto-scan setting:", err));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try { host = new URL(tab.url).hostname; } catch { /* no URL access for this tab */ }
  $("host").textContent = host;

  if (!tab?.url?.startsWith("https://")) {
    $("status").textContent = "DropCheck only reads https:// pages.";
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: "GET_VERDICT", tabId: tab.id });
  if (!res || res.error) {
    $("status").textContent = res?.error === "timeout"
      ? "The scan did not finish. Reload the page and try again."
      : "DropCheck cannot read this page.";
    return;
  }
  render(res);
}

main().catch(err => { $("status").textContent = `Something went wrong: ${err.message}`; });
