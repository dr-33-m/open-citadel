/**
 * Generic blurhash shown while book covers decode. Deliberately NOT derived
 * from each cover (we never had per-cover hashes at ingest) — it is a single
 * muted warm-grey tint that reads as "paper" behind any portrait cover in
 * both themes, so a slow image never pops in over a hard background.
 * Decode-hint only: pass via expo-image's `placeholder={{ blurhash: ... }}`.
 */
export const COVER_PLACEHOLDER_BLURHASH = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';

/**
 * `useCSSVariable` (from 'uniwind') can resolve a token to a number for
 * non-colour CSS custom properties; colour tokens always resolve to a
 * string, so anything else collapses to `undefined` rather than being
 * passed on to a prop that expects a colour (e.g. `ColorValue`, which does
 * not accept `number`).
 */
export function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
