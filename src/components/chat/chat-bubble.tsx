import React, { Fragment, useMemo } from 'react';
import { Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Renderer, useMarkdown } from 'react-native-marked';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { BookCard } from '@/components/chat/book-card';
import { HighlightCard } from '@/components/chat/highlight-card';
import { SuggestionCard } from '@/components/chat/suggestion-card';
import { Message } from '@/components/ui/message';
import { ThemedText } from '@/components/themed-text';
import { easing, fontFamily, motion, spacing } from '@/constants/theme';
import { asColor } from '@/utils/colors';

/** New bubbles rise and fade in rather than popping into the list —
 * fires once per bubble instance, so it plays for a freshly-sent or
 * freshly-streamed-in message and for one scrolled into view for the
 * first time, not on every re-render. Only played where a caller opts
 * in (`animateEntry`) with Reduce Motion off — a recycled list row must
 * never replay an entrance. */
const bubbleEntering = FadeInUp.duration(motion.base).easing(easing);

// Splits on the marker protocol Samwell is instructed to emit:
//   [[ref:highlight:hl-123]] / [[ref:thought:th-123]]  an existing entry, read-only
//   [[suggest:highlight:sugg-1]] / [[suggest:thought:sugg-1]]  a proposal, approve/reject
//   [[book:bk-123]]  a book from the library, shown with its cover
const MARKER_PATTERN = /\[\[(?:(ref|suggest):(highlight|thought)|(book)):([^\]]+)\]\]/g;

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToBook?: (bookId: string) => void;
  /** Play the rise-and-fade entrance. Off by default: the per-session chat
   * renders bubbles in a recycled FlashList, where replaying the entrance
   * on recycled rows violates the no-entering-on-recycled-rows motion law —
   * only callers whose transcript is a plain, non-recycled ScrollView opt
   * in. Skipped under Reduce Motion regardless. */
  animateEntry?: boolean;
}

/*
 * List rows, drawn here rather than by the library.
 *
 * `react-native-marked` renders lists through `@jsamr/react-native-li`, and
 * on this screen that path left a large block of empty space below the last
 * line of any message containing a list — measured at 405px on a four-item
 * list, against 34px (the correct margin) once the same text was rendered as
 * plain paragraphs. The space is trailing rather than between items, so it
 * reads as the bubble having a huge bottom margin. Nothing in our own styles
 * caused it: stripping every custom style left the gap in place and made it
 * larger.
 *
 * Overriding `list` is the narrow fix — a marker and the item content in a
 * row, which is all the library's version does visually — and it takes the
 * dependency out of the layout entirely. Everything else still renders
 * through the stock `Renderer`.
 */
const LIST_ROW: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start' };
/** Wide enough for "10." before it wraps; right-aligned so the dots line up. */
const LIST_MARKER: TextStyle = { minWidth: 22, paddingRight: 8, textAlign: 'right' };
const LIST_CONTENT: ViewStyle = { flex: 1 };

class ChatMarkdownRenderer extends Renderer {
  list(
    ordered: boolean,
    li: React.ReactNode[],
    listStyle?: ViewStyle,
    textStyle?: TextStyle,
    startIndex = 1,
  ): React.ReactNode {
    return (
      <View key={this.getKey()} style={listStyle}>
        {li.map((item, i) => (
          // Index keys: the item nodes are already built and this list is
          // rebuilt wholesale whenever the markdown changes.
          <View key={i} style={LIST_ROW}>
            <Text style={[textStyle, LIST_MARKER]}>
              {ordered ? `${startIndex + i}.` : '\u2022'}
            </Text>
            <View style={LIST_CONTENT}>{item}</View>
          </View>
        ))}
      </View>
    );
  }
}

function MarkdownSegment({ content, streaming }: { content: string; streaming?: boolean }) {
  // Literal colours for react-native-marked's theme object — a third-party
  // API that takes values, not classNames.
  const [foreground, primary, surfaceTertiary] = useCSSVariable([
    '--color-foreground',
    '--color-primary',
    '--color-surface-tertiary',
  ]);

  // Per mount rather than module scope: the base class keeps a slug cache
  // that would otherwise grow for the life of the session.
  const renderer = useMemo(() => new ChatMarkdownRenderer(), []);

  const elements = useMarkdown(streaming ? content + ' ▍' : content, {
    renderer,
    styles: {
      // Without this the library's own 16/24 applies to list markers and
      // item text, so a list read a size larger than the prose around it.
      li: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
      text: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
      /*
       * `paddingVertical: 0` is doing real work here, not tidying.
       *
       * react-native-marked builds each style as
       * `StyleSheet.flatten([libraryDefault, userStyles[token]])`, and its
       * default paragraph is `{ paddingVertical: 8 }`. Padding and margin are
       * different keys, so setting only margins here does not replace it — the
       * 8 survives underneath. Every paragraph was therefore carrying 8 above
       * and 8 below on top of this margin: 20 units of gap where 4 was meant,
       * repeated for every block in the reply. In a message built from a
       * numbered list with a card after each entry, that is most of the
       * whitespace on screen.
       *
       * Zeroing it puts the rhythm back under this file's control, so the
       * margin below is the only spacing a paragraph contributes.
       */
      paragraph: { paddingVertical: 0, marginTop: 0, marginBottom: spacing[1] },
      h1: { fontFamily: fontFamily.sansBold, fontSize: 17, marginBottom: spacing[1], marginTop: spacing[1] },
      h2: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, marginBottom: spacing[1], marginTop: spacing[1] },
      h3: { fontFamily: fontFamily.sansSemiBold, fontSize: 15, marginBottom: 2, marginTop: spacing[1] },
      codespan: { fontFamily: 'monospace', fontSize: 13 },
      code: { padding: spacing[3], marginVertical: spacing[1] },
      blockquote: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], marginVertical: spacing[1] },
      list: { marginVertical: spacing[1] },
      hr: { marginVertical: spacing[2] },
    },
    theme: {
      colors: {
        // react-native-marked's theme demands a definite ColorValue (no
        // `undefined`); the tokens are declared in every theme, so they
        // always resolve and the assertions hold.
        code: asColor(surfaceTertiary)!,
        link: asColor(primary)!,
        text: asColor(foreground)!,
        border: asColor(surfaceTertiary)!,
      },
    },
  });

  return (
    <View>
      {elements.map((el, i) => <Fragment key={i}>{el}</Fragment>)}
    </View>
  );
}

