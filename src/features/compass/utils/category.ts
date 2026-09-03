import { GOAL_CATEGORIES, type GoalCategory } from 'samwell-shared';

/**
 * A stable `--color-chart-*` token for a category.
 *
 * Ten categories, five chart tokens, so two categories can land on the same
 * colour — the label beside the dot carries the rest of the identity, and a
 * reader rarely has goals in two categories a fold apart at once. What matters
 * is that a category's dot is the SAME colour everywhere it shows: the
 * switcher chip, the overview goal list, a deck card's goal tag.
 */
export function categoryColorVar(category: GoalCategory): string {
  const i = GOAL_CATEGORIES.indexOf(category);
  return `--color-chart-${((i < 0 ? 0 : i) % 5) + 1}`;
}

/** `"HEALTH"` → `"Health"`, for anywhere a category is shown to the reader. */
export function categoryLabel(category: GoalCategory): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
