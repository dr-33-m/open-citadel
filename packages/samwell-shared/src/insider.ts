/**
 * Insider codes: a plan handed out by the founder for a set term.
 *
 * Shared because three places must agree on the same two things: how long
 * each term runs (the server mints and expires it, the app names it), and
 * what a typed code is turned into before it is looked up (the app tidies it
 * as it is typed, the server tidies it again before it trusts it).
 *
 * Pure and dependency-free, so it can be unit tested on its own.
 */
import { CREDIT_PLANS, type PlanId } from './billing';

/** The four terms a code can be minted for. */
export type InsiderDuration = 'day' | 'week' | 'month' | 'year';

export const INSIDER_DURATION_ORDER: readonly InsiderDuration[] = [
  'day',
  'week',
  'month',
  'year',
] as const;

export interface InsiderTerm {
  id: InsiderDuration;
  /** As it is said to a reader: "1 year". */
  label: string;
  /**
   * How many days the plan is held for.
   *
   * A month is thirty days, not a calendar month, because that is the period
   * credits are granted on: a one month code is exactly one grant.
   */
  days: number;
}

export const INSIDER_TERMS: Record<InsiderDuration, InsiderTerm> = {
  day: { id: 'day', label: '1 day', days: 1 },
  week: { id: 'week', label: '1 week', days: 7 },
  month: { id: 'month', label: '1 month', days: 30 },
  year: { id: 'year', label: '1 year', days: 365 },
};

/** Which term a stored number of days is, or null for one minted before terms had names. */
export function insiderDurationForDays(days: number): InsiderDuration | null {
  return INSIDER_DURATION_ORDER.find((id) => INSIDER_TERMS[id].days === days) ?? null;
}

/** "1 year · Maester Samwell": a code in one line, for whoever is handing it out. */
export function insiderInviteLabel(plan: PlanId, duration: InsiderDuration): string {
  return `${INSIDER_TERMS[duration].label} · ${CREDIT_PLANS[plan].label}`;
}

/** Letters and digits in a code, without the dashes that group them. */
export const INSIDER_CODE_LENGTH = 20;
const INSIDER_CODE_GROUP = 5;

/**
 * A code as it is stored: uppercase, in groups of five.
 *
 * Whatever was typed or pasted around it is dropped, so a code copied with a
 * trailing space, typed in lower case or entered without its dashes still
 * finds its row. Longer input is cut to a code's length rather than refused,
 * which is what lets the same function tidy a field as it is typed into.
 */
export function normalizeInsiderCode(input: string): string {
  const characters = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INSIDER_CODE_LENGTH);
  return characters.match(new RegExp(`.{1,${INSIDER_CODE_GROUP}}`, 'g'))?.join('-') ?? '';
}

/** Every character is there, so it is worth asking the server about. */
export function isCompleteInsiderCode(input: string): boolean {
  return normalizeInsiderCode(input).replace(/-/g, '').length === INSIDER_CODE_LENGTH;
}

/** What a redeemed code turned out to be. */
export interface InsiderRedemption {
  plan: PlanId;
  /** Null for a code minted before terms had names. */
  duration: InsiderDuration | null;
  /** When the plan stops, as an ISO date. */
  endsAt: string;
}

/** Why the server would not redeem a code. */
export type InsiderRefusal =
  | 'unknown_code'
  | 'already_redeemed'
  | 'already_subscribed'
  | 'account_required'
  | 'too_many_attempts';
