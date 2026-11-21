import { BAND_LABELS } from "../background/score.js";

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
    const { raw, counted, cap } = verdict.categories[cat];
    const group = document.createElement("li");
    group.className = "category";

    const head = document.createElement("div");
    head.className = "category-head";
    const name = document.createElement("span");
    name.textContent = CATEGORY_LABELS[cat] || cat;
    const total = document.createElement("span");
    total.className = "points";
    total.textContent = raw > counted ? `${raw} → ${counted} (cap ${cap})` : `+${counted}`;
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
  $("status").hidden = true;
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

  const images = signals.productImages || [];
  $("images-section").hidden = images.length === 0;
  $("images").replaceChildren(...images.map(url => {
    const btn = document.createElement("button");
    btn.title = "Search this image with Google Lens";
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

async function main() {
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
