// Swedish texts. Same keys and parameters as en.js.
import { pct, phoneList, returnFindings } from "./util.js";

const list = items => items.join(", ");
const ago = days => days === 1 ? "för 1 dag sedan"
  : days < 60 ? `för ${days} dagar sedan` : `för ungefär ${Math.round(days / 30)} månader sedan`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const URGENCY_WIDGETS = {
  countdown: "nedräkningsklocka",
  stock: 'lagerräknare med "bara N kvar"',
  viewers: 'räknare med "N personer tittar"'
};

const RETURNS = {
  place: v => `returadress i ${v}`,
  warehouse: v => `returer går till ett "${v}"`,
  notReturnAddress: () => 'företagets adress är "ingen returadress"'
};

const MARKET_REASONS = {
  tld: v => `.${v}-domänen`,
  lang: v => `sidans språk "${v}"`,
  shopify: v => `Shopify-marknaden ${v}`,
  currency: () => "valutakoden"
};

export default {
  bands: {
    likely: "Trolig dropshippingbutik",
    mixed: "Blandade tecken",
    none: "Inga tecken hittades",
    not_store: "Ingen butik hittades"
  },

  markets: {
    se: { name: "Sverige", localPayments: "Klarna, Swish eller faktura" },
    no: { name: "Norge", localPayments: "Vipps, Klarna eller faktura" }
  },

  rules: {
    dropship_app: p => `Sidan laddar kod från en app för dropshipping-leveranser (${list(p.apps)}).`,
    supplier_images: p => {
      const parts = [];
      if (p.images) parts.push(p.images === 1 ? "1 produktbild har kvar ett filnamn från AliExpress, Alibaba eller Amazon"
        : `${p.images} produktbilder har kvar filnamn från AliExpress, Alibaba eller Amazon`);
      if (p.tags) parts.push(p.tags === 1 ? "1 produkt har en Amazon-produkt-id-tagg"
        : `${p.tags} produkter har en Amazon-produkt-id-tagg`);
      return `Produkter kopierade från en marknadsplats: ${parts.join("; ")}.`;
    },
    ai_images: p => `${p.count} produktbilder har kvar standardfilnamnet från en AI-bildgenerator ` +
      "(ChatGPT, Gemini, DALL-E eller Higgsfield).",
    returns_abroad: p => "Returer skickas utanför EU eller till ett onämnt lager: " +
      `${returnFindings(p.found, RETURNS).join("; ")}.`,
    import_charges: p => `Köparen ska betala importmoms eller tull, så varorna kommer från ett land utanför EU: "${p.quote}"`,
    domain_young: p => `Domänen registrerades ${ago(p.days)}.`,
    catalog_young: p => `Den äldsta produkten i sortimentet lades till ${ago(p.days)}` +
      (p.checkedFirst ? ` (av de första ${p.checkedFirst} som kontrollerades)` : "") + ".",
    no_org_number: () => "Inget organisations- eller momsnummer hittades på sidan eller i dess köpvillkor, " +
      "frakt- och kontaktsidor.",
    long_shipping: p => `Angiven leveranstid är ${p.min === p.max ? p.max : `${p.min}-${p.max}`} dagar.`,
    fake_urgency: p => `Säljpress på sidan: ${list(p.widgets.map(w => URGENCY_WIDGETS[w]))}.`,
    blanket_discount: p => `${p.deep} av ${p.sampled} ` +
      (p.source === "catalog" ? "produkter i sortimentet" : "produkter på sidan") +
      ` är nedsatta ${pct(p.deepOff)} eller mer från ett överstruket "ordinarie" pris.`,
    boilerplate: p => `Malltext som aldrig fyllts i: ${list(p.phrases)}.`,
    foreign_phone: p => `Alla telefonnummer som anges har utländsk landskod: ${phoneList(p.phones, "sv", "eller")}.`,
    other_domain_email: p => `Sidorna anger en e-postadress på ett annat varumärkes domän (${list(p.domains)}).`,
    generic_email: p => `Kontaktadressen är en gratis e-posttjänst (${list(p.domains)}), ` +
      "inte en adress på butikens egen domän.",
    ds_theme: p => `Använder temat ${p.theme}, som marknadsförs nästan bara till dropshippare.`
  },

  notes: {
    platform: p => `Plattform: ${p.platform}. Plattformen i sig är inget bevis och ger inga poäng.`,
    contextApps: p => `Laddar även: ${list(p.apps)}.`,
    theme: p => `Tema: ${p.theme}.`,
    domainRegistered: p => `Domänen ${p.domain} registrerades ${p.date}.`,
    domainAgeNotChecked: p => `Domänens ålder kontrolleras inte för .${p.tld}-domäner: registret ` +
      "publicerar inget datum som visar hur länge butiken har använt domänen. Det är varken ett bra eller ett dåligt tecken.",
    domainAgeUnknown: p => `Åldern på domänen ${p.domain} är okänd (registret gick inte att fråga).`,
    cheapTld: p => `Använder toppdomänen .${p.tld}.`,
    market: (p, m) => `Marknad: ${m[p.market].name} (enligt ${MARKET_REASONS[p.reason.by](p.reason.value)}).`,
    paymentLogos: p => `Betalningslogotyper: ${list(p.methods)}.`,
    noLocalPayment: (p, m) => `Riktar sig till ${m[p.market].name} men visar inte ${m[p.market].localPayments} som betalsätt.`,
    orgNumbers: p => `Org.nr som visas: ${list(p.numbers)}.`,
    noAddress: () => "Ingen postadress hittades.",
    noDeliveryTime: () => "Ingen leveranstid angiven på de lästa sidorna.",
    catalog: p => `Sortiment: ${plural(p.products, "produkt", "produkter")} i ` +
      `${plural(p.types, "produkttyp", "produkttyper")}` + (p.sample.length ? ` (${list(p.sample)})` : "") + "."
  },

  ui: {
    scanning: "Kontrollerar...",
    signalsFound: "Tecken som hittades",
    alsoObserved: "Även observerat",
    notScored: "(ger inga poäng)",
    findSource: "Hitta källan",
    findSourceHelp: "Öppnar Google Lens med produktbilden, så att du kan se om samma foto säljs på " +
      "AliExpress eller Temu. Skickar bara bildens adress, och bara när du klickar.",
    showImages: "Visa produktbilder",
    settings: "Inställningar",
    autoScan: "Kontrollera butiker automatiskt när jag surfar",
    autoScanHelp: "Visar en varningssymbol utan att du öppnar DropCheck. Kräver behörighet att läsa " +
      "varje https://-sida du besöker; läsningen sker i din webbläsare. Av: sidor läses bara när du " +
      "öppnar DropCheck.",
    language: "Språk",
    back: "Tillbaka",
    hint: "DropCheck kan också kontrollera butiker automatiskt när du surfar.",
    hintOpen: "Visa inställningar",
    hintDismiss: "Dölj tipset",
    welcomeTitle: "DropCheck är installerat",
    welcomeUse: "Klicka på DropCheck-ikonen på en butiks sida för att kontrollera den. Fäst ikonen med " +
      "pusselbitsikonen i verktygsfältet, så har du den ett klick bort.",
    welcomeAutoScan: "Du kan också låta DropCheck kontrollera varje butik medan du surfar:",
    welcomeLater: "Du kan ändra det senare under Inställningar i DropCheck.",
    and: "och",
    footer: tlds => "Iakttagelser om den här sidan, inte ett omdöme om företaget. Analysen sker i din " +
      "webbläsare; bara domännamnet skickas till rdap.org, som skickar frågan vidare till domänens " +
      `register, för att hitta registreringsdatumet. ${tlds}-domäner slås inte upp: deras register ` +
      "publicerar inget datum som visar hur länge butiken har använt domänen.",
    result: band => `Resultat: ${band}.`,
    score: (score, max) => `${score} av ${max} poäng.`,
    bandNotes: {
      likely: "Flera oberoende tecken pekar på leverans via tredje part: räkna med ett påslag på " +
        "leverantörens pris och längre leveranstid än hos en lokal butik.",
      mixed: "Vissa tecken finns, men de avgör inte saken.",
      none: "Inget hittades. Det är ingen garanti för något.",
      not_store: "Sidan ser inte ut som en nätbutik, så inget poängsattes."
    },
    caveat: "Därför kan det vara fel: små butiker som trycker på beställning, tillverkar på order eller " +
      "importerar egna designer kan visa samma tecken som en dropshippingbutik.",
    categories: { supply: "Leverantör", identity: "Identitet", pressure: "Säljpress", pricing: "Priser" },
    capped: (raw, counted) => `${raw}, begränsat till ${counted}`,
    lensTitle: "Sök efter bilden med Google Lens",
    lensLabel: (i, n) => `Sök efter produktbild ${i} av ${n} med Google Lens`,
    httpsOnly: "DropCheck läser bara https://-sidor.",
    timeout: "Kontrollen blev inte klar. Ladda om sidan och försök igen.",
    cannotRead: "DropCheck kan inte läsa den här sidan.",
    error: message => `Något gick fel: ${message}`
  }
};
