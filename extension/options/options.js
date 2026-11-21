import { ui } from "../i18n/format.js";
import { getLanguage } from "../i18n/language.js";
import { setupAutoScan, setupLanguage, translatePage } from "../settings/settings.js";

const $ = id => document.getElementById(id);

// The worker opens this page with ?welcome right after install.
const welcome = new URLSearchParams(location.search).has("welcome");

function applyStatic(lang) {
  const t = ui(lang);
  translatePage(t, lang);
  document.title = welcome ? "DropCheck" : `DropCheck: ${t.settings}`;
}

async function main() {
  const lang = await getLanguage();
  $("welcome").hidden = !welcome;
  $("later").hidden = !welcome;
  applyStatic(lang);
  setupLanguage(/** @type {HTMLSelectElement} */ ($("language")), lang, applyStatic);
  await setupAutoScan(/** @type {HTMLInputElement} */ ($("auto-scan")));
}

main().catch(err => console.error("DropCheck settings:", err));
