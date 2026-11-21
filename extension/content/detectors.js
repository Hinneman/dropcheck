// Pure detector functions: strings in, plain values out. No DOM access, so each one
// can be unit-tested in Node (test/detectors.test.js).
//
// Keyword lists and market formats come from markets.js, which must load first.
// Loaded three ways: as a content script before collect.js, imported for its side
// effect by the module service worker, and imported by the Node tests. It therefore
// has no import/export and only attaches itself to globalThis. The IIFE keeps a
// second injection into the same page from redeclaring top-level names.
(() => {
  if (globalThis.DropCheckDetectors) return;

  // ---------- Technical ----------

  const APP_SIGNATURES = {
    dsers:    ["dsers", "dser-"],
    cj:       ["cjdropshipping", "cjapp"],
    zendrop:  ["zendrop"],
    autods:   ["autods"],
    spocket:  ["spocket"],
    oberlo:   ["oberlo"],
    printful: ["printful"],
    vitals:   ["vitals.co", "appsolve"],   // bundled app suite, very common
    loox:     ["loox.io"],
    judgeme:  ["judge.me"]
  };

  // Themes used almost exclusively by dropshippers. Matched against the theme name.
  const DS_THEMES = ["debutify", "shrine", "booster", "shoptimized"];

  function detectPlatform(scriptSrcs, markup) {
    const src = scriptSrcs.join(" ").toLowerCase();
    const m = markup.toLowerCase();
    if (src.includes("cdn.shopify.com") || m.includes("shopify.shop") ||
        m.includes("cdn.shopify.com") || /name="generator"[^>]*shopify/.test(m)) return "shopify";
    if (m.includes("woocommerce")) return "woocommerce";
    if (src.includes("bigcommerce.com") || m.includes("cdn11.bigcommerce.com")) return "bigcommerce";
    if (m.includes("mage/cookies") || m.includes("magento")) return "magento";
    if (m.includes("prestashop")) return "prestashop";
    if (m.includes("wixstatic.com") || m.includes("wix.com")) return "wix";
    if (m.includes("squarespace.com")) return "squarespace";
    return null;
  }

  // `codeMarkup` is script sources, inline script bodies and link URLs, not the
  // visible text, so a blog post that mentions an app does not count as using it.
  function detectApps(codeMarkup) {
    const lower = codeMarkup.toLowerCase();
    return Object.keys(APP_SIGNATURES).filter(app =>
      APP_SIGNATURES[app].some(sig => lower.includes(sig)));
  }

  function detectTheme(markup) {
    let name = null;
    const block = markup.match(/Shopify\.theme\s*=\s*(\{[\s\S]{0,600}?\})\s*;/);
    if (block) {
      const n = block[1].match(/"name"\s*:\s*"([^"]+)"/);
      if (n) name = n[1];
    }
    const lowerName = (name || "").toLowerCase();
    let dsTheme = DS_THEMES.find(t => lowerName.includes(t)) || null;
    // Debutify is a distinctive enough word to trust anywhere in the markup.
    if (!dsTheme && /debutify/i.test(markup)) dsTheme = "debutify";
    return { name: name || (dsTheme ? dsTheme : null), dsTheme };
  }

  const PAYMENT_PATTERNS = {
    // Not followed by "mer/fler/alla…": Swedish "Visa mer" means "show more".
    visa:       /pi-visa|\bvisa\b(?!\s+(mer|fler|alla|detaljer|mindre|hela|produkt))/,
    mastercard: /mastercard|pi-master/,
    amex:       /american[\s_-]?express|\bamex\b/,
    paypal:     /paypal/,
    applepay:   /apple[\s_-]?pay/,
    googlepay:  /google[\s_-]?pay/,
    shoppay:    /shop[\s_-]?pay|shopify_pay/,
    klarna:     /klarna/,
    swish:      /\bswish\b/,
    vipps:      /\bvipps\b/,
    mobilepay:  /mobilepay/,
    invoice:    /\bfaktura\b|pay by invoice|\brechnung\b/,
    svea:       /\bsvea\b/,
    qliro:      /qliro/,
    walley:     /walley/,
    trustly:    /trustly/
  };

  // `paymentMarkup` is icon/alt/class markup plus scripts, not the visible text:
  // Swedish "Visa mer" ("show more") would otherwise read as a Visa card logo.
  function detectPaymentMethods(paymentMarkup) {
    const lower = paymentMarkup.toLowerCase();
    return Object.keys(PAYMENT_PATTERNS).filter(k => PAYMENT_PATTERNS[k].test(lower));
  }

  // Marketplace image file names that survive re-upload to the shop's own CDN:
  //   AliExpress: "S" or "H" + 32 hex characters        Sd1c2…f6.jpg
  //   Amazon:     11-character ID + "._AC_"-style suffix 61AbCdEfGhL._AC_SL1500.jpg
  const SUPPLIER_FILE_RES = [
    /^([SH][0-9a-f]{32})(?:[._-]|$)/i,
    /^([0-9A-Za-z+-]{9,12})\._(?:AC|SX|SY|SL|UL|UX|SS|SR)\w*/
  ];

  function countSupplierImageIds(urls) {
    const ids = new Set();
    for (const url of urls) {
      const file = String(url).split("?")[0].split("/").pop() || "";
      for (const re of SUPPLIER_FILE_RES) {
        const m = file.match(re);
        if (m) { ids.add(m[1]); break; }
      }
    }
    return ids.size;
  }

  // ---------- Domain ----------

  const MULTI_PART_SUFFIXES = new Set([
    "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.nz", "co.jp", "com.br",
    "com.cn", "com.tr", "co.za", "com.mx", "co.in", "com.sg", "com.hk"
  ]);

  function registrableDomain(host) {
    const parts = host.toLowerCase().replace(/\.$/, "").split(".");
    if (parts.length <= 2) return parts.join(".");
    const lastTwo = parts.slice(-2).join(".");
    return MULTI_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
  }

  const CHEAP_TLDS = ["shop", "store", "online", "site", "xyz", "top", "click", "buzz"];

  function tldInfo(host) {
    const tld = host.toLowerCase().split(".").pop();
    return { tld, cheap: CHEAP_TLDS.includes(tld) };
  }

  // ---------- Keywords from markets.js ----------

  const { LANGUAGES, MARKETS } = globalThis.DropCheckMarkets ||
    (() => { throw new Error("markets.js must load before detectors.js"); })();

  // Union of one keyword list across all languages, as regex alternation source.
  const words = key => [...new Set(Object.values(LANGUAGES).flatMap(l => l[key] || []))]
    .sort((a, b) => b.length - a.length).join("|");

  // Word boundaries that also understand å, ä, ö, æ, ø, ü (JS \b treats them as non-word).
  const LETTER = "a-z0-9åäöæøüß";
  const W0 = `(?<![${LETTER}])`, W1 = `(?![${LETTER}])`;

  // ---------- Content: urgency ----------

  const COUNTDOWN_WORD_RE = new RegExp(`${W0}(${words("sale")})${W1}`, "i");
  const STOCK_RE = new RegExp(`${W0}(${words("only")})\\s+\\d{1,2}\\s+(${words("left")})${W1}`, "i");
  const VIEWERS_RE = new RegExp(`${W0}\\d{1,3}\\s+(${words("people")})${W1}.{0,30}${W0}(${words("viewing")})${W1}`, "i");

  function detectCountdownText(text) {
    return /\b\d{1,2}:\d{2}:\d{2}\b/.test(text) && COUNTDOWN_WORD_RE.test(text);
  }

  function detectStockUrgency(text) {
    return STOCK_RE.test(text);
  }

  function detectViewerCount(text) {
    return VIEWERS_RE.test(text);
  }

  // ---------- Content: shipping ----------

  const SHIP_WORDS = new RegExp(`(${words("ship")})`, "i");
  const NOT_SHIP_WORDS = new RegExp(`(${words("notShip")})`, "i");
  const WEEK_UNIT_RE = new RegExp(`^(?:${words("weeks")})$`, "i");
  const UNIT = `(?:(?:${words("dayPrefix")})[\\s-]?)?(${words("days")}|${words("weeks")})${W1}`;
  const RANGE_RE = new RegExp(`\\b(\\d{1,2})\\s*(?:-|–|—|to|till|til|à|bis)\\s*(\\d{1,2})\\s*${UNIT}`, "gi");
  const SINGLE_RE = new RegExp(`\\b(\\d{1,2})\\s*${UNIT}`, "gi");

  function clauseAround(text, start, end) {
    const before = text.slice(Math.max(0, start - 160), start);
    const after = text.slice(end, end + 120);
    const cut = Math.max(before.lastIndexOf(". "), before.lastIndexOf("\n"),
                         before.lastIndexOf("! "), before.lastIndexOf("? "));
    const clauseBefore = cut >= 0 ? before.slice(cut + 1) : before;
    const prevLine = cut >= 0 ? before.slice(0, cut).split(/\n|\. /).pop() : "";
    const endCut = after.search(/\.\s|\n|!|\?/);
    const clauseAfter = endCut >= 0 ? after.slice(0, endCut) : after;
    return { clause: clauseBefore + text.slice(start, end) + clauseAfter, prevLine };
  }

  function toDays(n, unit) {
    return WEEK_UNIT_RE.test(unit) ? n * 7 : n;
  }

  // Returns every stated delivery window as {min, max} in days. Windows next to
  // return, warranty or processing wording are ignored.
  function extractShippingQuotes(text) {
    const quotes = [];
    let masked = text;
    const accept = (m, a, b, unit) => {
      const { clause, prevLine } = clauseAround(text, m.index, m.index + m[0].length);
      if (NOT_SHIP_WORDS.test(clause)) return;
      if (!SHIP_WORDS.test(clause) && !SHIP_WORDS.test(prevLine)) return;
      let min = toDays(a, unit), max = toDays(b, unit);
      if (min > max) [min, max] = [max, min];
      if (max === 0 || max > 120) return;
      quotes.push({ min, max });
    };
    for (const m of text.matchAll(RANGE_RE)) {
      accept(m, +m[1], +m[2], m[3]);
      masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
    }
    for (const m of masked.matchAll(SINGLE_RE)) accept(m, +m[1], +m[1], m[2]);
    return quotes;
  }

  // ---------- Content: identity ----------

  // Registration wording followed by a number, for markets without a profile.
  const COMPANY_ID_RE = /\b(org\.?\s*(nr|nummer|no)|organisationsnummer|organisasjonsnummer|vat\s*(no|number|nr|id|reg)?|momsreg|mva|company\s*(no|number|reg)|registered in|registration (no|number)|kvk|cvr|y-tunnus|ust-?id|handelsregister|hrb)\b[^\n]{0,25}\d{4}/i;

  // Org. numbers in every market format, keeping only those with a valid check digit.
  function findCompanyIds(text) {
    const orgNumbers = new Set();
    for (const market of Object.values(MARKETS)) {
      const { re, valid } = market.orgNumber;
      for (const m of text.matchAll(re)) {
        const n = (m[1] || m[2]).trim();
        if (valid(n)) orgNumbers.add(n);
      }
    }
    const list = [...orgNumbers].slice(0, 5);
    return { orgNumbers: list, hasCompanyId: list.length > 0 || COMPANY_ID_RE.test(text) };
  }

  const GENERIC_ADDRESS_RES = [
    /\b\d+\s+[A-Z][a-z]+\s+(Street|St\.|Road|Rd\.|Avenue|Ave\.?|Lane|Way|Boulevard|Blvd)\b/,
    /[a-zäöü]+(straße|strasse|weg|platz|gasse)\s+\d+/i
  ];
  const ADDRESS_RES = [...Object.values(MARKETS).flatMap(m => m.addressRes), ...GENERIC_ADDRESS_RES];

  function detectAddress(text) {
    return ADDRESS_RES.some(re => re.test(text));
  }

  // Which market the store presents itself to. The domain is the strongest claim,
  // then page language, then Shopify's market setting, then a currency code.
  function detectMarket({ host = "", lang = "", shopifyCountry = "", text = "" }) {
    const entries = Object.entries(MARKETS);
    const pick = (test, reason) => {
      const hit = entries.find(([, m]) => test(m));
      return hit ? { id: hit[0], name: hit[1].name, reason } : null;
    };
    const tld = host.toLowerCase().split(".").pop();
    const code = lang.toLowerCase().split("-")[0];
    return pick(m => m.tlds.includes(tld), `.${tld} domain`) ||
      (code && pick(m => m.langs.includes(code), `page language "${lang}"`)) ||
      (shopifyCountry && pick(m => m.country === shopifyCountry.toUpperCase(), `Shopify market ${shopifyCountry}`)) ||
      pick(m => m.currencies.some(c => new RegExp(`\\b${c}\\b`).test(text)), "currency code") ||
      null;
  }

  const FREEMAIL = new Set([
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.se", "outlook.com", "outlook.se",
    "live.com", "live.se", "yahoo.com", "yahoo.se", "icloud.com", "me.com", "aol.com",
    "hotmail.no", "outlook.no", "live.no", "yahoo.no", "online.no",
    "protonmail.com", "proton.me", "gmx.com", "gmx.de", "mail.com", "yandex.com", "qq.com", "163.com"
  ]);
  const IGNORED_EMAIL_DOMAINS = /(sentry|wixpress|shopify|example|domain\.com|email\.com|yourdomain|klaviyo|sentry-next)/i;

  function extractEmails(text) {
    const found = new Set();
    for (const m of text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9-]+\.)+[A-Z]{2,}/gi)) {
      const email = m[0].toLowerCase();
      if (/\.(png|jpg|jpeg|gif|webp|svg)$/.test(email)) continue;   // "logo@2x.png"
      const domain = email.split("@")[1];
      if (IGNORED_EMAIL_DOMAINS.test(domain)) continue;
      found.add(email);
    }
    return [...found].slice(0, 10);
  }

  function isFreemail(domain) {
    return FREEMAIL.has(domain.toLowerCase());
  }

  const BOILERPLATE = [
    [/\[(?:company|store|shop|business)\s*name\]/i, 'placeholder "[Company Name]"'],
    [/\[your\s+(?:company|store|shop|business|email|address|website)[^\]]{0,30}\]/i, 'placeholder "[Your …]"'],
    [/\[(?:insert|enter)\s[^\]]{2,40}\]/i, 'placeholder "[Insert …]"'],
    [/\{\{\s*shop\.[a-z_]+\s*\}\}/i, "unrendered template variable"],
    [/\+\d{1,3}[\s-]?\(?\d?\)?[\s-]?123[\s-]?456[\s-]?7/, "placeholder phone number (123 456 7…)"],
    [/@(?:example|yourdomain|yourstore)\.com/i, "placeholder email address"]
  ];

  function detectBoilerplate(text) {
    return BOILERPLATE.filter(([re]) => re.test(text)).map(([, label]) => label);
  }

  // ---------- Pricing ----------

  const NUM = "\\d{1,3}(?:[\\s\\u00a0\\u202f.,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
  const PRICE_RE = new RegExp(
    `(?:(?<![a-z])(?:kr|sek|nok|dkk|usd|eur|gbp)\\.?\\s?|[$€£]\\s?)(${NUM})|(${NUM})\\s?(?:kr\\b|sek\\b|nok\\b|dkk\\b|usd\\b|eur\\b|gbp\\b|:-|,-|[$€£])`,
    "gi");

  function toNumber(raw) {
    const s = raw.replace(/[\s  ]/g, "");
    const m = s.match(/^(.*?)[.,](\d{1,2})$/);
    const intPart = (m ? m[1] : s).replace(/[.,]/g, "");
    return parseFloat(intPart + (m ? "." + m[2] : ""));
  }

  function parsePrices(text) {
    const out = [];
    for (const m of text.matchAll(PRICE_RE)) {
      const n = toNumber(m[1] || m[2]);
      if (Number.isFinite(n) && n > 0) out.push(n);
    }
    return out;
  }

  // Fraction off for one product, 0 when not discounted.
  function discountOff(price, compareAt) {
    const p = Number(price), c = Number(compareAt);
    if (!(p > 0) || !(c > p)) return 0;
    return Math.round((1 - p / c) * 100) / 100;
  }

  globalThis.DropCheckDetectors = {
    APP_SIGNATURES, DS_THEMES,
    detectPlatform, detectApps, detectTheme, detectPaymentMethods, countSupplierImageIds,
    registrableDomain, tldInfo,
    detectCountdownText, detectStockUrgency, detectViewerCount,
    extractShippingQuotes,
    findCompanyIds, detectAddress, detectMarket, extractEmails, isFreemail, detectBoilerplate,
    parsePrices, toNumber, discountOff
  };
})();
