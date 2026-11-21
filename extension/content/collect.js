// Runs on the page and extracts a flat, compact signal object. It never sends page
// content anywhere: only the derived values below go to the service worker.
//
// On stores it also reads a few same-origin pages (terms, shipping, contact) and,
// on Shopify, /products.json. Those site-level facts are cached per host for 24 h
// in chrome.storage.local so browsing a store does not refetch them on every page.
(() => {
  const D = globalThis.DropCheckDetectors;
  const SITE_FACTS_VERSION = 2;   // bump when site-level detectors change
  const SITE_TTL_MS = 24 * 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 6000;

  const send = payload =>
    chrome.runtime.sendMessage({ type: "PAGE_SIGNALS", payload }).catch(() => {});

  // A second injection (popup asking before the first run finished) reuses the run.
  if (window.__dropcheck) {
    window.__dropcheck.then(send);
    return;
  }
  window.__dropcheck = collect().catch(err => ({ v: 1, isStore: false, error: String(err) }));
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
    for (const l of document.querySelectorAll("link[href]")) parts.push(l.href);
    for (const f of document.querySelectorAll("iframe[src]")) parts.push(f.src);
    for (const m of document.querySelectorAll("meta[name=generator]")) parts.push(`name="generator" ${m.content}`);
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

  function mailtoText() {
    return [...document.querySelectorAll('a[href^="mailto:"]')]
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

  function looksLikeStore(platform, ld) {
    if (["shopify", "woocommerce", "bigcommerce", "magento", "prestashop"].includes(platform)) return true;
    const types = ld.flatMap(o => [].concat(o["@type"] || []));
    if (types.some(t => /^(Product|Offer|AggregateOffer)$/.test(t))) return true;
    if (document.querySelector('meta[property="og:type"][content*="product" i]')) return true;
    return !!document.querySelector(
      'a[href$="/cart"], a[href*="/cart?"], a[href*="varukorg"], a[href*="kassa"], form[action*="/cart"]');
  }

  function absolute(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === "https:" ? u.href : null;
    } catch { return null; }
  }

  function topProductImageUrls(n, ld) {
    const urls = [];
    const og = document.querySelector('meta[property="og:image"]');
    if (og) urls.push(og.content);
    for (const o of ld) {
      if ([].concat(o["@type"] || []).includes("Product")) {
        for (const img of [].concat(o.image || [])) urls.push(typeof img === "string" ? img : img?.url);
      }
    }
    const imgs = [...document.querySelectorAll("main img, img")]
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
    const links = document.querySelectorAll('a[href*="/products/"], a[href*="/product/"], a[href*="/produkt/"]');
    const cards = new Set();
    for (const a of links) {
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
  const SHOPIFY_PATHS = ["/policies/terms-of-service", "/policies/shipping-policy",
                         "/policies/refund-policy", "/pages/contact"];

  function policyPaths(platform) {
    const paths = [];
    for (const a of document.querySelectorAll("a[href]")) {
      let u;
      try { u = new URL(a.href); } catch { continue; }
      if (u.origin !== location.origin || u.pathname === location.pathname) continue;
      if (POLICY_LINK.test(u.pathname) && !UNSAFE_PATH.test(u.pathname)) paths.push(u.pathname);
    }
    if (platform === "shopify") paths.unshift(...SHOPIFY_PATHS);
    return [...new Set(paths)].slice(0, 7);
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
      const mailtos = [...doc.querySelectorAll('a[href^="mailto:"]')]
        .map(a => a.getAttribute("href").slice(7).split("?")[0]).join("\n");
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
      const images = products.slice(0, 60).flatMap(p => (p.images || []).slice(0, 2).map(i => i.src));
      return {
        productCount: products.length,
        offs,
        productTypes: types.size,
        typeSample: top(types).slice(0, 8),
        vendors: top(vendors).slice(0, 3),
        supplierImageIds: D.countSupplierImageIds(images)
      };
    } catch {
      return null;
    }
  }

  async function siteFacts(platform) {
    const key = "site:" + location.hostname;
    try {
      const cached = (await chrome.storage.local.get(key))[key];
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
    const text = pageText();
    const platform = D.detectPlatform(scripts, code);
    const ld = jsonLdObjects();
    const isStore = looksLikeStore(platform, ld);

    if (!isStore) return { v: 1, isStore: false };

    const base = {
      v: 1,
      url: location.href,
      host: location.hostname,
      isStore,
      platform
    };

    const site = await siteFacts(platform);
    const pageCompany = D.findCompanyIds(text);
    const emails = [...new Set([...D.extractEmails(text + "\n" + mailtoText()), ...site.emails])];
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
      identity: {
        hasCompanyId: pageCompany.hasCompanyId || site.companyIds.hasCompanyId,
        orgNumbers: [...new Set([...pageCompany.orgNumbers, ...site.companyIds.orgNumbers])],
        hasAddress: D.detectAddress(text) || site.hasAddress,
        emails,
        boilerplate: [...new Set([...D.detectBoilerplate(text), ...site.boilerplate])]
      },
      paymentMethods: D.detectPaymentMethods(paymentMarkup() + "\n" + code),
      productImages: topProductImageUrls(3, ld),
      supplierImageIds: Math.max(D.countSupplierImageIds(allImageUrls()), catalog ? catalog.supplierImageIds : 0),
      catalog: catalog && {
        productCount: catalog.productCount,
        productTypes: catalog.productTypes,
        typeSample: catalog.typeSample,
        vendors: catalog.vendors
      },
      pagesScanned: site.pagesScanned
    };
  }
})();
