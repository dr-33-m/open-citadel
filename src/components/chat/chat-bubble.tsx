import React, { Fragment } from 'react';
import { View } from 'react-native';
import { useMarkdown } from 'react-native-marked';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const AssistantContent = React.memo(function AssistantContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
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
});

export const ChatBubble = React.memo(function ChatBubble({ role, content, streaming }: ChatBubbleProps) {
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
          <AssistantContent content={content} streaming={streaming} />
        )}
      </View>
    </View>
  );
});
