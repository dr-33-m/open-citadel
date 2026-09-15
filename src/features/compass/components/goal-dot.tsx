import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { categoryColorVar } from '@/features/compass/utils/category';
import type { GoalRow } from '@/stores/compass';
import { asColor } from '@/utils/colors';

/**
 * The category's colour as a small square — the same square in the switcher
 * chip, the overview goal list and a deck card's goal caption, so a goal reads
 * as one identity across surfaces. The label beside it carries the rest.
 */
export function GoalDot({ category, size = 8 }: { category: GoalRow['category']; size?: number }) {
  const color = useCSSVariable(categoryColorVar(category));
  return (
    <View
      style={{ width: size, height: size, backgroundColor: asColor(color) }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
