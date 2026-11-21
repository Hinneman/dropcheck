// Helpers the language tables share.

export const pct = x => `${Math.round(x * 100)} %`;

// "place:Shenzhen" -> ["place", "Shenzhen"]; "notReturnAddress" -> ["notReturnAddress", ""].
export function splitToken(token) {
  const i = token.indexOf(":");
  return i < 0 ? [token, ""] : [token.slice(0, i), token.slice(i + 1)];
}

// Words each return finding with the table's phrases. A token of unknown kind (from an
// older stored verdict) is shown as it is.
export function returnFindings(found, phrases) {
  return found.map(token => {
    const [kind, value] = splitToken(token);
    return Object.hasOwn(phrases, kind) ? phrases[kind](value) : token;
  });
}

// "+44 (United Kingdom)", the regions named by the browser in the given locale.
export function phoneList(phones, locale, or) {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return phones.map(ph => {
    const regions = (ph.regions || []).map(code => names.of(code));
    return `+${ph.code}` + (regions.length ? ` (${regions.join(` ${or} `)})` : "");
  }).join(", ");
}
