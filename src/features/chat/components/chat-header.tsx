/**
 * The bar over a conversation with Samwell.
 *
 * Two states, and which one shows is decided by whether the conversation has
 * a name yet:
 *
 * **Before there is a conversation** there is nothing to name but the surface,
 * so the title is the mode's own name ("Chat", or "Compass") and it sits
 * centred — a short fixed string is what centring is *for*, and centred is how
 * the rest of the app's headers read. It names the mode rather than Samwell
 * because he is on both halves of this screen.
 *
 * **Once a chat exists** the title becomes whatever it turned out to be
 * about, which is a sentence fragment that runs long and truncates. That
 * moves to the leading edge, where it starts at the same gutter as the
 * messages below it and clips at one end instead of two.
 *
 * Both surfaces render this. They previously kept their own copies that had
 * already drifted apart in title fallbacks and in whether the status line was
 * centred, which is the drift this file exists to stop. Compass used to sit
 * outside it on a fixed "Compass" bar, from back when a Compass conversation
 * was not something you could name or return to.
 */
import { ChevronLeft, Settings } from '@/components/icons';
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ModelStatusBar } from '@/components/chat/model-status-bar';
import { ThemedText } from '@/components/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Touchable } from '@/components/ui/touchable';
import { iconSize } from '@/constants/theme';
import { asColor } from '@/utils/colors';

export interface ChatHeaderProps {
  /** The conversation's name, or null before it has one. */
  title: string | null;
  /** What the bar says before the conversation has a name of its own. */
  fallbackTitle?: string;
  /** The book this chat is grounded in, if any. */
  bookTitle?: string | null;
  /** Where back goes, named for the screen reader. */
  onBack: () => void;
  backLabel: string;
  /** Opens the book at the passage the chat is anchored to. Omit to render it
   *  as a plain label rather than a target. */
  onOpenBook?: () => void;
  /** Tapping the status dot wakes the local model. */
  onWakeSamwell: () => void;
  onOpenSettings: () => void;
}

export function ChatHeader({
  title,
  fallbackTitle = 'Chat',
  bookTitle,
  onBack,
  backLabel,
  onOpenBook,
  onWakeSamwell,
  onOpenSettings,
}: ChatHeaderProps) {
  const [foreground, primary] = useCSSVariable(['--color-foreground', '--color-primary']);

  const named = title != null && title.length > 0;

  return (
    <ScreenHeader
      title={named ? title : fallbackTitle}
      align={named ? 'start' : 'center'}
      leftIcon={<ChevronLeft size={iconSize.default} color={asColor(foreground)} />}
      leftLabel={backLabel}
      onLeftPress={onBack}
      rightIcon={<Settings size={iconSize.default} color={asColor(foreground)} />}
      rightLabel="Settings"
      onRightPress={onOpenSettings}
    >
      {/* Only once there is a conversation. Before that the bar is just
          Samwell's name, and a status line under it described a session that
          did not exist yet — his readiness is worth saying about a chat you
          are in, not as a greeting. The book you have picked is already shown
          on the input card below, so nothing is lost by holding this back.

          "wrap" so a long book name drops to its own line instead of shoving
          Samwell's status off the edge — his name is "Grand Maester Samwell"
          in cloud mode, which is most of the row on its own. */}
      {named ? (
        <View className="w-full flex-row flex-wrap items-center justify-start gap-2">
          <ModelStatusBar onPress={onWakeSamwell} />
          {bookTitle ? (
            <BookBadge title={bookTitle} onPress={onOpenBook} color={asColor(primary)} />
          ) : null}
        </View>
      ) : null}
    </ScreenHeader>
  );
}

/** The book a chat is anchored to. A target when there is a passage to return
 *  to, plain text when there is not — a pressable that goes nowhere is worse
 *  than a label. */
function BookBadge({
  title,
  onPress,
  color,
}: {
  title: string;
  onPress?: () => void;
  color: string | undefined;
}) {
  const label = (
    <ThemedText type="labelSm" color={color} numberOfLines={1}>
      {title}
    </ThemedText>
  );

  if (!onPress) {
    return <View className="max-w-[55%] px-2 py-[2px]">{label}</View>;
  }

  return (
    <Touchable
      className="max-w-[55%] bg-muted px-2 py-[2px]"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      {label}
    </Touchable>
  );
}
