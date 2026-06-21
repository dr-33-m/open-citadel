import React, { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';

import { HighlightCard } from '@/components/chat/highlight-card';
import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

// Regex to split on [[ref:highlight:hl-123]] or [[ref:thought:th-123]]
const REF_PATTERN = /\[\[ref:(highlight|thought):([^\]]+)\]\]/g;

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
  // Split content into text segments and reference markers
  const segments = useMemo(() => {
    if (!content.includes('[[ref:')) {
      return null; // Fast path: no refs, render as plain markdown
    }

    const parts: Array<
      | { kind: 'text'; text: string }
      | { kind: 'ref'; type: 'highlight' | 'thought'; id: string }
    > = [];
    let lastIndex = 0;

    // Reset regex state
    REF_PATTERN.lastIndex = 0;
    let match;
    while ((match = REF_PATTERN.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ kind: 'text', text: content.slice(lastIndex, match.index) });
      }
      parts.push({
        kind: 'ref',
        type: match[1] as 'highlight' | 'thought',
        id: match[2],
      });
      lastIndex = REF_PATTERN.lastIndex;
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
    <View
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
    </View>
  );
});
