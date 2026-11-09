import React from 'react';

import { spacing } from '@/constants/theme';
import { useSamwellUiStore } from '@/stores/samwell-ui';

/**
 * What a conversation keeps clear of at its foot: the composer card's own
 * height, which moves only when the field grows a line. The toolbox opening
 * under the card lies over the conversation like a drawer and costs this
 * nothing. One rule for the chat and for Compass.
 */
export function useFloatingClearance() {
  const composerHeight = useSamwellUiStore((s) => s.composerHeight);
  return React.useMemo(() => ({ paddingBottom: composerHeight + spacing[3] }), [composerHeight]);
}