const AssistantContent = React.memo(function AssistantContent({
  content,
  streaming,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
}: {
  content: string;
  streaming?: boolean;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToBook?: (bookId: string) => void;
}) {
  // Split content into text segments and reference/suggestion markers
  const segments = useMemo(() => {
    if (!content.includes('[[ref:') && !content.includes('[[suggest:') && !content.includes('[[book:')) {
      return null; // Fast path: no markers, render as plain markdown
    }

    const parts: (
      | { kind: 'text'; text: string }
      | { kind: 'ref'; type: 'highlight' | 'thought'; id: string }
      | { kind: 'suggest'; type: 'highlight' | 'thought'; id: string }
      | { kind: 'book'; id: string }
    )[] = [];
    let lastIndex = 0;

    // Reset regex state
    MARKER_PATTERN.lastIndex = 0;
    let match;
    while ((match = MARKER_PATTERN.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ kind: 'text', text: content.slice(lastIndex, match.index) });
      }
      parts.push(
        match[3] === 'book'
          ? { kind: 'book', id: match[4] }
          : {
              kind: match[1] as 'ref' | 'suggest',
              type: match[2] as 'highlight' | 'thought',
              id: match[4],
            },
      );
      lastIndex = MARKER_PATTERN.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push({ kind: 'text', text: content.slice(lastIndex) });
    }

    return parts;
  }, [content]);

  // No refs — render plain markdown
  if (!segments) {
    return <MarkdownSegment content={content} streaming={streaming} />;
  }

  return (
    <View>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          const isLast = i === segments.length - 1;
          return (
            <MarkdownSegment
              key={i}
              content={seg.text}
              streaming={isLast ? streaming : false}
            />
          );
        }
        if (seg.kind === 'book') {
          return <BookCard key={`book-${seg.id}`} id={seg.id} onNavigate={onNavigateToBook} />;
        }
        if (seg.kind === 'suggest') {
          return <SuggestionCard key={`suggest-${seg.type}-${seg.id}`} id={seg.id} kind={seg.type} />;
        }
        return (
          <HighlightCard
            key={`${seg.type}-${seg.id}`}
            id={seg.id}
            type={seg.type}
            onNavigate={onNavigateToHighlight}
            onNavigateToTimeline={onNavigateToTimeline}
          />
        );
      })}
    </View>
  );
});

export const ChatBubble = React.memo(function ChatBubble({
  role,
  content,
  streaming,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
  animateEntry,
}: ChatBubbleProps) {
  // Literal colour for ThemedText's `color` prop — the streaming cursor only;
  // everything else reads its colour from Message's align-driven classes.
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const isUser = role === 'user';
  // Reduce Motion collapses the spatial entrance to nothing — content just
  // appears (opacity-only cross-fades remain the reduced-motion vocabulary
  // elsewhere).
  const reduceMotion = useReducedMotion();

  return (
    // The Reanimated wrapper keeps its inline layout style (the row padding
    // and rhythm the transcript's ScrollView sits around); the bubble shell
    // inside it is PanelUI Message, so its surfaces land there as classes.
    <Animated.View
      entering={animateEntry && !reduceMotion ? bubbleEntering : undefined}
      style={{ marginBottom: spacing[1], paddingHorizontal: spacing[4] }}
    >
      <Message align={isUser ? 'end' : 'start'}>
        <Message.Content>
          <Message.Bubble>
            {isUser ? (
              <Message.BubbleContent style={{ fontFamily: fontFamily.sans, lineHeight: 22 }}>
                {content}
                {streaming && (
                  <ThemedText type="bodyMd" color={asColor(mutedForeground)}>{' ▍'}</ThemedText>
                )}
              </Message.BubbleContent>
            ) : (
              <AssistantContent
                content={content}
                streaming={streaming}
                onNavigateToHighlight={onNavigateToHighlight}
                onNavigateToTimeline={onNavigateToTimeline}
                onNavigateToBook={onNavigateToBook}
              />
            )}
          </Message.Bubble>
        </Message.Content>
      </Message>
    </Animated.View>
  );
});
