// Service worker: receives page signals, adds domain age, scores, caches the verdict.
import "../content/markets.js";
import "../content/detectors.js";
import { hasRegistrationDate, scoreSignals } from "./score.js";

const D = globalThis.DropCheckDetectors;
const AGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;      // successful lookups
const AGE_FAIL_TTL_MS = 24 * 60 * 60 * 1000;      // failed lookups: retry next day
const SITE_TTL_MS = 24 * 60 * 60 * 1000;         // must match collect.js
const RDAP_TIMEOUT_MS = 8000;
const VERDICT_WAIT_MS = 25000;

// A failed load is not cached, so the next signal retries instead of failing until the
// worker restarts.
let rulesPromise = null;
const loadRules = () =>
  (rulesPromise ??= fetch(chrome.runtime.getURL("rules/signals.json"))
    .then(r => r.json())
    .catch(err => { rulesPromise = null; throw err; }));

const waiters = new Map();   // tabId -> [resolve]

const CONTENT_FILES = ["content/markets.js", "content/detectors.js", "content/collect.js"];

// Automatic scanning is opt-in: content scripts are registered only while the optional
// https://*/* permission is granted. Otherwise pages are read via activeTab from the popup.
const AUTO_SCAN = { origins: ["https://*/*"] };
const AUTO_SCRIPT_ID = "dropcheck-auto";

async function syncAutoScan() {
  const enabled = await chrome.permissions.contains(AUTO_SCAN);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AUTO_SCRIPT_ID] });
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

// A new page load in the tab invalidates its verdict.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    chrome.storage.session.remove(`tab:${tabId}`);
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove(`tab:${tabId}`));

// Expired cache entries are deleted so storage does not become a browsing history.
const PRUNE_ALARM = "prune-cache";
const schedulePrune = () => {
  chrome.alarms.create(PRUNE_ALARM, { periodInMinutes: 360 });
  pruneLocal();
};
chrome.runtime.onInstalled.addListener(schedulePrune);
chrome.runtime.onStartup.addListener(schedulePrune);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === PRUNE_ALARM) pruneLocal(); });

async function pruneLocal() {
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
  const rules = await loadRules();
  const host = page.hostname;
  const signals = payload?.isStore
    ? { ...payload, host, url: page.href }
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

function setBadge(tabId, band) {
  const badge = { likely: ["!", "#b42318"], mixed: ["?", "#b54708"] }[band];
  chrome.action.setBadgeText({ tabId, text: badge ? badge[0] : "" }).catch(() => {});
  if (badge) chrome.action.setBadgeBackgroundColor({ tabId, color: badge[1] }).catch(() => {});
}

async function getVerdict(tabId) {
  const key = `tab:${tabId}`;
  const stored = (await chrome.storage.session.get(key))[key];
  if (stored) return stored;

  // No verdict yet: the page loaded before install, or the scan is still running.
  // Inject the collector (activeTab covers this when the popup was opened).
  const pending = new Promise(resolve => {
    waiters.set(tabId, [...(waiters.get(tabId) || []), resolve]);
  });
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  } catch (err) {
    waiters.delete(tabId);
    return { error: "unsupported", detail: String(err) };
  }
  const timeout = new Promise(resolve =>
    setTimeout(() => resolve({ error: "timeout" }), VERDICT_WAIT_MS));
  return Promise.race([pending, timeout]);
}

// Domain registration date via RDAP (the JSON successor to WHOIS). Never required:
// any failure yields ageDays: null and the domain_young rule simply does not fire.
// Domains whose registry publishes no date are not sent anywhere.
async function lookupDomain(name) {
  if (!hasRegistrationDate(name)) return withAge({ name, createdAt: null });
  const key = `age:${name}`;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached) {
    const ttl = cached.createdAt ? AGE_TTL_MS : AGE_FAIL_TTL_MS;
    if (Date.now() - cached.fetchedAt < ttl) return withAge(cached);
  }
  let createdAt = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RDAP_TIMEOUT_MS);
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(name)}`, { signal: ctrl.signal });
    clearTimeout(timer);
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
  const ageDays = createdAt ? Math.floor((Date.now() - Date.parse(createdAt)) / 86400000) : null;
  return { name, createdAt, ageDays };
}
