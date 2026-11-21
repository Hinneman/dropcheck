// The settings controls and page texts, shared by the popup and the options page
// (which is also the welcome page opened on install).
import "../shared/config.js";
import { LANGUAGE_NAMES } from "../i18n/format.js";
import { setLanguage } from "../i18n/language.js";

export const AUTO_SCAN = { origins: [...globalThis.DropCheckConfig.AUTO_SCAN_ORIGINS] };

// Set once the popup's "check shops automatically" tip is closed, so it stays closed.
export const HINT_DISMISSED_KEY = "autoScanHintDismissed";

/**
 * Fills every data-i18n element with its text, and gives every data-i18n-label element
 * its accessible name and tooltip.
 * @param {Record<string, any>} t the language's ui table
 * @param {string} lang
 */
export function translatePage(t, lang) {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t[/** @type {HTMLElement} */ (el).dataset.i18n];
  }
  for (const el of document.querySelectorAll("[data-i18n-label]")) {
    const label = t[/** @type {HTMLElement} */ (el).dataset.i18nLabel];
    el.setAttribute("aria-label", label);
    el.setAttribute("title", label);
  }
}

/**
 * Only toggles the permission; the worker reacts to it. In the popup the permission
 * dialog can close the popup before request() resolves.
 * @param {HTMLInputElement} box
 * @param {(enabled: boolean) => void} [onChange]
 * @returns {Promise<boolean>} whether automatic scanning is on
 */
export async function setupAutoScan(box, onChange = () => {}) {
  box.checked = await chrome.permissions.contains(AUTO_SCAN);
  box.addEventListener("change", async () => {
    const granted = box.checked
      ? await chrome.permissions.request(AUTO_SCAN)
      : !(await chrome.permissions.remove(AUTO_SCAN));
    box.checked = granted;
    onChange(granted);
  });
  return box.checked;
}

/**
 * @param {HTMLSelectElement} select
 * @param {string} lang the language in use
 * @param {(lang: string) => void} onChange redraws the page in the new language
 */
export function setupLanguage(select, lang, onChange) {
  select.replaceChildren(...Object.entries(LANGUAGE_NAMES).map(([code, name]) => {
    const option = new Option(name, code, false, code === lang);
    option.lang = code;
    return option;
  }));
  select.addEventListener("change", () => {
    setLanguage(select.value).catch(err => console.error("DropCheck language setting:", err));
    onChange(select.value);
  });
}
