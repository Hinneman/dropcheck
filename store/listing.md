# Chrome Web Store listing

Texts for the Chrome Web Store developer dashboard. Keep them in step with the README, the
site (site/) and the privacy policy (site/privacy.html) when the rules change.

## Store listing tab

- **Name:** DropCheck (from the manifest)
- **Summary:** taken from the manifest `description` (max 132 characters):
  "Flags dropshipping signals on Swedish and Norwegian online stores and explains each one.
  Observations, not accusations."
- **Category:** Shopping
- **Language:** English. Swedish and Norwegian listings can be added later (texts below).
- **Homepage URL:** https://hinneman.github.io/dropcheck/
- **Support URL:** https://github.com/Hinneman/dropcheck/issues

### Detailed description

```
Is this web shop selling its own products, or reselling items from AliExpress, Temu or Amazon at several times the price?

DropCheck checks the shop you are looking at and lists every sign it finds, with a short explanation of why it matters. It is built for Swedish and Norwegian shops and works best on Shopify, where most dropshipping shops run.

What it looks for
- Product photos that keep AliExpress, Alibaba or Amazon file names, or the default name of an AI image generator
- Returns that must be sent to China or to an unnamed "international warehouse"
- Buyers told to pay import VAT or customs on domestic orders
- Delivery times of ten days or more
- A domain or product catalog less than six months old
- No company registration or VAT number, only foreign phone numbers, or an email address at another brand's domain
- Countdown timers, "only 3 left" counters and nearly every product marked down 50 % or more

How the verdict works
Signs score points in four capped categories (supply, identity, sales pressure, pricing), so no single kind of evidence decides on its own. The result is Likely reseller, Mixed signals or No reseller signals found. Each sign is explained, and you can search for the source of a product photo with one click.

Observations, not accusations
Dropshipping is legal. DropCheck reports what it sees on the pages, not a judgment of the company.

Privacy
Everything is analysed in your browser. DropCheck has no server, no account and no analytics. It reads a page only when you click the icon, unless you turn on automatic checking. The only data sent anywhere is a shop's domain name to rdap.org, to look up when the domain was registered, and an image address to Google Lens when you click "Find the source".

Open source: https://github.com/Hinneman/dropcheck
Questions and answers: https://hinneman.github.io/dropcheck/
```

### Graphics

- **Icon:** extension/icons/icon-128.png
- **Screenshots** (1280x800): rendered by `npm run store-screenshots` into store/screenshots/,
  from a fictional shop on example.se. Never use a real shop in a screenshot.
- **Small promo tile** (440x280): store/screenshots/promo-small.png (same script).

## Privacy practices tab

### Single purpose

```
DropCheck shows signs that the online shop on the current page resells products from marketplaces such as AliExpress, Temu or Amazon (dropshipping), and explains each sign.
```

### Permission justifications

- **activeTab:**
  ```
  Reads the page the user is looking at when they click the DropCheck icon, to check it for dropshipping signs.
  ```
- **scripting:**
  ```
  Injects the page reader into the current tab after the user clicks the icon, and registers it for https pages when the user turns on automatic checking.
  ```
- **storage:**
  ```
  Keeps derived facts about a checked shop for 24 hours, domain registration dates for 30 days, the verdict for open tabs, and the automatic-checking setting, all locally.
  ```
- **alarms:**
  ```
  Runs a cleanup every six hours that deletes expired cached facts and domain dates.
  ```
- **Host permission https://*/* (optional):**
  ```
  Optional and off by default. Requested only when the user turns on "Check shops automatically" in the popup, so shop pages can be checked and a warning badge shown without clicking the icon. Turning the setting off removes the permission.
  ```

### Remote code

No. All code and the scoring rules (rules/signals.json) ship in the package.

### Data usage

Data the extension handles:
- **Website content:** yes. Page text, links and image addresses are read to find the signs.
  They are analysed locally and not sent anywhere.
- **Web history:** yes, narrowly. The domain name of a checked shop is sent to rdap.org to look
  up its registration date (not for .se, .dk and .de).
- Everything else (personally identifiable information, health, financial, authentication,
  personal communications, location, user activity): no.

Certifications (all true):
- Data is not sold or transferred to third parties, outside the approved use cases.
- Data is not used or transferred for purposes unrelated to the single purpose.
- Data is not used or transferred to determine creditworthiness or for lending.

**Privacy policy URL:** https://hinneman.github.io/dropcheck/privacy.html

## Distribution

Start as **Unlisted** (installable only with the link) while the labeled dataset of
legitimate shops is small, then switch to Public.

## Swedish and Norwegian listing texts (for later)

Summary (sv):
```
Visar tecken på att en svensk eller norsk nätbutik dropshippar och förklarar varje tecken. Iakttagelser, inte anklagelser.
```

Summary (nb):
```
Viser tegn på at en norsk eller svensk nettbutikk dropshipper, og forklarer hvert tegn. Observasjoner, ikke beskyldninger.
```
