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
import { ScreenHeader } from '@/components/ui/screen-header';
import { iconSize } from '@/constants/theme';
import type { BookKind } from '@/db/schema';
import { AttachmentPopover } from '@/features/chat/components/attachment-popover';
import { asColor } from '@/utils/colors';

export interface ChatHeaderProps {
  /** The conversation's name, or null before it has one. */
  title: string | null;
  /** What the bar says before the conversation has a name of its own. */
  fallbackTitle?: string;
  /** The book, post or episode this chat is about, if any. */
  attachment?: {
    kind: BookKind;
    title: string;
    cover: string | null;
    /** What its action says (`ATTACHMENT_OPEN_LABEL`), or null for none. */
    openLabel: string | null;
  } | null;
  /** Opens it: the passage, the transcript or the book. Omit and its
   *  popover only says what it is. */
  onOpenAttachment?: () => void;
  /** Where back goes, named for the screen reader. */
  onBack: () => void;
  backLabel: string;
  /** Tapping the status dot wakes the local model. */
  onWakeSamwell: () => void;
  onOpenSettings: () => void;
}

export function ChatHeader({
  title,
  fallbackTitle = 'Chat',
  attachment,
  onBack,
  backLabel,
  onOpenAttachment,
  onWakeSamwell,
  onOpenSettings,
}: ChatHeaderProps) {
  const [foreground] = useCSSVariable(['--color-foreground']);

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
          did not exist yet. The book you have picked is already shown in the
          toolbox below, so nothing is lost by holding this back.

          One line, always: Samwell's status, then the mark of what the chat
          is about. The title of the book or episode used to sit here in full
          and wrapped the bar onto a third line; it now opens from the mark
          (`AttachmentPopover`). */}
      {named ? (
        <View className="w-full flex-row items-center gap-2.5">
          <ModelStatusBar onPress={onWakeSamwell} />
          {attachment ? (
            <>
              {/* A hairline between what Samwell is and what the chat is
                  about: two facts on one line, not one run-on label. */}
              <View className="h-2.5 w-px bg-border" />
              <AttachmentPopover
                kind={attachment.kind}
                title={attachment.title}
                cover={attachment.cover}
                openLabel={attachment.openLabel}
                onOpen={onOpenAttachment}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </ScreenHeader>
  );
}
