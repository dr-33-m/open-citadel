import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Carousel } from '@/components/ui/carousel';
import { LogCard } from '@/features/compass/components/log-card';
import type { DueItem } from '@/services/occurrences';
import { asColor } from '@/utils/colors';

type LogDeckProps = {
  items: DueItem[];
  /** Value in progress for the top card, keyed by trackable id. */
  values: Record<string, number | null>;
  onChangeValue: (trackableId: string, next: number | null) => void;
  onDone: (item: DueItem) => void;
  onMissed: (item: DueItem) => void;
  onSkip: (item: DueItem) => void;
  /** These cards were snoozed, so the clock puts them back rather than away. */
  snoozed?: boolean;
  /** What the empty state says once everything has been answered. */
  emptyNote?: string;
};

/** Card width leaves the pile behind the top one visible at the edges. */
const CARD_SIZE = 300;

/**
 * Every slide is absolutely positioned, so the deck has no height of its own
 * and the tallest card has to fit inside this one. A duration card is the
 * tallest: stepper, three presets, and the three outcomes underneath. Every
 * card is given exactly this height rather than sizing to its content — a bare
 * completion card and a duration card differ by a hundred points, and a pile of
 * mismatched cards stops reading as a pile at all. Sized to the tallest card
 * with as little slack as it can take, so the simplest card is not mostly
 * empty.
 */
const CARD_HEIGHT = 340;

/** How far the pile behind the top card reaches below it: two cards, stepped. */
const STACK_EXTENT = 52;

/**
 * Exactly the card plus the pile beneath it, with the card pinned to the TOP.
 *
 * `Carousel.Content` centres its slides and is `overflow-hidden`, which pulls
 * in two directions: too short and the pile is clipped, tall enough for the
 * pile and the centring puts half that height above the card as well. The way
 * out is `justify-start` on the box rather than a negative margin — a negative
 * margin moved the carousel's TOUCH area up over the sheet's header too, which
 * quietly ate every tap on the clock button sitting there.
 */
const DECK_BOX = CARD_HEIGHT + STACK_EXTENT;

/**
 * Today's activities, as a deck.
 *
 * The stack variant deals one card at a time with the next two peeking out
 * behind it, so the reader can see there is an end to this. Answering a card
 * removes it from `items`, which unmounts it and brings the next to the front
 * on its own — there is no index to keep in step, and no way for the deck and
 * the data to disagree about which card is showing.
 *
 * Presentational: it takes items and callbacks and touches no store.
 */
export function LogDeck({
  items,
  values,
  onChangeValue,
  onDone,
  onMissed,
  onSkip,
  snoozed = false,
  emptyNote,
}: LogDeckProps) {
  const mutedForeground = useCSSVariable('--color-muted-foreground');

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <ThemedText type="headlineSm">Nothing due today.</ThemedText>
        {emptyNote && (
          <ThemedText type="bodySm" color={asColor(mutedForeground)} className="text-center">
            {emptyNote}
          </ThemedText>
        )}
      </View>
    );
  }

  return (
    <View className="gap-4">
      <Carousel variant="stack" itemSize={CARD_SIZE}>
        <Carousel.Content className="justify-start" style={{ height: DECK_BOX }}>
          {items.map((item) => (
            <Carousel.Item key={item.trackable.id}>
              {/* An explicit height, not `h-full`: `Carousel.Item` is
                  absolutely positioned with no definite height of its own, so
                  a percentage has nothing to resolve against and the card
                  falls back to sizing itself. */}
              <View style={{ width: CARD_SIZE, height: CARD_HEIGHT }}>
                <LogCard
                  item={item}
                  value={values[item.trackable.id] ?? null}
                  onChangeValue={(next) => onChangeValue(item.trackable.id, next)}
                  onDone={() => onDone(item)}
                  onMissed={() => onMissed(item)}
                  onSkip={() => onSkip(item)}
                  snoozed={snoozed}
                />
              </View>
            </Carousel.Item>
          ))}
        </Carousel.Content>
      </Carousel>

      <ThemedText
        type="labelSm"
        color={asColor(mutedForeground)}
        className="text-center"
      >
        {snoozed ? `${items.length} SNOOZED` : `${items.length} LEFT`}
      </ThemedText>
    </View>
  );
}
