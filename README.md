# DropCheck

<img src="assets/icon.svg" alt="DropCheck icon" width="64" align="left">

Chrome extension that flags dropshipping signals on Swedish and Norwegian online stores
and explains each one. It reports observations about a page, not a judgment of the
company. The extension comes in English, Swedish and Norwegian.

<br clear="left">

**Svenska:** DropCheck är ett tillägg för Chrome som visar tecken på att en nätbutik
säljer vidare varor från AliExpress, Temu eller Amazon (dropshipping): bilder från
marknadsplatser, returer till utlandet, tull som köparen betalar, en ny domän och saknat
organisationsnummer. Varje tecken förklaras.

**Norsk:** DropCheck er en utvidelse for Chrome som viser tegn på at en nettbutikk
videreselger varer fra AliExpress, Temu eller Amazon (dropshipping): bilder fra
markedsplasser, returer til utlandet, toll som kjøperen betaler, et nytt domene og
manglende organisasjonsnummer. Hvert tegn forklares.

Questions and answers, and how the verdict is reached:
[hinneman.github.io/dropcheck](https://hinneman.github.io/dropcheck/)
([svenska](https://hinneman.github.io/dropcheck/sv/),
[norsk](https://hinneman.github.io/dropcheck/no/)).

## What it checks

Each signal scores points in one of four categories. Every category is capped, so no
single kind of evidence can decide the verdict on its own.

- **Supply:** dropshipping fulfilment apps (DSers, CJ Dropshipping, Zendrop, AutoDS,
  Spocket, Oberlo), product images that keep AliExpress, Alibaba or Amazon file names,
  product tags with Amazon product IDs left by import apps, product images that keep the
  default file name of an AI image generator, stated delivery times of 10 days or more,
  themes marketed to dropshippers, returns sent to China or to an unnamed "international
  warehouse", buyers told to pay import VAT or customs on domestic orders.
- **Identity:** a domain registered less than six months ago, a product catalog whose
  oldest product was added less than six months ago, no company registration or VAT
  number (counted only when the other signs already reach 30 points), phone numbers only
  with a foreign country code (a neighbouring Nordic country does not count), an email
  address at another brand's domain, a free-mail contact address, unfilled template text.
- **Sales pressure:** countdown timers, "only N left" and "N people viewing" counters.
- **Pricing:** most products marked down 50 % or more from a struck-through price.

The verdict is *Likely dropshipper* (60 points or more), *Mixed signals* (30 or more) or
*No dropshipping signals found*. The platform, print-on-demand and review apps, cheap
top-level domains, payment logos and the detected market are shown as context and
score nothing.

Sweden and Norway have market profiles: org. number formats with check digits, address
patterns and local payment methods. Keyword lists cover English, Swedish, Norwegian
and German. Stores in other countries are scored with the generic patterns only.

## Layout

```
extension/                 load this folder in Chrome
  manifest.json
  shared/config.js         constants shared by content scripts, worker and popup
  content/markets.js       market profiles (SE, NO) and keyword lists per language
  content/detectors.js     pure detector functions (unit-tested)
  content/collect.js       reads the page, builds the signal object
  background/score.js      rules -> verdict (pure, shared with Node)
  background/sanitize.js   bounds the signal object a content script sends (pure)
  background/worker.js     service worker: domain age (RDAP), scoring, cache, badge
  rules/signals.json       weights, category caps, band thresholds
  i18n/                    texts per language (en.js, sv.js, nb.js), the formatter that
                           turns the scorer's rule ids and parameters into sentences, and
                           the language setting
  popup/                   verdict, fired rules, context, "Find the source",
                           automatic scanning and language settings
  icons/                   PNG icons rendered from assets/ (npm run icons)
  _locales/                store name and description per language (en, sv, no)
assets/icon.svg            icon source, rendered at every size
scripts/render-icons.js    renders the PNG icons with Puppeteer
scripts/sync-faq.js        rebuilds the site's FAQ structured data (npm run sync-faq)
scripts/store-screenshots.js  renders the Chrome Web Store graphics from fictional Swedish
                           and Norwegian shops (npm run store-screenshots, -- --lang sv|nb)
site/                      GitHub Pages site (en, sv/, no/, privacy.html), deployed by pages.yml
store/                     Chrome Web Store listing texts and graphics
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
- **Unit tests:** `npm test` (no dependencies needed). They also check that the docs
  name the TLDs that are not looked up, and that the version matches everywhere.
- **Lint and type check:** `npm install` once, then `npm run lint` and `npm run typecheck`
  (JSDoc-checked JavaScript, no build step; declarations for it live in types/). CI runs
  all three.
- **Evaluation:** `npm install` once, then `npm run eval -- path/to/stores.csv`. Any CSV
  works if one row has "URL" and "Label" column headers; labels starting with "Legit"
  count toward the false positive rate, and "No store detected" marks pages that are not
  shops (news, agencies), which must not be scored as shops. The labeled dataset is kept
  out of the repo because it names real stores; without an argument the harness reads
  `docs/dataset.csv`.
  Options: `--limit N`, `--headful`, `--out file.csv`, `--concurrency N` (stores loaded at
  once, default 4; keep it low, Shopify rate-limits per IP). The harness loads a temporary copy
  of the extension with automatic scanning granted, since a headless run cannot click
  through the permission prompt.

After any change to `rules/signals.json` or a detector, re-run the evaluation and watch
the false positive rate on the legitimate stores (target: under 10 %).

## Network requests

Analysis runs in the browser. Besides the page itself, DropCheck makes these requests:

- **The store:** up to nine of its own pages (terms, shipping, contact, legal notice and similar)
  and, on Shopify, `/products.json`, all without cookies and cached 24 hours. Product
  images are loaded from the store only when the user clicks "Show product images".
- **rdap.org:** the registrable domain name, to find its registration date. rdap.org
  forwards the lookup to the domain's registry. Cached 30 days. Not sent for .se, .no,
  .dk and .de domains: .se, .dk and .de publish no registration date, and the .no
  registry registers a domain anew when it changes holder, so its date can be weeks old
  for a shop that has traded for decades.
- **Google Lens:** an image URL, only when the user clicks an image under "Find the source".

Nothing else is sent anywhere.
