// Turns the scorer's ids, keys and parameters into text in the chosen language.
// Pure, like the scorer: runs in the popup, the service worker and Node.
import en from "./en.js";
import nb from "./nb.js";
import sv from "./sv.js";

export const LANGUAGES = { en, nb, sv };
export const DEFAULT_LANGUAGE = "en";
// Each language under its own name, in the order the popup lists them.
export const LANGUAGE_NAMES = { en: "English", nb: "Norsk", sv: "Svenska" };

export const isLanguage = lang => typeof lang === "string" && Object.hasOwn(LANGUAGES, lang);

/** @param {string} [lang] */
const table = lang => LANGUAGES[isLanguage(lang) ? lang : DEFAULT_LANGUAGE];

// The language for a browser locale such as "sv-SE" or "nb": Swedish, Norwegian (bokmål
// for nb, nn and no), otherwise English.
export function pickLanguage(locale = "") {
  const base = locale.toLowerCase().split(/[-_]/)[0];
  if (base === "sv") return "sv";
  if (["nb", "nn", "no"].includes(base)) return "nb";
  return DEFAULT_LANGUAGE;
}

/** @param {string} [lang] */
export const ui = lang => table(lang).ui;

/** @param {string} band @param {string} [lang] */
export const bandLabel = (band, lang) => table(lang).bands[band];

/** @param {{ id: string, params: Record<string, any> }} fired @param {string} [lang] */
export const ruleText = (fired, lang) => table(lang).rules[fired.id](fired.params);

/** @param {{ key: string, params?: Record<string, any> }} note @param {string} [lang] */
export function noteText(note, lang) {
  const t = table(lang);
  return t.notes[note.key](note.params || {}, t.markets);
}
