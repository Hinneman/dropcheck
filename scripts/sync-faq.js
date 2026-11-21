// Rebuilds the FAQPage structured data (JSON-LD) on each site page from its visible
// question blocks (<details><summary>), so search engines see exactly the text on the page.
// Run it after changing any question or answer in site/.
//
//   npm run sync-faq
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["site/index.html", "site/sv/index.html", "site/no/index.html"];

const plainText = html => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

for (const page of PAGES) {
  const file = path.join(ROOT, page);
  const html = readFileSync(file, "utf8");
  const entries = [...html.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map(m => ({
      "@type": "Question",
      name: plainText(m[1]),
      acceptedAnswer: { "@type": "Answer", text: plainText(m[2]) }
    }));
  let found = false;
  const out = html.replace(/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n<\/script>)/, (all, open, json, close) => {
    const data = JSON.parse(json);
    const faq = (data["@graph"] || [data]).find(n => n["@type"] === "FAQPage");
    if (!faq) return all;
    found = true;
    faq.mainEntity = entries;
    return open + JSON.stringify(data, null, 2) + close;
  });
  if (!found) throw new Error(`${page}: no FAQPage JSON-LD block found`);
  writeFileSync(file, out);
  console.log(`${page}: ${entries.length} questions`);
}
