# Chrome Web Store listing

Texts for the Chrome Web Store developer dashboard. Keep them in step with the README, the
site (site/) and the privacy policy (site/privacy.html) when the rules change.

## Store listing tab

- **Name:** DropCheck (from the manifest)
- **Summary:** taken from the manifest `description`, which reads extension/_locales/<lang>/messages.json
  (max 132 characters). English:
  "Flags dropshipping signals on Swedish and Norwegian online stores and explains each one.
  Observations, not accusations."
- **Category:** Shopping
- **Language:** English, plus Swedish and Norwegian listings (texts at the end of this file).
- **Homepage URL:** https://hinneman.github.io/dropcheck/
- **Support URL:** https://github.com/Hinneman/dropcheck/issues

### Detailed description

```
Is this web shop selling its own products, or reselling items from AliExpress, Temu or Amazon at several times the price?

DropCheck checks the shop you are looking at and lists every sign it finds, with a short explanation of why it matters. It is built for Swedish and Norwegian shops and works best on Shopify, where most dropshipping shops run.

What it looks for
- Product photos that keep AliExpress, Alibaba, Amazon, Temu or Shein file names, or the default name of an AI image generator
- Returns that must be sent to China or to an unnamed "international warehouse"
- Buyers told to pay import VAT or customs on domestic orders
- Delivery times of ten days or more
- A domain or product catalog less than six months old
- No company registration or VAT number, only foreign phone numbers, or an email address at another brand's domain
- Countdown timers, "only 3 left" counters and nearly every product marked down 50 % or more

How the verdict works
Signs score points in four capped categories (supply, identity, sales pressure, pricing), so no single kind of evidence decides on its own. The result is Likely dropshipper, Mixed signals or No dropshipping signals found. Each sign is explained, and you can search for the source of a product photo with one click.

Observations, not accusations
Dropshipping is legal. DropCheck reports what it sees on the pages, not a judgment of the company.

Privacy
Everything is analysed in your browser. DropCheck has no server, no account and no analytics. It reads a page only when you click the icon, unless you turn on automatic checking. The only data sent anywhere is a shop's domain name to rdap.org, to look up when the domain was registered, and an image address to Google Lens when you click "Find the source".

DropCheck comes in English, Swedish and Norwegian.

Open source: https://github.com/Hinneman/dropcheck
Questions and answers: https://hinneman.github.io/dropcheck/
```

### Graphics

- **Icon:** extension/icons/icon-128.png
- **Screenshots** (1280x800): rendered by `npm run store-screenshots` into store/screenshots/,
  from a fictional shop on example.se. Never use a real shop in a screenshot. For the Swedish
  and Norwegian listings, `npm run store-screenshots -- --lang sv` (or `nb`) renders the popup
  in that language into store/screenshots/sv/ (or nb/); the Norwegian set uses fictional shops
  on example.no.
- **Small promo tile** (440x280): store/screenshots/promo-small.png (same script), with a
  translated tagline in each language folder.

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
  Keeps derived facts about a checked shop for 24 hours, domain registration dates for 30 days, the verdict for open tabs, and the user's settings (automatic checking, language), all locally.
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

No. All code, the scoring rules (rules/signals.json) and the marketplace list
(rules/marketplaces.json) ship in the package.

### Data usage

Data the extension handles:
- **Website content:** yes. Page text, links and image addresses are read to find the signs.
  They are analysed locally and not sent anywhere.
- **Web history:** yes, narrowly. The domain name of a checked shop is sent to rdap.org to look
  up its registration date (not for .se, .no, .dk and .de).
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

## Swedish listing (sv)

Add it under Store listing > language "Svenska". Graphics: store/screenshots/sv/.

Summary, from extension/_locales/sv/messages.json:
```
Visar tecken på att en svensk eller norsk nätbutik dropshippar och förklarar varje tecken. Iakttagelser, inte anklagelser.
```

