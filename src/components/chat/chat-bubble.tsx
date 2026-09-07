import { EnrichedMarkdownText } from 'react-native-enriched-markdown';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { BookCard } from '@/components/chat/book-card';
import { HighlightCard } from '@/components/chat/highlight-card';
import { SuggestionCard } from '@/components/chat/suggestion-card';
import { Message } from '@/components/ui/message';
import { ThemedText } from '@/components/themed-text';
import { easing, fontFamily, motion, spacing } from '@/constants/theme';
import { useMarkdownStyle } from '@/hooks/use-markdown-style';
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

function MarkdownSegment({ content, streaming }: { content: string; streaming?: boolean }) {
  const markdownStyle = useMarkdownStyle({ voice: 'sans', fontSize: 15, lineHeight: 22 });

  return (
    /*
     * One native text view, not a tree of RN views.
     *
     * `streamingAnimation` fades only the tail — the characters beyond what
     * was already rendered — which is why the old `content + ' ▍'` caret is
     * gone. That caret existed to show the reply was still coming while the
     * whole block re-rendered on every token; the library animates the
     * arrival itself, so the block cursor was standing in for motion that now
     * happens for real.
     *
     * `commonmark` rather than `github`: the GitHub flavour renders fenced
     * code as a separate scrolling pane with a header bar and copy button,
     * which is a lot of chrome for a reading companion who never emits code.
     * CommonMark keeps a code block inside the same text view, where it wraps.
     */
    <EnrichedMarkdownText
      markdown={content}
      markdownStyle={markdownStyle}
      flavor="commonmark"
      streamingAnimation={streaming}
      selectable
    />
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
