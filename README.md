# DropCheck

<img src="assets/icon.svg" alt="DropCheck icon" width="64" align="left">

Chrome extension that flags dropshipping signals on Swedish and Norwegian online stores
and explains each one. It reports observations about a page, not a judgment of the
company.

<br clear="left">

## What it checks

Each signal scores points in one of four categories. Every category is capped, so no
single kind of evidence can decide the verdict on its own.

- **Supply:** dropshipping fulfilment apps (DSers, CJ Dropshipping, Zendrop, AutoDS,
  Spocket, Oberlo), product images that keep AliExpress or Amazon file names, stated
  delivery times of 10 days or more, themes marketed to dropshippers.
- **Identity:** a domain registered less than six months ago, no company registration
  or VAT number, a free-mail contact address, unfilled template text.
- **Sales pressure:** countdown timers, "only N left" and "N people viewing" counters.
- **Pricing:** most products marked down 50 % or more from a struck-through price.

The verdict is *Likely reseller* (60 points or more), *Mixed signals* (30 or more) or
*No reseller signals found*. The platform, print-on-demand and review apps, cheap
top-level domains, payment logos and the detected market are shown as context and
score nothing.

Sweden and Norway have market profiles: org. number formats with check digits, address
patterns and local payment methods. Keyword lists cover English, Swedish, Norwegian
and German. Stores in other countries are scored with the generic patterns only.

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
  popup/                   verdict, fired rules, context, "Find the source",
                           automatic scanning setting
  icons/                   PNG icons rendered from assets/ (npm run icons)
assets/icon.svg            icon source
assets/icon-16.svg,        simplified toolbar versions (16 and 32 px), drawn on the
assets/icon-32.svg         pixel grid
scripts/render-icons.js    renders the PNG icons with Puppeteer
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

## Network requests

Analysis runs in the browser. Besides the page itself, DropCheck makes these requests:

- **The store:** up to seven of its own pages (terms, shipping, contact and similar)
  and, on Shopify, `/products.json`, all without cookies and cached 24 hours. Product
  images are loaded from the store only when the user clicks "Show product images".
- **rdap.org:** the registrable domain name, to find its registration date. rdap.org
  forwards the lookup to the domain's registry. Cached 30 days. Not sent for .se, .dk
  and .de domains: those registries publish no registration date, so there is nothing
  to look up.
- **Google Lens:** an image URL, only when the user clicks an image under "Find the source".

Nothing else is sent anywhere.
