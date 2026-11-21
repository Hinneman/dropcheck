// Service worker: receives page signals, adds domain age, scores, caches the verdict.
import "../shared/config.js";
import "../content/markets.js";
import "../content/detectors.js";
import { hasRegistrationDate, scoreSignals } from "./score.js";
import { bandLabel } from "../i18n/format.js";
import { LANGUAGE_KEY, getLanguage } from "../i18n/language.js";
import { sanitizeSignals } from "./sanitize.js";

const D = globalThis.DropCheckDetectors;
const { DAY_MS, SITE_TTL_MS, AUTO_SCAN_ORIGINS } = globalThis.DropCheckConfig;
const AGE_TTL_MS = 30 * DAY_MS;      // successful lookups
const AGE_FAIL_TTL_MS = DAY_MS;      // failed lookups: retry next day
const RDAP_TIMEOUT_MS = 8000;
const VERDICT_WAIT_MS = 25000;

// Bundled JSON files, loaded once. A failed load is not cached, so the next signal
// retries instead of failing until the worker restarts.
const jsonCache = new Map();
function loadJson(file) {
  if (!jsonCache.has(file)) {
    jsonCache.set(file, fetch(chrome.runtime.getURL(file))
      .then(r => r.json())
      .catch(err => { jsonCache.delete(file); throw err; }));
  }
  return jsonCache.get(file);
}
const loadRules = () => loadJson("rules/signals.json");
const loadMarketplaces = () => loadJson("rules/marketplaces.json");

const waiters = new Map();   // tabId -> [resolve]

const CONTENT_FILES = ["shared/config.js", "content/markets.js", "content/detectors.js", "content/collect.js"];

// Automatic scanning is opt-in: content scripts are registered only while the optional
// https://*/* permission is granted. Otherwise pages are read via activeTab from the popup.
const AUTO_SCAN = { origins: [...AUTO_SCAN_ORIGINS] };
const AUTO_SCRIPT_ID = "dropcheck-auto";

async function syncAutoScan() {
  const enabled = await chrome.permissions.contains(AUTO_SCAN);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AUTO_SCRIPT_ID] });
  /** @type {chrome.scripting.RegisteredContentScript} */
  const script = { id: AUTO_SCRIPT_ID, matches: AUTO_SCAN.origins, js: CONTENT_FILES, runAt: "document_idle" };
  if (enabled && registered.length) await chrome.scripting.updateContentScripts([script]);
  else if (enabled) await chrome.scripting.registerContentScripts([script]);
  else if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [AUTO_SCRIPT_ID] });
}
// Serialized: two overlapping runs would both try to register the same script id.
let autoScanQueue = Promise.resolve();
const queueAutoScanSync = () => {
  autoScanQueue = autoScanQueue.then(syncAutoScan).catch(err => console.error("DropCheck auto-scan:", err));
};
chrome.runtime.onInstalled.addListener(queueAutoScanSync);
chrome.runtime.onStartup.addListener(queueAutoScanSync);
chrome.permissions.onAdded.addListener(queueAutoScanSync);
chrome.permissions.onRemoved.addListener(queueAutoScanSync);

// A first install opens the welcome page, which explains the icon and offers automatic
// scanning. Skipped when that is already granted: the eval and screenshot harnesses
// grant it in the manifest and need no extra tab.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== chrome.runtime.OnInstalledReason.INSTALL) return;
  try {
    if (await chrome.permissions.contains(AUTO_SCAN)) return;
    await chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html?welcome") });
  } catch (err) {
    console.error("DropCheck welcome page:", err);
  }
});

const EXTENSION_ORIGIN = chrome.runtime.getURL("");

// Host and URL come from the sender, never the payload, so one site cannot write
// another site's verdict. Only the popup (no sender.tab) may read verdicts.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg?.type === "PAGE_SIGNALS" && sender.tab?.id != null && sender.frameId === 0) {
    let page;
    try { page = new URL(sender.url || sender.tab.url); } catch { return false; }
    if (page.protocol !== "https:") return false;
    handleSignals(sender.tab.id, page, msg.payload)
      .then(() => sendResponse({ ok: true }), err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "GET_VERDICT" && !sender.tab && sender.url?.startsWith(EXTENSION_ORIGIN)
      && Number.isInteger(msg.tabId)) {
    getVerdict(msg.tabId)
      .then(sendResponse, err => sendResponse({ error: String(err) }));
    return true;
  }
  return false;
});

const logError = context => err => console.error(`DropCheck ${context}:`, err);

// A new page load in the tab invalidates its verdict.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    chrome.storage.session.remove(`tab:${tabId}`).catch(logError("clear tab verdict"));
    setBadge(tabId, null);
  }
});
chrome.tabs.onRemoved.addListener(tabId =>
  chrome.storage.session.remove(`tab:${tabId}`).catch(logError("clear tab verdict")));

// Expired cache entries are deleted so storage does not become a browsing history.
const PRUNE_ALARM = "prune-cache";
const prune = () => pruneLocal().catch(logError("prune cache"));
const schedulePrune = () => {
  chrome.alarms.create(PRUNE_ALARM, { periodInMinutes: 360 }).catch(logError("schedule prune"));
  prune();
};
chrome.runtime.onInstalled.addListener(schedulePrune);
chrome.runtime.onStartup.addListener(schedulePrune);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === PRUNE_ALARM) prune(); });

