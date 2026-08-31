import { Image } from 'expo-image';
import { BookOpen, CalendarDays, Compass, Flag, Gauge, History, MessageSquare, Send, Square } from 'lucide-react-native';
import React from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { elevation, fontFamily, iconSize } from '@/constants/theme';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

type SamwellControlCenterProps = {
  mode: 'chat' | 'compass';
  /** Whether the Compass conversation is open over the Compass timeline. */
  compassOpen: boolean;
  compassPeek: boolean;
  onSelectMode: (mode: 'chat' | 'compass') => void;
  /** Held while Samwell is working. Switching mode mid-turn would swap the
   * screen out from under a reply that is still arriving, and in chat mode it
   * also risks a second caller reaching the engine. */
  lockMode?: boolean;
  onTogglePeek: () => void;
  text: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder: string;
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
  onOpenGoal?: () => void;
  onOpenMilestone?: () => void;
};

/**
 * The single input hub for the merged Chat/Compass screen — everything the
 * user does (send a message, switch mode, pick a book, open goal/milestone
 * detail) routes through this one surface.
 */
export function SamwellControlCenter({
  mode,
  lockMode,
  compassOpen,
  compassPeek,
  onSelectMode,
  onTogglePeek,
  text,
  onChangeText,
  onSend,
  busy,
  placeholder,
  showStop = false,
  onStop,
  showBookButton = true,
  pendingBookTitle,
  pendingBookCover,
  onOpenBookPicker,
  onClearBook,
  onOpenHistory,
  hasGoal,
  onOpenGoal,
  onOpenMilestone,
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
  const canSend = text.trim().length > 0 && !busy;
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
        className="max-h-[120px] min-h-[40px] px-2 py-2 text-[16px] text-foreground"
        style={{ fontFamily: fontFamily.sans, lineHeight: 24 }}
        multiline
        placeholder={placeholder}
        placeholderTextColor={asColor(mutedForeground)}
        value={text}
        onChangeText={onChangeText}
        editable={!busy}
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
            <Touchable
              className="h-10 w-10 items-center justify-center border border-border"
              onPress={onOpenHistory}
            >
              <History
                size={iconSize.default}
                color={asColor(onOpenHistory ? mutedForeground : surfaceTertiary)}
                strokeWidth={2}
              />
            </Touchable>
          </>
        )}

        {mode === 'compass' && (
          <>
            <Touchable
              className="h-10 w-10 items-center justify-center border border-border"
              onPress={hasGoal ? onOpenGoal : undefined}
            >
              <Flag size={iconSize.default} color={asColor(hasGoal ? primary : mutedForeground)} strokeWidth={2} />
            </Touchable>
            <Touchable
              className="h-10 w-10 items-center justify-center border border-border"
              onPress={hasGoal ? onOpenMilestone : undefined}
            >
              <Gauge size={iconSize.default} color={asColor(hasGoal ? primary : mutedForeground)} strokeWidth={2} />
            </Touchable>
            {compassOpen && (
              <Touchable
                key={compassPeek ? 'peek-on' : 'peek-off'}
                className={cn(
                  'h-10 w-10 items-center justify-center border',
                  compassPeek ? 'border-primary' : 'border-border',
                )}
                onPress={onTogglePeek}
              >
                <CalendarDays
                  size={iconSize.default}
                  color={asColor(compassPeek ? primary : mutedForeground)}
                  strokeWidth={2}
                />
              </Touchable>
            )}
          </>
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
