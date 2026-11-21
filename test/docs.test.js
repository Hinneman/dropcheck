// Facts that the code owns but hand-written pages repeat: these tests fail when they drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NO_REGISTRATION_DATE_TLDS, formatTldList } from "../extension/background/score.js";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const flat = text => text.replace(/\s+/g, " ");

test("every page that explains the RDAP lookup names the TLDs that are skipped", () => {
  const pages = {
    "extension/popup/popup.html": "and",   // fallback text; popup.js fills it from the code
    "site/index.html": "and",
    "site/privacy.html": "and",
    "site/sv/index.html": "och",
    "site/no/index.html": "og",
    "README.md": "and",
    "store/listing.md": "and"
  };
  for (const [file, and] of Object.entries(pages)) {
    const expected = formatTldList(NO_REGISTRATION_DATE_TLDS, and);
    assert.ok(flat(read(file)).includes(expected), `${file} should say "${expected}"`);
  }
});

test("the version is the same everywhere it is written", () => {
  const version = JSON.parse(read("extension/manifest.json")).version;
  const lock = JSON.parse(read("package-lock.json"));
  const found = {
    "package.json": JSON.parse(read("package.json")).version,
    "package-lock.json": lock.version,
    "package-lock.json packages[\"\"]": lock.packages?.[""]?.version,
    "site/privacy.html": read("site/privacy.html").match(/version (\d+\.\d+\.\d+)/)?.[1]
  };
  for (const page of ["site/index.html", "site/sv/index.html", "site/no/index.html"]) {
    for (const [i, m] of [...read(page).matchAll(/"softwareVersion": "([^"]+)"/g)].entries()) {
      found[`${page} softwareVersion #${i + 1}`] = m[1];
    }
  }
  for (const form of ["false-alarm.yml", "missed-dropshipper.yml"]) {
    found[`.github/ISSUE_TEMPLATE/${form}`] =
      read(`.github/ISSUE_TEMPLATE/${form}`).match(/placeholder: "(\d+\.\d+\.\d+)"/)?.[1];
  }
  for (const [where, v] of Object.entries(found)) assert.equal(v, version, `${where} should be ${version}`);
});

test("formatTldList joins with commas and the given word", () => {
  assert.equal(formatTldList(["se"]), ".se");
  assert.equal(formatTldList(["se", "no"], "och"), ".se och .no");
  assert.equal(formatTldList(["se", "no", "dk", "de"]), ".se, .no, .dk and .de");
});