async function pruneLocal() {
  /** @type {Record<string, any>} */
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const stale = Object.entries(all).filter(([key, v]) => {
    if (key.startsWith("site:")) return !(now - v?.at < SITE_TTL_MS);
    if (key.startsWith("age:")) return !(now - v?.fetchedAt < (v?.createdAt ? AGE_TTL_MS : AGE_FAIL_TTL_MS));
    return false;
  }).map(([key]) => key);
  if (stale.length) await chrome.storage.local.remove(stale);
}

async function handleSignals(tabId, page, payload) {
  const [rules, marketplaces] = await Promise.all([loadRules(), loadMarketplaces()]);
  const host = page.hostname;
  // The payload is shaped by page content: keep only known fields, bounded in size.
  const clean = sanitizeSignals(payload);
  // Marketplaces are recognised from the sender's host, never from page content.
  const marketplace = D.detectMarketplace(host, marketplaces.marketplaces);
  /** @type {Record<string, any>} */
  const signals = marketplace ? { v: 1, isStore: false, marketplace }
    : clean.isStore ? { ...clean, host, url: page.href }
    : { v: 1, isStore: false };
  if (signals.isStore) signals.domain = await lookupDomain(D.registrableDomain(host));
  const verdict = scoreSignals(signals, rules);
  const entry = { at: Date.now(), host, signals, verdict };
  if (signals.isStore) entry.url = page.href;
  await chrome.storage.session.set({ [`tab:${tabId}`]: entry, [`host:${host}`]: entry });
  setBadge(tabId, verdict.band);
  for (const resolve of waiters.get(tabId) || []) resolve(entry);
  waiters.delete(tabId);
}

// The check mark lives in the badge, not the icon, so it only shows once a store
// has actually been checked. Non-store pages get no badge; marketplaces get the warning.
// The badge is not read out by screen readers, so the band also goes into the button's
// title (its accessible name). Errors are ignored: the tab may have closed in the meantime.
const BADGES = {
  likely: ["!", "#b42318"],
  marketplace: ["!", "#b42318"],
  open_marketplace: ["i", "#475467"],
  mixed: ["?", "#b54708"],
  none: ["✓", "#16a34a"]
};
function setBadge(tabId, band) {
  const badge = BADGES[band];
  const ignore = () => {};
  chrome.action.setBadgeText({ tabId, text: badge ? badge[0] : "" }).catch(ignore);
  if (badge) chrome.action.setBadgeBackgroundColor({ tabId, color: badge[1] }).catch(ignore);
  if (!badge) chrome.action.setTitle({ tabId, title: "DropCheck" }).catch(ignore);
  else {
    getLanguage()
      .then(lang => chrome.action.setTitle({ tabId, title: `DropCheck: ${bandLabel(band, lang)}` }))
      .catch(ignore);
  }
}

// A new language in the popup retitles the badges of tabs already checked.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[LANGUAGE_KEY]) return;
  chrome.storage.session.get(null).then((/** @type {Record<string, any>} */ all) => {
    for (const [key, entry] of Object.entries(all)) {
      if (key.startsWith("tab:")) setBadge(Number(key.slice(4)), entry?.verdict?.band);
    }
  }).catch(logError("retitle badges"));
});

async function getVerdict(tabId) {
  const key = `tab:${tabId}`;
  /** @type {Record<string, any>} */
  const session = await chrome.storage.session.get(key);
  const stored = session[key];
  // "No shop" is re-checked: an automatic scan may have run before the page rendered.
  if (stored && stored.verdict?.band !== "not_store") return stored;

  // No verdict yet: the page loaded before install, or the scan is still running.
  // Inject the collector (activeTab covers this when the popup was opened).
  let resolveWaiter;
  const pending = new Promise(resolve => {
    resolveWaiter = resolve;
    waiters.set(tabId, [...(waiters.get(tabId) || []), resolve]);
  });
  // Removes only this call's waiter: another popup may be waiting on the same tab.
  const dropWaiter = () => {
    const rest = (waiters.get(tabId) || []).filter(w => w !== resolveWaiter);
    if (rest.length) waiters.set(tabId, rest);
    else waiters.delete(tabId);
  };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  } catch (err) {
    dropWaiter();
    return stored || { error: "unsupported", detail: String(err) };
  }
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(stored || { error: "timeout" }), VERDICT_WAIT_MS);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
    dropWaiter();
  }
}

// Domain registration date via RDAP (the JSON successor to WHOIS). Never required:
// any failure yields ageDays: null and the domain_young rule simply does not fire.
// Domains whose registry publishes no date are not sent anywhere.
async function lookupDomain(name) {
  if (!hasRegistrationDate(name)) return withAge({ name, createdAt: null });
  const key = `age:${name}`;
  /** @type {Record<string, any>} */
  const local = await chrome.storage.local.get(key);
  const cached = local[key];
  if (cached) {
    const ttl = cached.createdAt ? AGE_TTL_MS : AGE_FAIL_TTL_MS;
    if (Date.now() - cached.fetchedAt < ttl) return withAge(cached);
  }
  let createdAt = null;
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(RDAP_TIMEOUT_MS) });
    if (res.ok) {
      const data = await res.json();
      const ev = (data.events || []).find(e => e.eventAction === "registration");
      if (ev?.eventDate && !Number.isNaN(Date.parse(ev.eventDate))) createdAt = ev.eventDate;
    }
  } catch { /* offline, timeout, or no RDAP service for this TLD */ }
  const record = { name, createdAt, fetchedAt: Date.now() };
  await chrome.storage.local.set({ [key]: record });
  return withAge(record);
}

function withAge({ name, createdAt }) {
  const ageDays = createdAt ? Math.floor((Date.now() - Date.parse(createdAt)) / DAY_MS) : null;
  return { name, createdAt, ageDays };
}
