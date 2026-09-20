import type { GoalCategory } from 'samwell-shared';

/** `"HEALTH"` → `"Health"`, for anywhere a category is shown to the reader. */
export function categoryLabel(category: GoalCategory): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
