# DropCheck

Chrome extension that shows observable dropshipping signals on online stores.

## Layout

```
extension/                 load this folder in Chrome
  manifest.json
  content/detectors.js     pure detector functions (unit-tested)
  content/collect.js       reads the page, builds the signal object
  background/score.js      rules -> verdict (pure, shared with Node)
  background/worker.js     service worker: domain age (RDAP), scoring, cache, badge
  rules/signals.json       weights, category caps, band thresholds
  popup/                   verdict, fired rules, context, "Find the source"
eval/
  run.js                   Puppeteer harness -> eval/results.csv + false positive rate
test/                      node:test unit tests
```

## Use

- **Load:** `chrome://extensions` → Developer mode → Load unpacked → pick `extension/`.
- **Unit tests:** `npm test` (no dependencies needed).
- **Evaluation:** `npm install` once, then `npm run eval -- path/to/stores.csv`. Any CSV
  works if one row has "URL" and "Label" column headers; labels starting with "Legit"
  count toward the false positive rate. The labeled dataset is kept out of the repo
  because it names real stores; without an argument the harness reads `docs/dataset.csv`.
  Options: `--limit N`, `--headful`, `--out file.csv`.

After any change to `rules/signals.json` or a detector, re-run the evaluation and watch
the false positive rate on the legitimate stores (target: under 10 %).

## What leaves the browser

- The registrable domain name goes to rdap.org to look up its registration date
  (cached 30 days).
- An image URL goes to Google Lens, only when the user clicks "Find the source".

Nothing else is sent anywhere.
