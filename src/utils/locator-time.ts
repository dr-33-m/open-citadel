const TIME = /^t=(\d+(?:\.\d+)?)$/;

/**
 * The moment in audio a Readium locator carries, as the media fragment its
 * audiobook locators use (`t=754.2`): seconds, or null when it carries none
 * (a book's highlight). An episode transcript's highlights carry one.
 */
export function locatorSeconds(locator: { locations?: object } | null | undefined): number | null {
  const fragments = (locator?.locations as { fragments?: unknown } | undefined)?.fragments;
  if (!Array.isArray(fragments)) return null;
  for (const fragment of fragments) {
    const match = typeof fragment === 'string' ? TIME.exec(fragment) : null;
    if (match) return Number(match[1]);
  }
  return null;
}
