// Norwegian (bokmål) texts. Same keys and parameters as en.js.
import { pct, phoneList, returnFindings } from "./util.js";

const list = items => items.join(", ");
const ago = days => days === 1 ? "for 1 dag siden"
  : days < 60 ? `for ${days} dager siden` : `for omtrent ${Math.round(days / 30)} måneder siden`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const URGENCY_WIDGETS = {
  countdown: "nedtellingsklokke",
  stock: 'lagerteller med "kun N igjen"',
  viewers: 'teller med "N personer ser på dette"'
};

const RETURNS = {
  place: v => `returadresse i ${v}`,
  warehouse: v => `returer går til et "${v}"`,
  notReturnAddress: () => 'firmaadressen er "ikke en returadresse"'
};

const MARKET_REASONS = {
  tld: v => `.${v}-domenet`,
  lang: v => `sidens språk "${v}"`,
  shopify: v => `Shopify-markedet ${v}`,
  currency: () => "valutakoden"
};

export default {
  bands: {
    likely: "Sannsynlig dropshippingbutikk",
    mixed: "Blandede tegn",
    none: "Ingen tegn funnet",
    not_store: "Ingen butikk funnet"
  },

  markets: {
    se: { name: "Sverige", localPayments: "Klarna, Swish eller faktura" },
    no: { name: "Norge", localPayments: "Vipps, Klarna eller faktura" }
  },

  rules: {
    dropship_app: p => `Siden laster inn kode fra en app for dropshipping-levering (${list(p.apps)}).`,
    supplier_images: p => {
      const parts = [];
      if (p.images) parts.push(p.images === 1 ? "1 produktbilde har beholdt et filnavn fra AliExpress, Alibaba eller Amazon"
        : `${p.images} produktbilder har beholdt filnavn fra AliExpress, Alibaba eller Amazon`);
      if (p.tags) parts.push(p.tags === 1 ? "1 produkt har en Amazon-produkt-ID-tagg"
        : `${p.tags} produkter har en Amazon-produkt-ID-tagg`);
      return `Produkter kopiert fra en markedsplass: ${parts.join("; ")}.`;
    },
    ai_images: p => `${p.count} produktbilder har beholdt standardfilnavnet fra en AI-bildegenerator ` +
      "(ChatGPT, Gemini, DALL-E eller Higgsfield).",
    returns_abroad: p => "Returer sendes ut av EU eller til et ikke navngitt lager: " +
      `${returnFindings(p.found, RETURNS).join("; ")}.`,
    // Norway is outside the EU, so import VAT here only says the goods ship from abroad.
    import_charges: p => `Kjøperen må betale importmva eller toll, så varene sendes fra utlandet: "${p.quote}"`,
    domain_young: p => `Domenet ble registrert ${ago(p.days)}.`,
    catalog_young: p => `Det eldste produktet i sortimentet ble lagt til ${ago(p.days)}` +
      (p.checkedFirst ? ` (av de første ${p.checkedFirst} som ble sjekket)` : "") + ".",
    no_org_number: () => "Fant ikke organisasjons- eller MVA-nummer på siden eller i kjøpsvilkårene, " +
      "frakt- og kontaktsidene.",
    long_shipping: p => `Oppgitt leveringstid er ${p.min === p.max ? p.max : `${p.min}-${p.max}`} dager.`,
    fake_urgency: p => `Salgspress på siden: ${list(p.widgets.map(w => URGENCY_WIDGETS[w]))}.`,
    blanket_discount: p => `${p.deep} av ${p.sampled} ` +
      (p.source === "catalog" ? "produkter i sortimentet" : "produkter på siden") +
      ` er satt ned ${pct(p.deepOff)} eller mer fra en overstreket "ordinær" pris.`,
    boilerplate: p => `Malltekst som aldri ble fylt ut: ${list(p.phrases)}.`,
    foreign_phone: p => `Alle oppgitte telefonnumre har utenlandsk landskode: ${phoneList(p.phones, "nb", "eller")}.`,
    other_domain_email: p => `Sidene oppgir en e-postadresse på et annet merkes domene (${list(p.domains)}).`,
    generic_email: p => `Kontaktadressen er en gratis e-posttjeneste (${list(p.domains)}), ` +
      "ikke en adresse på butikkens eget domene.",
    ds_theme: p => `Bruker temaet ${p.theme}, som markedsføres nesten bare til dropshippere.`
  },

  notes: {
    platform: p => `Plattform: ${p.platform}. Plattformen alene er ikke bevis og gir ingen poeng.`,
    contextApps: p => `Laster også inn: ${list(p.apps)}.`,
    theme: p => `Tema: ${p.theme}.`,
    domainRegistered: p => `Domenet ${p.domain} ble registrert ${p.date}.`,
    domainAgeNotChecked: p => `Domenets alder sjekkes ikke for .${p.tld}-domener: registeret ` +
      "publiserer ingen dato som viser hvor lenge butikken har brukt domenet. Det er verken et godt eller et dårlig tegn.",
    domainAgeUnknown: p => `Alderen på domenet ${p.domain} er ukjent (registeret kunne ikke spørres).`,
    cheapTld: p => `Bruker toppdomenet .${p.tld}.`,
    market: (p, m) => `Marked: ${m[p.market].name} (ut fra ${MARKET_REASONS[p.reason.by](p.reason.value)}).`,
    paymentLogos: p => `Betalingslogoer: ${list(p.methods)}.`,
    noLocalPayment: (p, m) => `Retter seg mot ${m[p.market].name}, men viser ikke ${m[p.market].localPayments} som betalingsmåte.`,
    orgNumbers: p => `Org.nr. som vises: ${list(p.numbers)}.`,
    noAddress: () => "Fant ingen postadresse.",
    noDeliveryTime: () => "Ingen leveringstid oppgitt på sidene som ble lest.",
    catalog: p => `Sortiment: ${plural(p.products, "produkt", "produkter")} i ` +
      `${plural(p.types, "produkttype", "produkttyper")}` + (p.sample.length ? ` (${list(p.sample)})` : "") + "."
  },

  ui: {
    scanning: "Sjekker...",
    signalsFound: "Tegn som ble funnet",
    alsoObserved: "Også observert",
    notScored: "(gir ingen poeng)",
    findSource: "Finn kilden",
    findSourceHelp: "Åpner Google Lens med produktbildet, så du kan sjekke om det samme bildet selges på " +
      "AliExpress eller Temu. Sender bare bildets adresse, og bare når du klikker.",
    showImages: "Vis produktbilder",
    settings: "Innstillinger",
    autoScan: "Sjekk butikker automatisk mens jeg surfer",
    autoScanHelp: "Viser et varselsymbol uten at du åpner DropCheck. Krever tillatelse til å lese alle " +
      "https://-sider du besøker; lesingen skjer i nettleseren din. Av: sider leses bare når du åpner " +
      "DropCheck.",
    language: "Språk",
    back: "Tilbake",
    hint: "DropCheck kan også sjekke butikker automatisk mens du surfer.",
    hintOpen: "Vis innstillinger",
    hintDismiss: "Skjul tipset",
    welcomeTitle: "DropCheck er installert",
    welcomeUse: "Klikk på DropCheck-ikonet på en butikks side for å sjekke den. Fest ikonet med " +
      "puslebrikkeikonet i verktøylinjen, så er det bare ett klikk unna.",
    welcomeAutoScan: "Du kan også la DropCheck sjekke hver butikk mens du surfer:",
    welcomeLater: "Du kan endre dette senere under Innstillinger i DropCheck.",
    and: "og",
    footer: tlds => "Observasjoner om denne siden, ikke en vurdering av firmaet. Analysen skjer i " +
      "nettleseren din; bare domenenavnet sendes til rdap.org, som sender oppslaget videre til domenets " +
      `register, for å finne registreringsdatoen. ${tlds}-domener slås ikke opp: registrene deres ` +
      "publiserer ingen dato som viser hvor lenge butikken har brukt domenet.",
    result: band => `Resultat: ${band}.`,
    score: (score, max) => `${score} av ${max} poeng.`,
    bandNotes: {
      likely: "Flere uavhengige tegn peker på levering via tredjepart: regn med et påslag på " +
        "leverandørens pris og lengre levering enn fra en lokal butikk.",
      mixed: "Noen tegn finnes, men de avgjør ikke saken.",
      none: "Ingenting funnet. Det er ingen garanti for noe.",
      not_store: "Siden ser ikke ut som en nettbutikk, så ingenting ble vurdert."
    },
    caveat: "Hvorfor dette kan være feil: små butikker som trykker på bestilling, lager på bestilling " +
      "eller importerer egne design kan vise de samme tegnene som en dropshippingbutikk.",
    categories: { supply: "Leverandør", identity: "Identitet", pressure: "Salgspress", pricing: "Priser" },
    capped: (raw, counted) => `${raw} funnet, ${counted} teller`,
    lensTitle: "Søk etter bildet med Google Lens",
    lensLabel: (i, n) => `Søk etter produktbilde ${i} av ${n} med Google Lens`,
    httpsOnly: "DropCheck leser bare https://-sider.",
    timeout: "Sjekken ble ikke ferdig. Last inn siden på nytt og prøv igjen.",
    cannotRead: "DropCheck kan ikke lese denne siden.",
    error: message => `Noe gikk galt: ${message}`
  }
};
