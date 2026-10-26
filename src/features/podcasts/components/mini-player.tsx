import React from 'react';
import { View } from 'react-native';
import Animated, { type EntryAnimationsValues } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Transition from 'react-native-screen-transitions';
import { scheduleOnRN } from 'react-native-worklets';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { EDGE_SHADOW_ROOM, elevation, fontFamily, slideDownPastEdge, slideUpFromEdge, spacing } from '@/constants/theme';
import { BookOpen, MicSignal } from '@/components/icons';
import { SquareArtwork } from '@/components/square-artwork';
import { MiniPlayerControls } from '@/features/podcasts/components/mini-player-controls';
import { MiniPlayerProgress } from '@/features/podcasts/components/mini-player-progress';
import { useDismissSwipe } from '@/features/podcasts/hooks/use-dismiss-swipe';
import { NOW_PLAYING_ART } from '@/navigation/transitions';
import type { MiniPlayerItem } from '@/features/podcasts/utils/mini-player-item';
import { monogramOf } from '@/utils/monogram';
import { asColor } from '@/utils/colors';

/** The card's height, for the screens that keep room for it under their content. */
export const MINI_PLAYER_HEIGHT = 64;
/** Distance from the safe area's bottom edge to the card. */
export const MINI_PLAYER_GAP = spacing[3];
/** The room the card takes above the safe area: its height and the gap under it. */
export const MINI_PLAYER_CLEARANCE = MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP;

const ART = 44;

/** Screen readers get the swipe as an action. */
const DISMISS_ACTIONS = [{ name: 'dismiss', label: 'Close the player' }];

export type MiniPlayerProps = {
  item: MiniPlayerItem;
  isPlaying: boolean;
  isBuffering: boolean;
  skipForwardSec: number;
  /** A book: the sentence being heard has been highlighted from the player. */
  highlighted: boolean;
  /** A book's second control while it plays, in place of skipping forward. */
  onHighlight: () => void;
  bottomInset: number;
  /**
   * Whether the card slides up as it mounts. Only when playback starts on
   * this screen: a screen that opens with something already playing has the
   * card from its first frame, the way it was on the screen before.
   */
  arrives: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onSkipForward: () => void;
  /** Stops playback and puts the card away. */
  onClose: () => void;
};

/**
 * What is playing, on every podcast surface and on the Library.
 *
 * A floating card rather than a bar across the bottom: the app has no tab bar
 * for one to sit on, and the Library's own floating button and Samwell's
 * input card are already cards that float. Tapping it grows the full player
 * out of its artwork; the two controls on it are the two a listener reaches
 * for without looking: pause, and forward past an ad (for a book, Highlight
 * the sentence being heard), or, once paused, close. Swiping it
 * down stops playback and puts it away. It comes and goes by the bottom edge
 * (`slideUpFromEdge`), and the floating buttons ride with it (`FabLift`).
 *
 * The listening progress is a gold hairline along the card's top edge
 * (`MiniPlayerProgress`), scaled on the UI thread, so a playing episode never
 * re-renders the screen under it.
 */
export function MiniPlayer({
  item,
  isPlaying,
  isBuffering,
  skipForwardSec,
  highlighted,
  onHighlight,
  bottomInset,
  arrives,
  onOpen,
  onToggle,
  onSkipForward,
  onClose,
}: MiniPlayerProps) {
  const [foreground, mutedForeground, surfaceTertiary, primary] = useCSSVariable([
    '--color-foreground',
    '--color-muted-foreground',
    '--color-surface-tertiary',
    '--color-primary',
  ]);
  const book = item.kind === 'book';
  const swipe = useDismissSwipe(onClose, MINI_PLAYER_CLEARANCE + bottomInset + EDGE_SHADOW_ROOM);
  // A card still sliding in is not yet something to grow the player out of:
  // the player opened as playback starts (Listen, from a book's menu) would
  // grow out of a card in motion, half arrived. Until it has landed the
  // player rises from the bottom edge instead (`playerTransition`).
  const [landed, setLanded] = React.useState(!arrives);
  const entering = React.useMemo(
    () =>
      arrives
        ? (values: EntryAnimationsValues) => {
            'worklet';
            return { ...slideUpFromEdge(values), callback: () => scheduleOnRN(setLanded, true) };
          }
        : undefined,
    [arrives],
  );

  return (
    <Animated.View
      entering={entering}
      exiting={slideDownPastEdge}
      className="absolute left-4 right-4"
      style={{ bottom: bottomInset + MINI_PLAYER_GAP }}
    >
      <GestureDetector gesture={swipe.gesture}>
        <Animated.View style={swipe.style}>
          <Touchable
            solid
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${item.title}. Open the player.`}
            accessibilityActions={DISMISS_ACTIONS}
            onAccessibilityAction={onClose}
          >
            <View
              className="flex-row items-center gap-3 overflow-hidden border border-border bg-card pl-2.5 pr-1"
              style={[elevation.card, { height: MINI_PLAYER_HEIGHT }]}
            >
              <MiniPlayerProgress positionSec={item.positionSec} durationSec={item.durationSec} />
              {/* What the full player grows out of (`playerTransition`). */}
              <Transition.Boundary id={NOW_PLAYING_ART} enabled={landed}>
                <SquareArtwork
                  uri={item.artworkUrl}
                  size={ART}
                  aspect={item.aspect}
                  fallbackIcon={book ? BookOpen : MicSignal}
                  monogram={book ? monogramOf(item.title) : null}
                  placeholderColor={asColor(surfaceTertiary)}
                />
              </Transition.Boundary>
              <View className="flex-1 gap-0.5">
                <ThemedText type="bodySm" numberOfLines={1} style={{ fontFamily: fontFamily.sansSemiBold }}>
                  {item.title}
                </ThemedText>
                <ThemedText type="bodySm" color={asColor(mutedForeground)} numberOfLines={1} style={{ fontSize: 12, lineHeight: 16 }}>
                  {item.subtitle}
                </ThemedText>
              </View>
              <MiniPlayerControls
                isPlaying={isPlaying}
                isBuffering={isBuffering}
                skipForwardSec={skipForwardSec}
                second={book ? 'highlight' : 'skip'}
                highlighted={highlighted}
                color={asColor(foreground)}
                gold={asColor(primary)}
                onHighlight={onHighlight}
                onToggle={onToggle}
                onSkipForward={onSkipForward}
                onClose={onClose}
              />
            </View>
          </Touchable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
