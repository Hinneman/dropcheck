// English texts. The scorer returns rule ids, note keys and their parameters; these
// functions turn them into sentences. sv.js and nb.js have the same keys and take the
// same parameters; test/i18n.test.js checks that.
import { pct, phoneList, returnFindings } from "./util.js";

const list = items => items.join(", ");
const ago = days => days === 1 ? "1 day ago"
  : days < 60 ? `${days} days ago` : `about ${Math.round(days / 30)} months ago`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const URGENCY_WIDGETS = {
  countdown: "countdown timer",
  stock: '"only N left" stock counter',
  viewers: '"N people viewing" counter'
};

const RETURNS = {
  place: v => `return address in ${v}`,
  warehouse: v => `returns go to an "${v}"`,
  notReturnAddress: () => 'the company address is "not a return address"'
};

const MARKET_REASONS = {
  tld: v => `.${v} domain`,
  lang: v => `page language "${v}"`,
  shopify: v => `Shopify market ${v}`,
  currency: () => "currency code"
};

export default {
  bands: {
    likely: "Likely dropshipper",
    mixed: "Mixed signals",
    none: "No dropshipping signals found",
    not_store: "No shop detected"
  },

  markets: {
    se: { name: "Swedish", localPayments: "Klarna, Swish or invoice" },
    no: { name: "Norwegian", localPayments: "Vipps, Klarna or invoice" }
  },

  rules: {
    dropship_app: p => `The page loads code from a dropshipping fulfilment app (${list(p.apps)}).`,
    supplier_images: p => {
      const parts = [];
      if (p.images) parts.push(p.images === 1 ? "1 product image keeps an AliExpress, Alibaba or Amazon file name"
        : `${p.images} product images keep AliExpress, Alibaba or Amazon file names`);
      if (p.tags) parts.push(p.tags === 1 ? "1 product carries an Amazon product ID tag"
        : `${p.tags} products carry an Amazon product ID tag`);
      return `Products copied from a marketplace: ${parts.join("; ")}.`;
    },
    ai_images: p => `${p.count} product images keep the default file name of an AI image generator ` +
      "(ChatGPT, Gemini, DALL-E or Higgsfield).",
    returns_abroad: p => "Returns are sent outside the EU or to an unnamed warehouse: " +
      `${returnFindings(p.found, RETURNS).join("; ")}.`,
    import_charges: p => `Buyers are told to pay import VAT or customs, so goods come from outside the EU: "${p.quote}"`,
    domain_young: p => `The domain was registered ${ago(p.days)}.`,
    catalog_young: p => `The oldest product in the catalog was added ${ago(p.days)}` +
      (p.checkedFirst ? ` (of the first ${p.checkedFirst} checked)` : "") + ".",
    no_org_number: () => "No company registration or VAT number found on the page or its terms, " +
      "shipping and contact pages.",
    long_shipping: p => `Stated delivery time is ${p.min === p.max ? p.max : `${p.min}-${p.max}`} days.`,
    fake_urgency: p => `Pressure widgets on the page: ${list(p.widgets.map(w => URGENCY_WIDGETS[w]))}.`,
    blanket_discount: p => `${p.deep} of ${p.sampled} ` +
      (p.source === "catalog" ? "products in the catalog" : "products on this page") +
      ` are marked down ${pct(p.deepOff)} or more from a struck-through "regular" price.`,
    boilerplate: p => `Unfilled template text: ${list(p.phrases)}.`,
    foreign_phone: p => `Every phone number listed has a foreign country code: ${phoneList(p.phones, "en", "or")}.`,
    other_domain_email: p => `The pages give an email address at another brand's domain (${list(p.domains)}).`,
    generic_email: p => `Contact email is a free mailbox (${list(p.domains)}), not an address at the shop's own domain.`,
    ds_theme: p => `Uses the ${p.theme} theme, which is marketed almost only to dropshippers.`
  },

  // The second argument is this file's markets table.
  notes: {
    platform: p => `Platform: ${p.platform}. Platform alone is not evidence and scores nothing.`,
    contextApps: p => `Also loads: ${list(p.apps)}.`,
    theme: p => `Theme: ${p.theme}.`,
    domainRegistered: p => `Domain ${p.domain} registered ${p.date}.`,
    domainAgeNotChecked: p => `Domain age is not checked for .${p.tld} domains: the registry ` +
      "publishes no date that shows how long the shop has used the domain. This is neither a good nor a bad sign.",
    domainAgeUnknown: p => `Domain age for ${p.domain} is unknown (registry lookup unavailable).`,
    cheapTld: p => `Uses the .${p.tld} top-level domain.`,
    market: (p, m) => `Market: ${m[p.market].name} (from the ${MARKET_REASONS[p.reason.by](p.reason.value)}).`,
    paymentLogos: p => `Payment logos: ${list(p.methods)}.`,
    noLocalPayment: (p, m) => `Presents itself as ${m[p.market].name} but shows no ${m[p.market].localPayments} option.`,
    orgNumbers: p => `Org. no. shown: ${list(p.numbers)}.`,
    noAddress: () => "No postal address found.",
    noDeliveryTime: () => "No delivery time stated on the pages read.",
    catalog: p => `Catalog: ${plural(p.products, "product", "products")} in ` +
      `${plural(p.types, "product type", "product types")}` + (p.sample.length ? ` (${list(p.sample)})` : "") + "."
  },

  ui: {
    scanning: "Scanning...",
    signalsFound: "Signals found",
    alsoObserved: "Also observed",
    notScored: "(not scored)",
    findSource: "Find the source",
    findSourceHelp: "Opens Google Lens with the product image, so you can check whether the same photo " +
      "is sold on AliExpress or Temu. Sends only the image URL, and only when you click.",
    showImages: "Show product images",
    settings: "Settings",
    autoScan: "Check shops automatically as I browse",
    autoScanHelp: "Shows a warning badge without opening DropCheck. Needs permission to read every " +
      "https:// page you visit; the reading stays in your browser. Off: pages are read only when you " +
      "open DropCheck.",
    language: "Language",
    back: "Back",
    hint: "DropCheck can also check shops automatically as you browse.",
    hintOpen: "Show settings",
    hintDismiss: "Hide this tip",
    welcomeTitle: "DropCheck is installed",
    welcomeUse: "Click the DropCheck icon on a shop's page to check it. To keep it one click away, pin " +
      "it with the puzzle-piece icon in the toolbar.",
    welcomeAutoScan: "You can also let DropCheck check every shop as you browse:",
    welcomeLater: "You can change this later under Settings in DropCheck.",
    and: "and",
    footer: tlds => "Observations about this page, not a judgment of the company. Analysis runs in your " +
      "browser; only the domain name is sent to rdap.org, which forwards the lookup to the domain's " +
      `registry, to find its registration date. ${tlds} domains are not looked up: their registries ` +
      "publish no date that shows how long the shop has used the domain.",
    result: band => `Result: ${band}.`,
    score: (score, max) => `Score ${score} of ${max}.`,
    bandNotes: {
      likely: "Several independent signals point to third-party fulfilment: expect a markup over the " +
        "supplier price and longer delivery than a local shop.",
      mixed: "Some signals are present, but they do not settle it.",
      none: "Nothing detected. That is not a guarantee of anything.",
      not_store: "This page does not look like an online store, so nothing was scored."
    },
    caveat: "Why this might be wrong: small shops that print on demand, make to order or import their " +
      "own designs can show the same signals as a dropshipper.",
    categories: { supply: "Supply", identity: "Identity", pressure: "Sales pressure", pricing: "Pricing" },
    capped: (raw, counted) => `${raw}, capped to ${counted}`,
    lensTitle: "Search this image with Google Lens",
    lensLabel: (i, n) => `Search product image ${i} of ${n} with Google Lens`,
    httpsOnly: "DropCheck only reads https:// pages.",
    timeout: "The scan did not finish. Reload the page and try again.",
    cannotRead: "DropCheck cannot read this page.",
    error: message => `Something went wrong: ${message}`
  }
};
