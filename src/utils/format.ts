/**
 * Number formatting for product surfaces (fidelity law 11: format numbers
 * like a product, not a database — trimmed trailing zeros, compact counts).
 * Single source of truth: previously duplicated in
 * `src/app/settings.tsx` and `src/stores/model.ts`.
 */

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** `1.5 GB` / `584 MB`, with trailing zeros trimmed (`1 GB`, never `1.0 GB`)
 * and one decimal kept only when it carries meaning (`2.5 GB`). Empty string
 * for a missing size so callers can inline it into a longer label. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes >= GB) {
    const gb = Math.round((bytes / GB) * 10) / 10;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${Math.round(bytes)} B`;
}

/** Compact count: `1.4M` / `38k` / `96`. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1_000_000) {
    const m = Math.round((n / 1_000_000) * 10) / 10;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  const k = Math.round(n / 1_000);
  if (n >= 1_000) return k >= 1000 ? '1M' : `${k}k`;
  return String(n);
}
