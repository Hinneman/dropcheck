// Runs on the page and extracts a flat, compact signal object. It never sends page
// content anywhere: only the derived values below go to the service worker.
//
// On stores it also reads a few same-origin pages (terms, shipping, contact) and,
// on Shopify, /products.json. Those site-level facts are cached per host for 24 h
// in chrome.storage.local so browsing a store does not refetch them on every page.
(() => {
  const D = globalThis.DropCheckDetectors;
  const { DAY_MS, SITE_TTL_MS } = globalThis.DropCheckConfig;
  const SITE_FACTS_VERSION = 4;   // bump when site-level detectors or page choice change
  const FETCH_TIMEOUT_MS = 6000;
  const STORE_WAIT_MS = 8000;     // how long a late-rendering page gets to look like a store
  const STORE_POLL_MS = 1000;
  // Cart words in the supported markets' languages. "cart" itself is matched only as a
  // whole path segment or button label, so it does not hit words that merely contain it.
  // Declared up here: collect() starts below, before later declarations are initialized.
  const CART_WORDS = ["varukorg", "kundvagn", "kassa", "handlekurv", "handlevogn", "warenkorb", "basket"];
  // Path segments of product pages, matched as "/<segment>/".
  const PRODUCT_SEGMENTS = ["products", "product", "produkt"];
  const PRODUCT_PATH = new RegExp(`/(${PRODUCT_SEGMENTS.join("|")})/[^/?#]`, "i");
  const PRODUCT_LINKS = PRODUCT_SEGMENTS.map(s => `a[href*="/${s}/"]`).join(", ");
  const MIN_PRODUCT_LINKS = 3;
  const MIN_BUY_CONTROLS = 2;     // "Köp" buttons or add-to-cart links

  const send = payload =>
    chrome.runtime.sendMessage({ type: "PAGE_SIGNALS", payload }).catch(() => {});

  const run = () => collect().catch(err => ({ v: 1, isStore: false, error: String(err) }));

  // A second injection (popup asking before the first run finished) reuses the run,
  // unless that run found no store: a page that renders late may have become one.
  if (window.__dropcheck) {
    window.__dropcheck = window.__dropcheck.then(r => (r.isStore ? r : run()));
    window.__dropcheck.then(send);
    return;
  }
  window.__dropcheck = run();
  window.__dropcheck.then(send);

  // ---------- Page reading ----------

  function pageText() {
    const t = document.body ? document.body.innerText : "";
    // The footer (address, org. no.) sits at the end, so keep head and tail.
    return t.length > 60000 ? t.slice(0, 40000) + "\n" + t.slice(-20000) : t;
  }

  // Script sources, inline script bodies, stylesheet and iframe URLs.
  function codeMarkup() {
    const parts = [];
    let budget = 600000;
    for (const s of document.scripts) {
      const chunk = (s.src || "") + "\n" + (s.src ? "" : s.textContent.slice(0, 30000));
      parts.push(chunk);
      budget -= chunk.length;
      if (budget < 0) break;
    }
    for (const l of /** @type {NodeListOf<HTMLLinkElement>} */ (document.querySelectorAll("link[href]"))) {
      parts.push(l.href);
    }
    for (const f of /** @type {NodeListOf<HTMLIFrameElement>} */ (document.querySelectorAll("iframe[src]"))) {
      parts.push(f.src);
    }
    for (const m of /** @type {NodeListOf<HTMLMetaElement>} */ (document.querySelectorAll("meta[name=generator]"))) {
      parts.push(`name="generator" ${m.content}`);
    }
    return parts.join("\n");
  }

  // Payment icons live in img alt/src, svg titles/ids and payment-related classes.
  function paymentMarkup() {
    const parts = [];
    for (const img of document.querySelectorAll("img")) parts.push(img.alt || "", img.currentSrc || img.src || "");
    for (const svg of document.querySelectorAll("svg[aria-labelledby], svg title, svg[class]")) {
      parts.push(svg.getAttribute("aria-labelledby") || "", svg.getAttribute("class") || "", svg.textContent || "");
    }
    for (const el of document.querySelectorAll('[class*="payment" i], [class*="betal" i]')) {
      parts.push(el.outerHTML.slice(0, 5000));
    }
    return parts.join("\n");
  }

  // Addresses of mailto: links in a document, one per line.
  function mailtoText(root) {
    return [...root.querySelectorAll('a[href^="mailto:"]')]
      .map(a => a.getAttribute("href").slice(7).split("?")[0]).join("\n");
  }

  function isVisible(el) {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  }

  function hasCountdownElement() {
    const els = document.querySelectorAll(
      '[class*="countdown" i], [id*="countdown" i], [class*="count-down" i], [data-countdown]');
    return [...els].some(isVisible);
  }

  function jsonLdObjects() {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const stack = Array.isArray(data) ? [...data] : [data];
        while (stack.length) {
          const o = stack.pop();
          if (!o || typeof o !== "object") continue;
          out.push(o);
          if (Array.isArray(o["@graph"])) stack.push(...o["@graph"]);
        }
      } catch { /* malformed JSON-LD is common */ }
    }
    return out;
  }

  function hasCart() {
    const links = ['a[href$="/cart"]', 'a[href*="/cart?"]', 'form[action*="/cart"]',
                   ...CART_WORDS.map(w => `a[href*="${w}" i]`)];
    // Single-page stores often open the cart in a drawer from a button with no href.
    const buttons = ["cart", ...CART_WORDS].map(w => `button[aria-label*="${w}" i]`);
    if (document.querySelector([...links, ...buttons].join(", "))) return true;
    // Some only say so in their text: a "Cart (0)" button on a shop's own platform.
    return [...document.querySelectorAll("button, a, [role=button]")].some(el =>
      el.textContent.length <= 40 && D.isCartLabel(el.textContent, el.tagName !== "A"));
  }

  // Shops on their own platform without a cart link: several "Köp" or "Add to cart"
  // controls, or links that add an item ("/checkout/?action=additem&id=12"). One is not
  // enough: a news site may have a single "Buy" button for a subscription.
  function hasBuyControls() {
    let n = 0;
    for (const el of document.querySelectorAll("button, a, [role=button], input[type=submit]")) {
      const label = el instanceof HTMLInputElement ? el.value : el.textContent;
      if (D.isAddToCartHref(el.getAttribute("href")) || (label.length <= 40 && D.isBuyLabel(label))) n++;
      if (n >= MIN_BUY_CONTROLS) return true;
    }
    return false;
  }

  const linksWithHref = () =>
    /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll("a[href]"));

  // Catalog pages link to several of the store's own product pages.
  function hasProductLinks() {
    const paths = new Set();
    for (const a of linksWithHref()) {
      let u;
      try { u = new URL(a.href); } catch { continue; }
      if (u.origin === location.origin && PRODUCT_PATH.test(u.pathname)) paths.add(u.pathname);
      if (paths.size >= MIN_PRODUCT_LINKS) return true;
    }
    return false;
  }

  function looksLikeStore(platform, ld) {
    if (["shopify", "woocommerce", "bigcommerce", "magento", "prestashop"].includes(platform)) return true;
    const types = ld.flatMap(o => [].concat(o["@type"] || []));
    if (types.some(t => /^(Product|Offer|AggregateOffer)$/.test(t))) return true;
    if (document.querySelector('meta[property="og:type"][content*="product" i]')) return true;
    return hasCart() || hasProductLinks() || hasBuyControls();
  }

  function absolute(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === "https:" ? u.href : null;
    } catch { return null; }
  }

  function topProductImageUrls(n, ld) {
    const urls = [];
    const og = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[property="og:image"]'));
    if (og) urls.push(og.content);
    for (const o of ld) {
      if ([].concat(o["@type"] || []).includes("Product")) {
        for (const img of [].concat(o.image || [])) urls.push(typeof img === "string" ? img : img?.url);
      }
    }
    const imgs = [...document.querySelectorAll("img")]
      .filter(img => img.naturalWidth >= 300 && !/logo|icon|badge|payment/i.test(img.src + img.alt))
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
    for (const img of imgs.slice(0, 6)) urls.push(img.currentSrc || img.src);
    const seen = new Set();
    return urls.map(u => u && absolute(u)).filter(u => u && !seen.has(u) && seen.add(u)).slice(0, n);
  }

  function allImageUrls() {
    const urls = [];
    for (const img of document.querySelectorAll("img")) {
      urls.push(img.currentSrc || img.src || "", img.dataset.src || "");
      for (const part of (img.srcset || "").split(",")) urls.push(part.trim().split(" ")[0]);
    }
    return urls.filter(Boolean);
  }

  // Product cards found via product links: share of cards shown with a deep discount.
  function domDiscount() {
    const links = /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll(PRODUCT_LINKS));
    const cards = new Set();
    for (const a of links) {
      /** @type {HTMLElement | null} */
      let el = a;
      for (let i = 0; i < 6 && el && el !== document.body; i++, el = el.parentElement) {
        if (D.parsePrices(el.innerText || "").length) { cards.add(el); break; }
      }
      if (cards.size >= 60) break;
    }
    const offs = [];
    for (const card of cards) {
      const prices = D.parsePrices(card.innerText || "");
      if (!prices.length) continue;
      const struck = card.querySelector('s, del, strike, [class*="compare" i], [class*="was-price" i]');
      const old = struck ? D.parsePrices(struck.innerText || "")[0] : null;
      const sale = old ? Math.min(...prices.filter(p => p < old)) : NaN;
      offs.push(old && Number.isFinite(sale) ? D.discountOff(sale, old) : 0);
    }
    return { source: "page", sampled: offs.length, offs };
  }

  // ---------- Site-level facts (same-origin fetches) ----------

  // Path only, not link text: a "Log out and return" link must never be fetched.
  const POLICY_LINK = /(terms|villkor|shipping|frakt|leverans|delivery|contact|kontakt|about|om-oss|imprint|impressum|retur|return|refund|faq)/i;
  const UNSAFE_PATH = /(account|konto|login|logout|log-out|signin|sign-in|signout|sign-out|cart|varukorg|checkout|kassa|order|cancel|delete|remove|unsubscribe|wishlist)/i;
  // Shopify's contact-information and legal-notice policies are where merchants are
  // asked for their registration and VAT numbers.
  const SHOPIFY_PATHS = ["/policies/terms-of-service", "/policies/shipping-policy",
                         "/policies/refund-policy", "/pages/contact",
                         "/policies/contact-information", "/policies/legal-notice"];
  const MAX_POLICY_PAGES = 9;
  // "/sv-se/pages/contact" is the same page as "/pages/contact" in another language.
  const LOCALE_PREFIX = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i;

  function policyPaths(platform) {
    const paths = platform === "shopify" ? [...SHOPIFY_PATHS] : [];
    for (const a of linksWithHref()) {
      let u;
      try { u = new URL(a.href); } catch { continue; }
      if (u.origin !== location.origin || u.pathname === location.pathname) continue;
      if (POLICY_LINK.test(u.pathname) && !UNSAFE_PATH.test(u.pathname)) paths.push(u.pathname);
    }
    const seen = new Set();
    return paths.filter(p => {
      const key = p.replace(LOCALE_PREFIX, "").toLowerCase();
      return !seen.has(key) && seen.add(key);
    }).slice(0, MAX_POLICY_PAGES);
  }

  async function fetchWithTimeout(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      // No cookies: a logged-in fetch could read the user's data or trigger a state-changing GET.
      return await fetch(url, { signal: ctrl.signal, credentials: "omit" });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchText(path) {
    try {
      const res = await fetchWithTimeout(path);
      if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) return null;
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      doc.querySelectorAll("script, style, noscript, svg").forEach(el => el.remove());
      doc.querySelectorAll("br, p, div, li, h1, h2, h3, h4, h5, h6, tr, section, footer")
        .forEach(el => el.after("\n"));
      const mailtos = mailtoText(doc);
      const text = (doc.body ? doc.body.textContent : "")
        .replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n+/g, "\n");
      return (text.slice(0, 40000) + "\n" + mailtos);
    } catch {
      return null;
    }
  }

  async function shopifyCatalog() {
    try {
      const res = await fetchWithTimeout("/products.json?limit=250");
      if (!res.ok) return null;
      const { products } = await res.json();
      if (!Array.isArray(products)) return null;
      const offs = products.map(p =>
        Math.max(0, ...(p.variants || []).map(v => D.discountOff(v.price, v.compare_at_price))));
      const types = new Map(), vendors = new Map();
      for (const p of products) {
        if (p.product_type) types.set(p.product_type, (types.get(p.product_type) || 0) + 1);
        if (p.vendor) vendors.set(p.vendor, (vendors.get(p.vendor) || 0) + 1);
      }
      const top = m => [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      // Every image: marketplace file names often sit deep in the catalog or on a
      // product's later images, and the URLs are already in this response.
      const images = products.flatMap(p => (p.images || []).map(i => i.src));
      const created = products.map(p => String(p.created_at || "").slice(0, 10)).filter(Boolean).sort();
      const tags = products.flatMap(p =>
        Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(","));
      return {
        productCount: products.length,
        oldestProduct: created[0] || null,
        offs,
        productTypes: types.size,
        typeSample: top(types).slice(0, 8),
        vendors: top(vendors).slice(0, 3),
        supplierImageIds: D.countSupplierImageIds(images),
        aiImages: D.countAiImages(images),
        supplierTagIds: D.countSupplierTags(tags),
        importSourceTags: D.countImportSourceTags(tags)
      };
    } catch {
      return null;
    }
  }

  async function siteFacts(platform) {
    const key = "site:" + location.hostname;
    try {
      /** @type {Record<string, any>} */
      const stored = await chrome.storage.local.get(key);
      const cached = stored[key];
      if (cached && cached.v === SITE_FACTS_VERSION && Date.now() - cached.at < SITE_TTL_MS) return cached;
    } catch { /* storage unavailable: just fetch */ }

    const paths = policyPaths(platform);
    const [texts, catalog] = await Promise.all([
      Promise.all(paths.map(fetchText)),
      platform === "shopify" ? shopifyCatalog() : Promise.resolve(null)
    ]);
    const text = texts.filter(Boolean).join("\n\n");
    const facts = {
      v: SITE_FACTS_VERSION,
      at: Date.now(),
      pagesScanned: paths.filter((_, i) => texts[i]),
      shippingQuotes: D.extractShippingQuotes(text),
      companyIds: D.findCompanyIds(text),
      hasAddress: D.detectAddress(text),
      phoneCodes: D.extractPhoneCodes(text),
      returnsAbroad: D.detectReturnsAbroad(text),
      importCharge: D.detectImportCharges(text),
      emails: D.extractEmails(text),
      boilerplate: D.detectBoilerplate(text),
      catalog
    };
    chrome.storage.local.set({ [key]: facts }).catch(() => {});
    return facts;
  }

  // ---------- Assemble ----------

  async function collect() {
    const code = codeMarkup();
    const scripts = [...document.scripts].map(s => s.src).filter(Boolean);
    const platform = D.detectPlatform(scripts, code);
    let ld = jsonLdObjects();
    let isStore = looksLikeStore(platform, ld);
    // Single-page stores render their header and product grid after document_idle.
    for (let waited = 0; !isStore && waited < STORE_WAIT_MS; waited += STORE_POLL_MS) {
      await new Promise(resolve => setTimeout(resolve, STORE_POLL_MS));
      ld = jsonLdObjects();
      isStore = looksLikeStore(platform, ld);
    }

    if (!isStore) return { v: 1, isStore: false };
    const text = pageText();

    const base = {
      v: 1,
      url: location.href,
      host: location.hostname,
      isStore,
      platform
    };

    const site = await siteFacts(platform);
    const pageCompany = D.findCompanyIds(text);
    const emails = [...new Set([...D.extractEmails(text + "\n" + mailtoText(document)), ...site.emails])];
    const shippingQuotes = [...D.extractShippingQuotes(text), ...site.shippingQuotes];
    const pageDiscount = domDiscount();
    const catalog = site.catalog;
    const discount = catalog && catalog.offs.length >= pageDiscount.sampled
      ? { source: "catalog", sampled: catalog.offs.length, offs: catalog.offs }
      : pageDiscount;
    const shopifyCountry = (code.match(/Shopify\.country\s*=\s*"([A-Z]{2})"/) || [])[1] || "";
    const market = D.detectMarket({
      host: location.hostname, lang: document.documentElement.lang || "", shopifyCountry, text
    });

    return {
      ...base,
      apps: D.detectApps(code),
      theme: D.detectTheme(code),
      tld: D.tldInfo(location.hostname),
      market,
      urgency: {
        countdown: D.detectCountdownText(text) || hasCountdownElement(),
        stock: D.detectStockUrgency(text),
        viewers: D.detectViewerCount(text)
      },
      discount,
      shipping: {
        quotes: shippingQuotes.slice(0, 20),
        fastestMax: shippingQuotes.length ? Math.min(...shippingQuotes.map(q => q.max)) : null
      },
      returnsAbroad: [...new Set([...D.detectReturnsAbroad(text), ...site.returnsAbroad])],
      importCharge: D.detectImportCharges(text) || site.importCharge,
      identity: {
        hasCompanyId: pageCompany.hasCompanyId || site.companyIds.hasCompanyId,
        orgNumbers: [...new Set([...pageCompany.orgNumbers, ...site.companyIds.orgNumbers])],
        hasAddress: D.detectAddress(text) || site.hasAddress,
        phoneCodes: [...new Set([...D.extractPhoneCodes(text), ...site.phoneCodes])],
        emails,
        boilerplate: [...new Set([...D.detectBoilerplate(text), ...site.boilerplate])]
      },
      paymentMethods: D.detectPaymentMethods(paymentMarkup() + "\n" + code),
      productImages: topProductImageUrls(3, ld),
      supplierImageIds: Math.max(D.countSupplierImageIds(allImageUrls()), catalog ? catalog.supplierImageIds : 0),
      supplierTagIds: catalog ? catalog.supplierTagIds || 0 : 0,
      aiImages: Math.max(D.countAiImages(allImageUrls()), catalog ? catalog.aiImages || 0 : 0),
      catalog: catalog && {
        productCount: catalog.productCount,
        oldestProduct: catalog.oldestProduct,
        // From the first 250 products only: a larger catalog may be older.
        oldestProductDays: catalog.oldestProduct
          ? Math.floor((Date.now() - Date.parse(catalog.oldestProduct)) / DAY_MS) : null,
        importSourceTags: catalog.importSourceTags || 0,
        productTypes: catalog.productTypes,
        typeSample: catalog.typeSample,
        vendors: catalog.vendors
      },
      pagesScanned: site.pagesScanned
    };
  }
})();
