/**
 * The store's price string, cleaned for the card.
 *
 * The store's own string is authoritative — it is localised, and a price
 * shown in the wrong currency is worse than a price shown a beat late — but
 * the stores hand back more than a reader needs to decide: a country
 * qualifier the reader did not ask for ("US$20.00") and cents that are
 * exactly zero. Both are noise on a card whose price is the decision. What
 * survives is the currency mark and the honest number: "$20", "20 €",
 * "$6.99".
 *
 * Pure and string-only, so it can be tested against the shapes the stores
 * actually send without a store to ask.
 */
export function formatStorePrice(priceString: string): string {
  let out = priceString.trim();

  /*
   * The country qualifier comes off the front: "US$20.00" keeps the dollar
   * sign and loses the prefix. The space is optional because some storefronts
   * send "US $20.00", and the lookahead keeps the match off words that merely
   * start with US ("US …" is a qualifier; "AUS$20.00" is Australia's and
   * stays).
   */
  out = out.replace(/^US\s*(?=\$)/, '');

  /*
   * Exactly-zero cents come off, in the locale's own decimal mark, along
   * with any space before a currency symbol that trails the number
   * ("20,00 €" → "20 €"). Two literal zeros, never a character class — a
   * real fraction ("12,50 €") does not match and must survive, and neither
   * does a thousands separator that happens to sit two places from the end.
   * The symbol group goes back in whole: only the cents and their space go.
   */
  out = out.replace(/([.,])00(\s?\p{Sc})?$/u, '$2');

  return out;
}
