import { Image } from 'expo-image';
import { BookOpen, CalendarDays, Compass, History, ListTodo, MessageSquare, Send, Square, TrendingUp } from '@/components/icons';
import React from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { elevation, fontFamily, iconSize } from '@/constants/theme';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

type SamwellControlCenterProps = {
  mode: 'chat' | 'compass';
  onSelectMode: (mode: 'chat' | 'compass') => void;
  /** Held while Samwell is working. Switching mode mid-turn would swap the
   * screen out from under a reply that is still arriving, and in chat mode it
   * also risks a second caller reaching the engine. */
  lockMode?: boolean;
  text: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder: string;
  /**
   * This mode has nothing to talk to — offline Compass, which is cloud-only.
   *
   * The field stops taking input and the mode's own action buttons go away
   * entirely, rather than sitting there inert: a row of controls that does
   * nothing when pressed reads as broken, and the empty state above already
   * says what to do about it.
   */
  unavailable?: boolean;
  /** Chat mode only — replaces Send with a Stop button while a reply is
   * actively generating, matching the old per-session chat screen. */
  showStop?: boolean;
  onStop?: () => void;
  // Chat mode only.
  /** Whether the book button is worth showing at all — hidden once a session
   * has started without a book, since it would just be an inert icon. */
  showBookButton?: boolean;
  pendingBookTitle?: string | null;
  pendingBookCover?: string | null;
  onOpenBookPicker?: () => void;
  /** Long-press the book button to drop it — only offered before a session
   * exists; once a chat has actually started, its book is fixed context. */
  onClearBook?: () => void;
  onOpenHistory?: () => void;
  // Compass mode only.
  hasGoal?: boolean;
  /** How many activities are still owed today; badges the log button. */
  dueCount?: number;
  onOpenDeck?: () => void;
  onOpenPlanner?: () => void;
  onOpenInsights?: () => void;
  /**
   * The composer's own input, handed up so a caller can focus it.
   *
   * This is what makes "work on it more" work: the draft card stays on screen
   * and the cursor lands here, instead of the card being dismissed.
   */
  inputRef?: React.RefObject<TextInput | null>;
};

/**
 * The single input hub for the merged Chat/Compass screen — everything the
 * user does (send a message, switch mode, pick a book, open goal/milestone
 * detail) routes through this one surface.
 */
