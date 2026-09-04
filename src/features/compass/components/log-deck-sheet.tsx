import React from 'react';
import { View } from 'react-native';
import { Clock } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { LogDeck } from '@/features/compass/components/log-deck';
import { LogNoteDialog } from '@/features/compass/components/log-note-dialog';
import { useLogDeck } from '@/features/compass/hooks/use-log-deck';
import { asColor } from '@/utils/colors';

type LogDeckSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Today's activities, dealt one at a time.
 *
 * ONE sheet, holding either the deck or the note being written. The note used
 * to open a sheet of its own, which dismissed this one underneath it — so
 * answering a single card dropped you back to the chat and the whole
 * log-swipe-log rhythm ended on the first card.
 *
 * The one place in Compass that reaches into a store, and it does that through
 * `useLogDeck` rather than inline, so the deck and the cards stay
 * presentational and can be looked at on their own.
 */
export function LogDeckSheet({ visible, onClose }: LogDeckSheetProps) {
  const [primary, foreground] = useCSSVariable([
    '--color-primary',
    '--color-foreground',
  ]);
  const deck = useLogDeck();

  // Close on its own once everything is answered AND nothing is waiting in the
  // snooze pile — leaving an empty sheet up makes the reader dismiss something
  // they have already finished with, but closing on them while cards are still
  // parked under the clock would hide the thing they deliberately deferred.
  // Closing always drops back to today, so the next time the deck opens it
  // opens on what is due rather than on wherever you last browsed.
  const { showToday } = deck;
  const close = React.useCallback(() => {
    showToday();
    onClose();
  }, [showToday, onClose]);

  const answered =
    visible && deck.items.length === 0 && deck.pending === null && deck.snoozedCount === 0;
  React.useEffect(() => {
    if (!answered) return;
    const timer = setTimeout(close, 400);
    return () => clearTimeout(timer);
  }, [answered, close]);

  return (
    /* Content-sized, like the planner. Both were tried on a fixed detent so
       their bodies could be deferred; the planner's grid collapsed, and a deck
       that states its height is a deck with dead space under the last card. */
    <Sheet visible={visible} onClose={close}>
      <View className="gap-4 px-4 pb-2">
        {/* No fixed height: the clock button carries 40dp when it is there,
            and without it the row should be the label's own height. Forcing
            40 either way left a band of empty space under TODAY that made the
            gap above the deck read as bigger than the one below it. */}
        <View className="flex-row items-center justify-between">
          <ThemedText type="labelSm" color={asColor(primary)}>
            {deck.showingSnoozed ? 'LATER' : 'TODAY'}
          </ThemedText>

          {/* The way back to anything snoozed. Hidden when nothing is parked,
              because an always-present control for an empty pile is noise. */}
          {deck.snoozedCount > 0 && (
            <Touchable
              className={
                deck.showingSnoozed
                  ? 'h-10 flex-row items-center gap-1.5 border border-primary px-2.5'
                  : 'h-10 flex-row items-center gap-1.5 border border-border px-2.5'
              }
              onPress={deck.toggleSnoozed}
              haptic="select"
              accessibilityRole="button"
              accessibilityState={{ selected: deck.showingSnoozed }}
              accessibilityLabel={
                deck.showingSnoozed
                  ? "Back to today's activities"
                  : `${deck.snoozedCount} snoozed for later`
              }
            >
              {/* Full contrast, not `muted-foreground`. Muted is this app's
                  weight for something switched off, so the one control that
                  gets a snoozed card back was reading as disabled. It only
                  appears when there IS something parked, so it has earned
                  being legible. */}
              <Clock
                size={18}
                color={asColor(deck.showingSnoozed ? primary : foreground)}
                strokeWidth={2}
              />
              <ThemedText
                type="labelSm"
                color={asColor(deck.showingSnoozed ? primary : foreground)}
              >
                {String(deck.snoozedCount)}
              </ThemedText>
            </Touchable>
          )}
        </View>

        {/* The deck never leaves. The note draws over it in a portal, so
            answering one returns you to the same pile in the same place. */}
        <LogDeck
          items={deck.items}
          goalLabels={deck.goalLabels}
          values={deck.values}
          onChangeValue={deck.changeValue}
          onDone={deck.done}
          onMissed={deck.missed}
          onSkip={deck.showingSnoozed ? deck.unsnoozeItem : deck.skip}
          snoozed={deck.showingSnoozed}
          emptyNote={
            deck.showingSnoozed
              ? 'Nothing is waiting here.'
              : deck.snoozedCount > 0
                ? 'The rest are under the clock, for later.'
                : 'Everything due has been answered.'
          }
        />
      </View>

      <LogNoteDialog
        outcome={deck.pending?.outcome ?? null}
        title={deck.pending?.item.trackable.title ?? ''}
        value={deck.note}
        onChangeText={deck.setNote}
        onSave={deck.saveNote}
        onSkip={deck.skipNote}
      />
    </Sheet>
  );
}
