import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ArrowRight, ChevronDown } from '@/components/icons';
import { SquareArtwork } from '@/components/square-artwork';
import { ThemedText } from '@/components/themed-text';
import { Popover } from '@/components/ui/popover';
import { Touchable } from '@/components/ui/touchable';
import type { BookKind } from '@/db/schema';
import { ATTACHMENT_KINDS } from '@/features/chat/components/attachment-kinds';
import { asColor } from '@/utils/colors';

/** The kind's glyph, at the cap height of the 11pt status line it sits in. */
const MARK_ICON = 13;
const MARK_CHEVRON = 11;
/** Reaches the 44pt a finger needs without growing the line it sits in. */
const MARK_SLOP = { top: 14, bottom: 14, left: 10, right: 14 } as const;
/** Room for a title on two lines beside its artwork, never the screen. */
const PANEL_WIDTH = 280;
/** Artwork height. A book's cover keeps its 2:3, a show's art is square. */
const ART = 52;
/** The serif a step under `headlineSm`: a title in a panel, not a heading. */
const TITLE = { fontSize: 16, lineHeight: 21 } as const;
/** Pulls the panel left so its arrow is not jammed against its corner. */
const ALIGN_OFFSET = -14;

export interface AttachmentPopoverProps {
  kind: BookKind;
  title: string;
  /** The cover or the show's art. Without one the kind's icon stands in. */
  cover?: string | null;
  /** The action's words (`ATTACHMENT_OPEN_LABEL`). */
  openLabel?: string | null;
  /** Opens the passage, the transcript or the book. Omit and the panel only says what it is. */
  onOpen?: () => void;
}

/**
 * What the chat is about, as a mark in the header that opens into the detail.
 *
 * The header used to carry the whole title of the book, post or episode as a
 * badge beside Samwell's status, and a title is a sentence: it wrapped onto a
 * line of its own and the bar under the chat's name grew to three lines.
 *
 * The mark is set as part of that line rather than as a control beside it: a
 * hairline, the kind's glyph and a chevron, in the line's own muted ink, so it
 * reads as one more thing the line says and the chevron says it opens. A boxed
 * button there stood out as the loudest thing in the bar (owner, 2026-11-10).
 *
 * The panel points back at it (the arrow, and the library's entrance unfolding
 * from the trigger) and is drawn like a card in miniature: the artwork and the
 * title, then one action as a row under a hairline, the way a popover's
 * commands are rows rather than a full-size button.
 */
export function AttachmentPopover({ kind, title, cover, openLabel, onOpen }: AttachmentPopoverProps) {
  const [primary, muted] = useCSSVariable(['--color-primary', '--color-muted-foreground']);
  const gold = asColor(primary);
  const ink = asColor(muted);
  const { icon: Icon, label } = ATTACHMENT_KINDS[kind];
  const aspect = kind === 'book' ? 2 / 3 : 1;
  const action = onOpen && openLabel ? { label: openLabel, onPress: onOpen } : null;

  return (
    <Popover>
      <Popover.Trigger>
        <Touchable
          className="flex-row items-center gap-1"
          hitSlop={MARK_SLOP}
          haptic="select"
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${title}`}
          accessibilityHint="Shows what this chat is about"
        >
          <Icon size={MARK_ICON} color={ink} strokeWidth={1.75} />
          <ChevronDown size={MARK_CHEVRON} color={ink} strokeWidth={2} />
        </Touchable>
      </Popover.Trigger>
      <Popover.Content
        placement="bottom"
        align="start"
        alignOffset={ALIGN_OFFSET}
        width={PANEL_WIDTH}
        className="gap-0 rounded-none p-0"
      >
        <Popover.Arrow />
        <View className="flex-row items-center gap-3 p-3">
          <SquareArtwork uri={cover ?? null} fallbackIcon={Icon} size={ART} aspect={aspect} />
          <View className="flex-1 gap-0.5">
            <ThemedText type="labelSm" color={ink}>
              {label}
            </ThemedText>
            <ThemedText type="headlineSm" style={TITLE} numberOfLines={2}>
              {title}
            </ThemedText>
          </View>
        </View>
        {action ? (
          <Popover.Close>
            <Touchable
              className="flex-row items-center justify-between border-t border-border px-3 py-3"
              haptic="select"
              accessibilityRole="button"
              onPress={action.onPress}
            >
              <ThemedText type="labelSm" color={gold}>
                {action.label}
              </ThemedText>
              <ArrowRight size={14} color={gold} strokeWidth={2} />
            </Touchable>
          </Popover.Close>
        ) : null}
      </Popover.Content>
    </Popover>
  );
}
