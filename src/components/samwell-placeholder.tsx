import { StyleSheet, View } from 'react-native';

import { useSamwellSpans } from '@/components/samwell-text';
import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';

/**
 * A composer placeholder with Samwell's name in gold.
 *
 * A real `placeholder` is one string carrying one `placeholderTextColor`, so
 * it cannot hold a coloured span — which left his name as plain grey text in
 * the four places somebody reads it most often, while the same word two
 * inches away was gold.
 *
 * So the field's own placeholder is dropped and this is drawn over it: an
 * absolutely positioned, non-interactive line that shows only while the field
 * is empty. `pointerEvents="none"` is what makes it a decoration rather than a
 * lid — every touch goes through to the input underneath, so tapping the words
 * still focuses the field and puts the caret where you tapped.
 *
 * It has to be handed the same type metrics as the input it covers, since a
 * placeholder that sits a pixel off its own field is worse than a grey one.
 * The caller owns those numbers already, so it passes them in rather than this
 * guessing.
 */
export function SamwellPlaceholder({
  text,
  visible,
  color,
  inset = spacing[2],
  fontSize = 16,
  lineHeight = 24,
}: {
  text: string;
  /** Only while the field is empty. The caller knows; this does not. */
  visible: boolean;
  /** The muted colour the rest of the line takes. */
  color: string | undefined;
  /**
   * The input's own padding, so the two first lines land on the same pixel.
   *
   * This is not cosmetic. The overlay covers the whole field, and text inside
   * it starts at the field's edge while the input's text starts inside its
   * padding — so without this the placeholder sits above the caret by exactly
   * the padding, which is what it did the first time.
   */
  inset?: number;
  fontSize?: number;
  lineHeight?: number;
}) {
  const spans = useSamwellSpans(text);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { justifyContent: 'flex-start', paddingHorizontal: inset, paddingTop: inset },
      ]}
    >
      <ThemedText
        color={color}
        numberOfLines={1}
        style={{ fontFamily: fontFamily.sans, fontSize, lineHeight }}
      >
        {spans}
      </ThemedText>
    </View>
  );
}
