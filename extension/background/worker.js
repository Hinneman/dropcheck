// Service worker: receives page signals, adds domain age, scores, caches the verdict.
import "../content/markets.js";
import "../content/detectors.js";
import { scoreSignals } from "./score.js";

const D = globalThis.DropCheckDetectors;
const AGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;      // successful lookups
const AGE_FAIL_TTL_MS = 24 * 60 * 60 * 1000;      // failed lookups: retry next day
const RDAP_TIMEOUT_MS = 8000;
const VERDICT_WAIT_MS = 25000;

let rulesPromise = null;
const loadRules = () =>
  (rulesPromise ??= fetch(chrome.runtime.getURL("rules/signals.json")).then(r => r.json()));

const waiters = new Map();   // tabId -> [resolve]

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PAGE_SIGNALS" && sender.tab?.id != null) {
    handleSignals(sender.tab.id, msg.payload)
      .then(() => sendResponse({ ok: true }), err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "GET_VERDICT") {
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

async function handleSignals(tabId, payload) {
  const rules = await loadRules();
  const signals = { ...payload };
  if (signals.isStore) signals.domain = await lookupDomain(D.registrableDomain(signals.host));
  const verdict = scoreSignals(signals, rules);
  const entry = { at: Date.now(), url: signals.url, host: signals.host, signals, verdict };
  await chrome.storage.session.set({ [`tab:${tabId}`]: entry, [`host:${signals.host}`]: entry });
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
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/markets.js", "content/detectors.js", "content/collect.js"]
    });
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
async function lookupDomain(name) {
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
