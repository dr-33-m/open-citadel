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

/** "60", "22", "4.5": whole hours from ten up, where a tenth stops meaning anything. */
export function formatHours(hours: number): string {
  return hours >= 10 ? String(Math.round(hours)) : String(Math.round(hours * 10) / 10);
}

/**
 * `1 BOOK`, `12 EPISODES`: a count and its noun, the way a list's subtitle
 * reads. The plural is the singular plus S unless it is given.
 */
export function countLabel(count: number, singular: string, plural = `${singular}S`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Whether any of `fields` contains `query`, ignoring case and the spaces
 * around it. An empty query matches everything, so a cleared search field
 * shows the whole list.
 */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || fields.some((field) => field?.toLowerCase().includes(q));
}
