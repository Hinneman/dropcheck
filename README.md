# DropCheck

Chrome extension that shows observable dropshipping signals on online stores.

## Layout

```
extension/                 load this folder in Chrome
  manifest.json
  content/markets.js       market profiles (SE, NO) and keyword lists per language
  content/detectors.js     pure detector functions (unit-tested)
  content/collect.js       reads the page, builds the signal object
  background/score.js      rules -> verdict (pure, shared with Node)
  background/worker.js     service worker: domain age (RDAP), scoring, cache, badge
  rules/signals.json       weights, category caps, band thresholds
  popup/                   verdict, fired rules, context, "Find the source"
eval/
  run.js                   Puppeteer harness -> eval/results.csv + false positive rate
test/                      node:test unit tests; se.test.js and no.test.js hold the
                           country-specific cases, helpers.js the shared store fixture
```

## Use

- **Load:** open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick `extension/`.
- **Modes:** by default a page is read only when the DropCheck icon is clicked (`activeTab`).
  The popup's "Check shops automatically" box requests the optional `https://*/*`
  permission; while it is granted, the worker registers the content scripts on every
  https page and the badge warns without opening the popup. Unticking it removes both.
- **Unit tests:** `npm test` (no dependencies needed).
- **Evaluation:** `npm install` once, then `npm run eval -- path/to/stores.csv`. Any CSV
  works if one row has "URL" and "Label" column headers; labels starting with "Legit"
  count toward the false positive rate. The labeled dataset is kept out of the repo
  because it names real stores; without an argument the harness reads `docs/dataset.csv`.
  Options: `--limit N`, `--headful`, `--out file.csv`. The harness loads a temporary copy
  of the extension with automatic scanning granted, since a headless run cannot click
  through the permission prompt.

After any change to `rules/signals.json` or a detector, re-run the evaluation and watch
the false positive rate on the legitimate stores (target: under 10 %).

## What leaves the browser

- The registrable domain name goes to rdap.org, which forwards the lookup to the
  domain's registry, to find its registration date (cached 30 days).
- An image URL goes to Google Lens, only when the user clicks "Find the source".

Nothing else is sent anywhere.
