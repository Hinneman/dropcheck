# DropCheck

## Data

- Never put real data in the repo: code, tests, comments, fixtures, scripts, site/, store/,
  README, commit messages and PR texts. Use fictional data only:
  - Domains and URLs: example.se / example.no / example.com and their subdomains
    (www.example.se, cdn.example.com). Never a real shop's, marketplace's or CDN's URL.
  - Org. numbers 559999-9991 and 999 999 999, the address Kvarngatan 2B, 123 45 Småby,
    and made-up names, emails and phone numbers.
  - Image file names and IDs (AliExpress, Amazon, Alibaba, Temu, Shein, AI generators):
    invent them in the same format. Never copy one seen on a real site, even as a
    "not matched" case.
- Never real stores, companies, addresses or people, and no real store names in commit
  messages or comments either (say "a Swedish store in the dataset" instead).
- One exception: a real third-party host or code string may appear where the detector
  itself matches it and the test is about that match (cdn.shopify.com for Shopify
  detection, an app's script host for app detection). Use example.com for every other URL.
- Real store data, findings and research notes live only in docs/, which is gitignored,
  or in the scratchpad.
