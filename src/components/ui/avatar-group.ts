/**
 * The arithmetic behind a stack of avatars: how far each one slides under the
 * one before it, and how many faces are left over once the row is capped.
 *
 * It lives apart from the component because both answers are pure and both are
 * easy to get subtly wrong — a cap of zero that hides everybody, a `total`
 * lower than the number of faces already on screen, a negative overlap that
 * turns a stack into a gap.
 */

/** Rendered diameter of each avatar size, in points. */
export const AVATAR_SIZE_POINTS = { sm: 32, md: 40, lg: 56, xl: 80 } as const;

export type AvatarSizeName = keyof typeof AVATAR_SIZE_POINTS;

/**
 * How much of each avatar the next one covers, as a share of its diameter.
 * A third is enough for the faces to read as one group and to still leave the
 * widest part of every face visible.
 */
export const AVATAR_GROUP_OVERLAP_RATIO = 0.32;

/**
 * Points one avatar slides under its neighbour.
 *
 * Derived from the size rather than fixed, so the stack keeps its proportions
 * across the size ladder instead of looking crowded at `xl` and loose at `sm`.
 * A caller's own number wins, clamped so it can close a stack up entirely but
 * never open it into a gap — that is what a plain row is for.
 */
export function avatarGroupOverlap(
  size: AvatarSizeName,
  overlap?: number
): number {
  const diameter = AVATAR_SIZE_POINTS[size] ?? AVATAR_SIZE_POINTS.md;
  if (overlap === undefined || !Number.isFinite(overlap)) {
    return Math.round(diameter * AVATAR_GROUP_OVERLAP_RATIO);
  }
  return Math.min(Math.max(overlap, 0), diameter);
}

export interface AvatarGroupCount {
  /** How many avatars to render. */
  visible: number;
  /** How many are left over, for the trailing count. `0` renders no count. */
  overflow: number;
}

/**
 * Splits a row of faces into the ones shown and the number hidden behind them.
 *
 * `max` counts the faces, not the slots — a cap of three with five people shows
 * three avatars and a `+2`, rather than two and a `+3`.
 */
export function avatarGroupCount(
  count: number,
  max?: number,
  total?: number
): AvatarGroupCount {
  const people = Number.isFinite(count) ? Math.max(Math.trunc(count), 0) : 0;

  // An unusable cap is no cap: a `max` of zero or NaN reads as "not set", never
  // as "hide everyone", because an empty row is never what a caller meant.
  const capped =
    max !== undefined && Number.isFinite(max) && max >= 1
      ? Math.min(Math.trunc(max), people)
      : people;

  // `total` describes a population the children only sample, so it can only add
  // to the count — a total below what is already on screen is stale, not a
  // reason to claim there are fewer people than the row is showing.
  const population =
    total !== undefined && Number.isFinite(total)
      ? Math.max(Math.trunc(total), people)
      : people;

  return { visible: capped, overflow: Math.max(population - capped, 0) };
}
