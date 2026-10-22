/**
 * What the podcast and blog tools say has in common: durations, days, and
 * lines kept within the tool result budget. Pure.
 */
import { estimateTokens } from '@/services/context-budget';

/** "1h 5m", "12m", "under a minute". */
export function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
}

/** "1 episode", "3 episodes". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The day part of a stored timestamp. */
export const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

/** Text cut to a length, marked where it was cut. */
export const clamp = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

/** Lines up to the budget, then a count of what was left out. */
export function fitLines(head: string, entries: readonly string[], tokenBudget: number, noun: string): string {
  const kept: string[] = [];
  let spent = estimateTokens(head);
  for (const entry of entries) {
    const cost = estimateTokens(entry);
    if (kept.length > 0 && spent + cost > tokenBudget) break;
    spent += cost;
    kept.push(entry);
  }
  const omitted = entries.length - kept.length;
  const tail = omitted > 0 ? `\n\n(${omitted} more ${noun} not shown. Narrow the search to see them.)` : '';
  return `${head}\n\n${kept.join('\n\n')}${tail}`;
}
