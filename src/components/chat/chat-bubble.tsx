import React, { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { HighlightCard } from '@/components/chat/highlight-card';
import { SuggestionCard } from '@/components/chat/suggestion-card';
import { ThemedText } from '@/components/themed-text';
import { easing, fontFamily, motion, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

/** New bubbles rise and fade in rather than popping into the list —
 * fires once per bubble instance, so it plays for a freshly-sent or
 * freshly-streamed-in message and for one scrolled into view for the
 * first time, not on every re-render. */
const bubbleEntering = FadeInUp.duration(motion.base).easing(easing);

// Regex to split on [[ref:highlight:hl-123]] / [[ref:thought:th-123]] (an
// existing entry, read-only) or [[suggest:highlight:sugg-1]] /
// [[suggest:thought:sugg-1]] (a proposed one, approve/reject).
const MARKER_PATTERN = /\[\[(ref|suggest):(highlight|thought):([^\]]+)\]\]/g;

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
}

function MarkdownSegment({ content, streaming }: { content: string; streaming?: boolean }) {
  const colors = useColors();

  const elements = useMarkdown(streaming ? content + ' ▍' : content, {
    styles: {
      text: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22 },
      paragraph: { marginTop: 0, marginBottom: spacing[1] },
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
        code: colors.surface.highest,
        link: colors.primary.default,
        text: colors.text.primary,
        border: colors.surface.highest,
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
}: {
  content: string;
  streaming?: boolean;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
}) {
  // Split content into text segments and reference/suggestion markers
  const segments = useMemo(() => {
    if (!content.includes('[[ref:') && !content.includes('[[suggest:')) {
      return null; // Fast path: no markers, render as plain markdown
    }

    const parts: Array<
      | { kind: 'text'; text: string }
      | { kind: 'ref'; type: 'highlight' | 'thought'; id: string }
      | { kind: 'suggest'; type: 'highlight' | 'thought'; id: string }
    > = [];
    let lastIndex = 0;

    // Reset regex state
    MARKER_PATTERN.lastIndex = 0;
    let match;
    while ((match = MARKER_PATTERN.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ kind: 'text', text: content.slice(lastIndex, match.index) });
      }
      parts.push({
        kind: match[1] as 'ref' | 'suggest',
        type: match[2] as 'highlight' | 'thought',
        id: match[3],
      });
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
}: ChatBubbleProps) {
  const colors = useColors();
  const isUser = role === 'user';

  return (
    <Animated.View
      entering={bubbleEntering}
      style={{
        flexDirection: 'row',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: spacing[1],
        paddingHorizontal: spacing[4],
      }}
    >
      <View
        style={{
          maxWidth: '82%',
          paddingVertical: spacing[2],
          paddingHorizontal: spacing[3],
          backgroundColor: isUser ? colors.primary.default : colors.surface.mid,
        }}
      >
        {isUser ? (
          <ThemedText type="bodyMd" color={colors.text.inverse} style={{ lineHeight: 22 }}>
            {content}
            {streaming && (
              <ThemedText type="bodyMd" style={{ color: colors.text.secondary }}>{' ▍'}</ThemedText>
            )}
          </ThemedText>
        ) : (
          <AssistantContent
            content={content}
            streaming={streaming}
            onNavigateToHighlight={onNavigateToHighlight}
            onNavigateToTimeline={onNavigateToTimeline}
          />
        )}
      </View>
    </Animated.View>
  );
});
