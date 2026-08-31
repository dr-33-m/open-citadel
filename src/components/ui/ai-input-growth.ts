/**
 * How tall the composer's field is allowed to be.
 *
 * Separated from the component because it is the one piece of AI Input with a
 * right answer that can be checked without a device: a composer that opens at
 * the wrong height, or grows past where it was told to stop, is a bug nobody
 * notices until the send button is off the bottom of the screen.
 *
 * ## Bounds, not a measured height
 *
 * The obvious way to grow a field is to measure its content and set a height
 * from it. That is a loop with a different answer on each platform — the
 * measurement reports the text's height on one and the clipped height of the
 * box we just set on another, where the field can then never grow at all.
 *
 * So nothing is measured. The field is given a floor and a ceiling and left to
 * size itself between them, which is the layout engine's job and which it does
 * without telling anybody. Past the ceiling a multiline field scrolls its own
 * content, and that is the whole mechanism.
 */

/** Type size and the leading it is given, per `size`. */
export const AI_INPUT_METRICS = {
  sm: { fontSize: 15, lineHeight: 20, padding: 10 },
  md: { fontSize: 16, lineHeight: 22, padding: 12 },
  lg: { fontSize: 17, lineHeight: 24, padding: 14 },
} as const;

export type AIInputSize = keyof typeof AI_INPUT_METRICS;

export interface GrowthMetrics {
  lineHeight: number;
  padding: number;
}

/** The box a whole number of lines asks for: the lines, plus both paddings. */
export function heightForLines(metrics: GrowthMetrics, lines: number): number {
  return lines * metrics.lineHeight + metrics.padding * 2;
}

export interface GrowthBounds {
  minHeight: number;
  maxHeight: number;
}

/**
 * The floor and ceiling a field grows between.
 *
 * At least one line, so an empty composer is the size of an empty composer.
 * Never below the floor, so a `maxRows` under `minRows` — a caller
 * contradicting itself — resolves to the height that was asked for outright
 * rather than to one shorter than the field was told to open at.
 */
export function growthBounds(
  metrics: GrowthMetrics,
  minRows: number,
  maxRows: number
): GrowthBounds {
  const floor = Math.max(1, Math.floor(minRows) || 1);
  const ceiling = Math.max(floor, Math.floor(maxRows) || floor);
  return {
    minHeight: heightForLines(metrics, floor),
    maxHeight: heightForLines(metrics, ceiling),
  };
}
