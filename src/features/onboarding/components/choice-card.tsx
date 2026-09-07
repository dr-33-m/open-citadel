import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Check, type LucideIcon } from '@/components/icons';
import { SamwellText } from '@/components/samwell-text';
import { ThemedText } from '@/components/themed-text';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

/**
 * One of the two doors on the welcome screen, as a card you compare.
 *
 * The comparison is the whole design. Somebody who has just installed a reader
 * is being asked a question they have no basis to answer, so the two answers
 * hold the same slots in the same order: a name, a line saying what it is,
 * what you get, and the button that takes it. Anything that differs between
 * the two cards differs because it is genuinely different, never because the
 * layout drifted.
 *
 * `recommended` is the one deliberate asymmetry. Without it the screen offers
 * two equal options and a shrug, which is abdication rather than guidance. It
 * is stated once, as a filled band, so the card underneath stays quiet enough
 * to read.
 *
 * ## Stacked, not side by side, and not a carousel
 *
 * Side by side was tried and abandoned. At phone width each column is about
 * 170pt, which turns every line of copy into three wrapped ones and forces the
 * labels down to two words. The comparison was visible and there was nothing
 * left worth comparing.
 *
 * A carousel is worse for the same reason inverted: full width for the copy,
 * but only one card on screen. A first-time reader would have to discover a
 * swipe to learn a second option exists. Carousels are for browsing peers you
 * do not need to weigh against each other.
 *
 * Stacked keeps both cards visible, gives the copy the full width, and puts
 * two full-width tap targets under the thumb.
 *
 * The action sits after the points rather than above them, so each card reads
 * as a case and then the button that accepts it.
 */
export function ChoiceCard({
  label,
  icon: Icon,
  title,
  description,
  points,
  action,
  recommended = false,
  /** Renders the description in Samwell's voice, so his name carries the gold. */
  samwellVoice = false,
}: {
  /** The band's text. Only drawn when `recommended`. */
  label?: string;
  /**
   * The mark that leads the title.
   *
   * At the title rather than floating above the card, so it reads as part of
   * the name of the thing rather than as decoration the card happens to carry.
   */
  icon?: LucideIcon;
  title: string;
  description: string;
  /** What you get, one short line each. */
  points: string[];
  /** The button that takes this door. */
  action: React.ReactNode;
  recommended?: boolean;
  samwellVoice?: boolean;
}) {
  const [primary, mutedForeground, primaryForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-primary-foreground',
  ]);

  const Description = samwellVoice ? SamwellText : ThemedText;

  return (
    /* `overflow-hidden` so the band reaches the card's own edges without a
       sliver of card colour showing at each end. */
    <View
      className={cn(
        'overflow-hidden border border-border bg-card',
        recommended && 'border-primary/40',
      )}
    >
      {/* Only the recommended card carries a band. Stacked, there is no
          alignment to preserve, so the plain card starts at its own title
          rather than reserving dead space to match. */}
      {recommended && label ? (
        <View className="bg-primary px-4 py-1.5">
          <ThemedText
            type="labelSm"
            color={asColor(primaryForeground)}
            numberOfLines={1}
            className="text-center"
          >
            {label}
          </ThemedText>
        </View>
      ) : null}

      <View className="gap-4 p-5">
        <View className="gap-1.5">
          <View className="flex-row items-center gap-2.5">
            {Icon ? (
              <Icon
                // 20 against `headlineSm`'s 18pt: a stroke icon reads a shade
                // smaller than type at a matching nominal size, so matching
                // the number would leave it looking undersized beside the word.
                size={20}
                color={recommended ? asColor(primary) : asColor(mutedForeground)}
              />
            ) : null}
            <ThemedText type="headlineSm" className="flex-1">
              {title}
            </ThemedText>
          </View>
          <Description type="bodySm" color={asColor(mutedForeground)}>
            {description}
          </Description>
        </View>

        <View className="gap-2">
          {points.map((point) => (
            <View key={point} className="flex-row items-start gap-2.5">
              {/* `mt-0.5` optically centres a 14pt glyph on a 20pt line.
                  Centring the row would float the tick when a point wraps. */}
              <View className="mt-0.5">
                <Check
                  size={14}
                  color={recommended ? asColor(primary) : asColor(mutedForeground)}
                />
              </View>
              <ThemedText
                type="bodySm"
                color={asColor(mutedForeground)}
                className="flex-1"
              >
                {point}
              </ThemedText>
            </View>
          ))}
        </View>

        {action}
      </View>
    </View>
  );
}
