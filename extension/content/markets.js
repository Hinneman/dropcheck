// Market profiles and per-language keyword lists. detectors.js builds its patterns
// from these, so supporting a new country means adding entries here (plus labeled
// stores for that country in the eval dataset).
//
// Loaded before detectors.js everywhere: as a content script, by the service worker
// and by the Node tests. No import/export, it only attaches itself to globalThis.
(() => {
  if (globalThis.DropCheckMarkets) return;

  // Regex source fragments. All languages are matched at once: stores mix languages,
  // and dropship templates are often left partly in English.
  const LANGUAGES = {
    en: {
      sale: ["ends?", "ending", "offer", "deal", "sale"],
      only: ["only", "just"],
      left: ["left", "items? left", "in stock"],
      people: ["people", "others"],
      viewing: ["viewing", "looking", "watching"],
      ship: ["ship", "deliver", "dispatch", "transit"],
      notShip: ["return", "refund", "warranty", "processing", "handling", "exchange"],
      dayPrefix: ["business", "working", "bank"],
      days: ["days?"],
      weeks: ["weeks?"],
      // Where returns go. Stems, matched without a word boundary at the end.
      returnWord: ["return"],
      returnAddress: ["address", "send (?:it|them|the item|your return) to", "ship (?:it|them) to"],
      foreignWarehouse: ["international (?:return(?:s)? )?(?:warehouse|centre|center)",
                         "overseas (?:return(?:s)? )?(?:warehouse|centre|center)"],
      notReturnAddress: ["not (?:a|our) return address"],
      // Import charges the buyer pays. Whole words.
      importCharge: ["import (?:duty|duties|vat|tax|taxes|fees|charges)",
                     "customs (?:duty|duties|fees|charges|clearance fees)", "duties and taxes"],
      chargedToBuyer: ["paid by", "charged to", "responsibility of", "your responsibility",
                       "customer is responsible", "you are responsible", "buyer is responsible",
                       "not included in the price", "at your expense"],
      chargeQualifier: ["outside (?:of )?the eu", "outside eu", "non-eu", "outside europe",
                        "international orders", "international shipments", "international customers",
                        "other countries", "abroad", "switzerland", "united kingdom", "uk", "norway",
                        "usa", "united states", "us orders", "canada", "australia",
                        "pre-?order(?:s|ed)?"],
      noCharge: ["no", "without", "free of"]
    },
    sv: {
      sale: ["slutar", "rea", "erbjudande", "kampanj"],
      only: ["bara", "endast"],
      left: ["kvar", "i lager"],
      people: ["personer", "andra"],
      viewing: ["tittar", "kollar", "ser på"],
      ship: ["leverans", "levere", "frakt", "skickas", "postnord"],
      notShip: ["retur", "ångerrätt", "angerratt", "återbetal", "garanti", "reklamation",
                "behandl", "hantering", "byte"],
      dayPrefix: ["arbets", "var"],
      days: ["dagar", "dygn", "dgr"],
      weeks: ["veckor"],
      returnWord: ["retur"],
      returnAddress: ["adress", "skicka(?:s)? (?:den |varan |returen |paketet )?till"],
      foreignWarehouse: ["internationell(?:a|t)? (?:retur)?(?:lager|center|centret)",
                         "utländsk(?:a|t)? (?:retur)?lager", "lager utomlands"],
      notReturnAddress: ["ingen returadress", "inte (?:en |vår )?returadress", "ej returadress"],
      importCharge: ["importmoms", "importavgift(?:er|erna)?", "importtull", "införselmoms",
                     "tull", "tullar", "tullavgift(?:er|erna)?", "tullkostnad(?:er|erna)?"],
      chargedToBuyer: ["debiteras", "betalas av", "tillkommer", "står (?:du|kunden) för",
                       "ansvarar (?:du|kunden) för", "kundens ansvar", "ingår inte"],
      chargeQualifier: ["utanför eu", "utanför europa", "utanför sverige", "internationella beställningar",
                        "internationella order", "andra länder", "utlandet", "schweiz", "storbritannien",
                        "norge", "usa", "stater", "kanada", "australien",
                        "förbeställ(?:ning|ningar|da|d|t)"],
      noCharge: ["inga", "ingen", "utan"]
    },
    nb: {
      sale: ["slutter", "tilbud", "salg", "kampanje"],
      only: ["bare", "kun"],
      left: ["igjen", "på lager"],
      people: ["personer", "andre"],
      viewing: ["ser på", "kikker på", "ser"],
      ship: ["levering", "frakt", "sendes", "posten", "bring"],
      notShip: ["retur", "angrerett", "angrefrist", "reklamasjon", "garanti", "behandling",
                "bytte", "refusjon"],
      dayPrefix: ["arbeids", "virke"],
      days: ["dager", "døgn"],
      weeks: ["uker"],
      returnWord: ["retur"],
      returnAddress: ["adresse", "sendes til", "send (?:varen |pakken |returen )?til"],
      foreignWarehouse: ["internasjonal(?:e|t)? (?:retur)?(?:lager|senter)",
                         "utenlandsk(?:e)? (?:retur)?lager", "lager i utlandet"],
      notReturnAddress: ["ingen returadresse", "ikke (?:en |vår )?returadresse"],
      importCharge: ["importmva", "importavgift(?:er|ene)?", "toll", "tollavgift(?:er|ene)?",
                     "tollgebyr(?:er|ene)?", "fortolling(?:sgebyr)?"],
      chargedToBuyer: ["betales av", "belastes", "tilkommer", "kundens ansvar",
                       "ansvarlig for", "ikke inkludert"],
      chargeQualifier: ["utenfor eu", "utenfor europa", "utenfor norge", "internasjonale bestillinger",
                        "andre land", "utlandet", "sveits", "storbritannia", "usa", "kanada", "australia",
                        "forhåndsbestill(?:ing|inger|te|t)"],
      noCharge: ["ingen", "uten"]
    },
    de: {
      sale: ["endet", "angebot"],
      only: ["nur noch"],
      left: ["übrig", "verfügbar", "auf lager"],
      people: ["personen"],
      viewing: ["sehen", "schauen"],
      ship: ["lieferung", "versand", "zustellung"],
      notShip: ["widerruf", "rückgabe", "garantie", "bearbeitung"],
      dayPrefix: ["werk"],
      days: ["tage"],
      weeks: ["wochen"],
      returnWord: ["rücksend", "rückgabe", "retoure"],
      returnAddress: ["adresse", "anschrift", "gesendet", "senden an", "schicken an"],
      foreignWarehouse: ["internationale(?:s|n)? (?:retouren)?lager", "auslandslager", "lager im ausland"],
      notReturnAddress: ["keine rücksendeadresse", "keine retourenadresse"],
      importCharge: ["einfuhrumsatzsteuer", "einfuhrabgaben", "einfuhrgebühren", "importgebühren",
                     "zollgebühren", "zollkosten", "zoll"],
      chargedToBuyer: ["zu tragen", "trägt der käufer", "trägt der kunde", "vom käufer", "vom kunden",
                       "vom empfänger", "nicht im preis enthalten", "nicht enthalten"],
      chargeQualifier: ["außerhalb der eu", "nicht-eu", "drittländer", "internationale bestellungen",
                        "ausland", "schweiz", "großbritannien", "norwegen", "usa", "kanada", "australien",
                        "vorbestell(?:ung|ungen|t|te)"],
      noCharge: ["keine", "ohne"]
    }
  };

  // Swedish org. no.: 10 digits with a Luhn check digit (personal ID numbers of sole
  // traders pass too, which is correct: they are the registration number).
  function luhnValid(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = +digits[i] * (i % 2 === 0 ? 2 : 1);
      if (d > 9) d -= 9;
      sum += d;
    }
    return sum % 10 === 0;
  }

  // Norwegian org. no.: 9 digits, the last a modulus-11 check digit.
  function mod11Valid(digits) {
    const weights = [3, 2, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + w * +digits[i], 0);
    const check = 11 - (sum % 11);
    if (check === 10) return false;
    return (check === 11 ? 0 : check) === +digits[8];
  }

  const MARKETS = {
    se: {
      name: "Swedish",
      country: "SE",
      tlds: ["se"],
      langs: ["sv"],
      currencies: ["SEK"],
      phoneCode: "46",
      neighbourPhoneCodes: ["45", "47", "354", "358"],   // DK, NO, IS, FI
      localPayments: ["klarna", "swish", "invoice", "svea", "qliro", "walley", "trustly"],
      localPaymentLabel: "Klarna, Swish or invoice",
      orgNumber: {
        re: /\b(\d{6}-\d{4})\b/g,
        valid: n => luhnValid(n.replace(/\D/g, ""))
      },
      addressRes: [
        /\b\d{3}\s?\d{2}\s+[A-ZÅÄÖ][a-zåäö]{2,}/,                                       // 112 51 Stockholm
        /\b[A-ZÅÄÖ][a-zåäö]+(gatan|vägen|gata|väg|torget|stigen|allén|backen|plan|gränd)\s+\d+/
      ]
    },
    no: {
      name: "Norwegian",
      country: "NO",
      tlds: ["no"],
      langs: ["nb", "nn", "no"],
      currencies: ["NOK"],
      phoneCode: "47",
      neighbourPhoneCodes: ["45", "46", "354", "358"],   // DK, SE, IS, FI
      localPayments: ["vipps", "klarna", "invoice", "walley", "svea"],
      localPaymentLabel: "Vipps, Klarna or invoice",
      // A bare 9-digit number is too common to trust, so require the keyword or the
      // "NO ... MVA" VAT form, and the check digit.
      orgNumber: {
        re: /(?:\borg\.?\s*(?:nr|nummer)\.?|organisasjonsnummer|foretaksnummer|foretaksregisteret)\s*:?\s*(?:NO\s?)?(\d{3}\s?\d{3}\s?\d{3})\b|\bNO\s?(\d{3}\s?\d{3}\s?\d{3})\s?MVA\b/gi,
        valid: n => mod11Valid(n.replace(/\D/g, ""))
      },
      addressRes: [
        /\b[A-ZÆØÅ][a-zæøå]+(gata|gate|gaten|veien|vegen|vei|veg|plass|torget|allé)\s+\d+/,
        /\b\d{4}\s+[A-ZÆØÅ][a-zæøå]+,?\s+(Norge|Norway)\b/
      ]
    }
  };

  globalThis.DropCheckMarkets = { LANGUAGES, MARKETS, luhnValid, mod11Valid };
})();
