import type { ViewStyle } from 'react-native';

import { spacing } from '@/constants/theme';

/**
 * The transcript column, in one place.
 *
 * Three surfaces draw a conversation — the hub's chat, the hub's Compass, and
 * a chat opened on its own — and they used to disagree about it: two padded
 * the column and one did not, so the same exchange sat at different widths
 * depending on how you got to it. `MessageScroller` also brings its own
 * generous default, which every one of them would otherwise override
 * separately.
 *
 * A style rather than a class name, because the virtualized surface passes it
 * to a `contentContainerStyle` where a class has nothing to resolve against.
 *
 * The bubbles carry their own horizontal padding and their own 4pt of rhythm;
 * this is what goes around them.
 */
export const transcriptContent: ViewStyle = {
  paddingHorizontal: spacing[4],
  paddingTop: spacing[3],
  paddingBottom: spacing[3],
  gap: spacing[1],
};
