// The language the user chose in the popup. Local storage, not sync: the privacy policy
// promises that nothing leaves the browser, and Chrome sync would send it to Google.
// Until they choose, the browser's own language decides.
import { isLanguage, pickLanguage } from "./format.js";

export const LANGUAGE_KEY = "language";

export async function getLanguage() {
  try {
    /** @type {Record<string, any>} */
    const stored = await chrome.storage.local.get(LANGUAGE_KEY);
    if (isLanguage(stored[LANGUAGE_KEY])) return stored[LANGUAGE_KEY];
  } catch { /* storage unavailable: fall back to the browser language */ }
  return pickLanguage(chrome.i18n.getUILanguage());
}

/** @param {string} lang */
export const setLanguage = lang => chrome.storage.local.set({ [LANGUAGE_KEY]: lang });