Detailed description:
```
Säljer nätbutiken egna produkter, eller säljer den vidare varor från AliExpress, Temu eller Amazon för flera gånger priset?

DropCheck kontrollerar butiken du tittar på och listar varje tecken den hittar, med en kort förklaring av varför det spelar roll. Tillägget är byggt för svenska och norska butiker och fungerar bäst på Shopify, där de flesta dropshippingbutiker finns.

Det här letar DropCheck efter
- Produktbilder som behållit filnamn från AliExpress, Alibaba, Amazon, Temu eller Shein, eller standardnamnet från en AI-bildgenerator
- Returer som ska skickas till Kina eller till ett onämnt "internationellt lager"
- Köparen ska betala importmoms eller tull på inrikes beställningar
- Leveranstider på tio dagar eller mer
- En domän eller ett sortiment som är yngre än sex månader
- Inget organisations- eller momsnummer, bara utländska telefonnummer eller en e-postadress på ett annat varumärkes domän
- Nedräkningar, räknare med "bara 3 kvar" och att nästan alla varor är nedsatta 50 % eller mer

Så fungerar bedömningen
Tecknen ger poäng i fyra kategorier med tak (leverantör, identitet, säljpress, priser), så ingen enskild sorts bevis avgör ensam. Resultatet är Trolig dropshippingbutik, Blandade tecken eller Inga tecken hittades. Varje tecken förklaras, och du kan söka efter källan till en produktbild med ett klick.

Iakttagelser, inte anklagelser
Dropshipping är lagligt. DropCheck rapporterar vad den ser på sidorna, inte ett omdöme om företaget.

Integritet
Allt analyseras i din webbläsare. DropCheck har ingen server, inget konto och ingen statistikinsamling. Tillägget läser en sida bara när du klickar på ikonen, om du inte slår på automatisk kontroll. Det enda som skickas någonstans är butikens domännamn till rdap.org, för att ta reda på när domänen registrerades, och en bildadress till Google Lens när du klickar på "Hitta källan".

DropCheck finns på svenska, norska och engelska.

Öppen källkod: https://github.com/Hinneman/dropcheck
Frågor och svar: https://hinneman.github.io/dropcheck/sv/
```

## Norwegian listing (no)

Add it under Store listing > language "Norsk". Graphics: store/screenshots/nb/.

Summary, from extension/_locales/no/messages.json:
```
Viser tegn på at en norsk eller svensk nettbutikk dropshipper, og forklarer hvert tegn. Observasjoner, ikke beskyldninger.
```

Detailed description:
```
Selger nettbutikken egne produkter, eller videreselger den varer fra AliExpress, Temu eller Amazon til flere ganger prisen?

DropCheck sjekker butikken du ser på og lister opp hvert tegn den finner, med en kort forklaring på hvorfor det betyr noe. Utvidelsen er laget for norske og svenske butikker og fungerer best på Shopify, der de fleste dropshippingbutikker ligger.

Dette ser DropCheck etter
- Produktbilder som har beholdt filnavn fra AliExpress, Alibaba, Amazon, Temu eller Shein, eller standardnavnet fra en AI-bildegenerator
- Returer som må sendes til Kina eller til et ikke navngitt "internasjonalt lager"
- Kjøperen må betale toll eller importmva på innenlandske bestillinger
- Leveringstid på ti dager eller mer
- Et domene eller sortiment som er yngre enn seks måneder
- Manglende organisasjons- eller MVA-nummer, bare utenlandske telefonnumre eller en e-postadresse på et annet merkes domene
- Nedtellinger, tellere med "kun 3 igjen" og at nesten alle varer er satt ned 50 % eller mer

Slik fungerer vurderingen
Tegnene gir poeng i fire kategorier med tak (leverandør, identitet, salgspress, priser), så ingen enkelt type bevis avgjør alene. Resultatet er Sannsynlig dropshippingbutikk, Blandede tegn eller Ingen tegn funnet. Hvert tegn forklares, og du kan søke etter kilden til et produktbilde med ett klikk.

Observasjoner, ikke beskyldninger
Dropshipping er lovlig. DropCheck rapporterer hva den ser på sidene, ikke en vurdering av firmaet.

Personvern
Alt analyseres i nettleseren din. DropCheck har ingen server, ingen konto og ingen statistikkinnsamling. Utvidelsen leser en side bare når du klikker på ikonet, med mindre du slår på automatisk sjekk. Det eneste som sendes noe sted, er butikkens domenenavn til rdap.org, for å finne ut når domenet ble registrert, og en bildeadresse til Google Lens når du klikker på "Finn kilden".

DropCheck finnes på norsk, svensk og engelsk.

Åpen kildekode: https://github.com/Hinneman/dropcheck
Spørsmål og svar: https://hinneman.github.io/dropcheck/no/
```