export function SamwellControlCenter({
  mode,
  lockMode,

  onSelectMode,
  text,
  onChangeText,
  onSend,
  busy,
  placeholder,
  unavailable = false,
  showStop = false,
  onStop,
  showBookButton = true,
  pendingBookTitle,
  pendingBookCover,
  onOpenBookPicker,
  onClearBook,
  onOpenHistory,
  hasGoal,
  dueCount = 0,
  onOpenDeck,
  onOpenPlanner,
  onOpenInsights,
  inputRef,
}: SamwellControlCenterProps) {
  // Literal colours for consumers a className can't reach: lucide icon props
  // and TextInput's placeholderTextColor.
  const [primary, primaryForeground, mutedForeground, surfaceTertiary, foreground] = useCSSVariable([
    '--color-primary',
    '--color-primary-foreground',
    '--color-muted-foreground',
    '--color-surface-tertiary',
    '--color-foreground',
  ]);
  const canSend = text.trim().length > 0 && !busy && !unavailable;
  const [isStopping, setIsStopping] = React.useState(false);
  React.useEffect(() => {
    if (!showStop) setIsStopping(false);
  }, [showStop]);

  return (
    // The drag handle that used to sit at the top of this card is gone with
    // the floating nav it collapsed: there is no bar under the card to hide
    // any more, so the card is just a card.
    <View className="gap-2 border border-border bg-card p-3" style={elevation.card}>
      {/* No border/background of its own — reads as part of the same card
          surface rather than a boxed field inside it. */}
      <TextInput
        ref={inputRef}
        className="max-h-[120px] min-h-[40px] px-2 py-2 text-[16px] text-foreground"
        style={{ fontFamily: fontFamily.sans, lineHeight: 24 }}
        multiline
        placeholder={placeholder}
        placeholderTextColor={asColor(mutedForeground)}
        value={text}
        onChangeText={onChangeText}
        editable={!busy && !unavailable}
      />

      <View className="flex-row items-center gap-2">
        {/* Segmented chat/compass switch — same idea as an OS light/dark
            toggle, icon-only and built from Citadel Frame parts: a bordered
            track, sharp corners throughout, the active cell lifted with a
            contrasting fill instead of a sliding rounded pill. */}
        <View className="flex-row border border-border bg-muted">
          <Touchable
            className={cn(
              'h-10 w-10 items-center justify-center',
              mode === 'chat' && 'bg-card',
              lockMode && mode !== 'chat' && 'opacity-35',
            )}
            style={mode === 'chat' ? elevation.soft : undefined}
            onPress={lockMode ? undefined : () => onSelectMode('chat')}
            haptic="select"
          >
            <MessageSquare
              size={iconSize.default}
              color={asColor(mode === 'chat' ? primary : mutedForeground)}
              strokeWidth={2}
            />
          </Touchable>
          <Touchable
            className={cn(
              'h-10 w-10 items-center justify-center',
              mode === 'compass' && 'bg-card',
              lockMode && mode !== 'compass' && 'opacity-35',
            )}
            style={mode === 'compass' ? elevation.soft : undefined}
            onPress={lockMode ? undefined : () => onSelectMode('compass')}
            haptic="select"
          >
            <Compass
              size={iconSize.default}
              color={asColor(mode === 'compass' ? primary : mutedForeground)}
              strokeWidth={2}
            />
          </Touchable>
        </View>

        {mode === 'chat' && (
          <>
            {showBookButton && (
              <Touchable
                className="h-10 w-10 items-center justify-center border border-border"
                onPress={onOpenBookPicker}
                onLongPress={onClearBook}
              >
                {pendingBookCover ? (
                  // Fills the button edge to edge (matching its inner box, border
                  // excluded) rather than floating with gaps on the sides.
                  <Image source={{ uri: pendingBookCover }} style={{ width: 38, height: 38 }} contentFit="cover" />
                ) : (
                  <BookOpen
                    size={iconSize.default}
                    color={asColor(pendingBookTitle ? primary : mutedForeground)}
                    strokeWidth={2}
                  />
                )}
              </Touchable>
            )}
          </>
        )}

        {mode === 'compass' && !unavailable && (
          <>
            {/* The screen's one gold control: today's activities. It stays
                lit whenever there is a goal — the count that used to sit
                beside it repeated what the deck says on its own first card,
                and a badge that is nearly always showing stops being news. */}
            <Touchable
              className="h-10 w-10 items-center justify-center border border-border"
              onPress={hasGoal && dueCount > 0 ? onOpenDeck : undefined}
              accessibilityRole="button"
              accessibilityLabel={
                dueCount > 0 ? `Log today, ${dueCount} to go` : 'Nothing due today'
              }
            >
              <ListTodo
                size={iconSize.default}
                color={asColor(hasGoal && dueCount > 0 ? primary : mutedForeground)}
                strokeWidth={2}
              />
            </Touchable>

            <Touchable
              className="h-10 w-10 items-center justify-center border border-border"
              onPress={hasGoal ? onOpenPlanner : undefined}
              accessibilityRole="button"
              accessibilityLabel="Planner"
            >
              <CalendarDays
                size={iconSize.default}
                color={asColor(hasGoal ? primary : mutedForeground)}
                strokeWidth={2}
              />
            </Touchable>

            <Touchable
              className="h-10 w-10 items-center justify-center border border-border"
              onPress={hasGoal ? onOpenInsights : undefined}
              accessibilityRole="button"
              accessibilityLabel="Insights"
            >
              <TrendingUp
                size={iconSize.default}
                color={asColor(hasGoal ? primary : mutedForeground)}
                strokeWidth={2}
              />
            </Touchable>
          </>
        )}

        {/* Both modes. A Compass conversation is a chat with its own history,
            so the way back into an earlier one is the same control in the
            same place rather than something Compass invents for itself.
            Hidden only where Compass has no server to reach, alongside the
            three controls above it, since none of them can do anything then. */}
        {mode === 'compass' && unavailable ? null : (
          <Touchable
            className="h-10 w-10 items-center justify-center border border-border"
            onPress={onOpenHistory}
            accessibilityRole="button"
            accessibilityLabel={mode === 'compass' ? 'Past conversations' : 'Chat history'}
          >
            <History
              size={iconSize.default}
              color={asColor(onOpenHistory ? mutedForeground : surfaceTertiary)}
              strokeWidth={2}
            />
          </Touchable>
        )}

        <View className="flex-1" />

        {showStop ? (
          <Touchable
            className="h-10 w-10 items-center justify-center bg-surface-tertiary"
            disabled={isStopping}
            onPress={() => {
              setIsStopping(true);
              onStop?.();
            }}
          >
            <Square size={16} color={asColor(foreground)} fill={asColor(foreground)} />
          </Touchable>
        ) : (
          <Touchable
            className={cn('h-10 w-10 items-center justify-center bg-primary', !canSend && 'bg-surface-tertiary')}
            onPress={canSend ? onSend : undefined}
          >
            <Send size={18} color={asColor(canSend ? primaryForeground : mutedForeground)} />
          </Touchable>
        )}
      </View>
    </View>
  );
}
