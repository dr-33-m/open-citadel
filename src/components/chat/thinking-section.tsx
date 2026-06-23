import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

interface ThinkingSectionProps {
  content: string;
}

export function ThinkingSection({ content }: ThinkingSectionProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <View style={{ paddingHorizontal: spacing[4], marginBottom: spacing[1] }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={{
          alignSelf: 'flex-start',
          maxWidth: '85%',
          backgroundColor: colors.surface.mid,
          borderLeftWidth: 2,
          borderLeftColor: colors.primary.default,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[1],
            paddingVertical: spacing[1],
            paddingHorizontal: spacing[2],
          }}
        >
          <Sparkles size={12} color={colors.text.secondary} />
          <ThemedText type="labelSm" color={colors.text.secondary}>
            Thinking
          </ThemedText>
          {expanded ? (
            <ChevronUp size={12} color={colors.text.secondary} />
          ) : (
            <ChevronDown size={12} color={colors.text.secondary} />
          )}
        </View>
        {expanded && (
          <View style={{ paddingHorizontal: spacing[2], paddingBottom: spacing[2] }}>
            <ThemedText
              type="bodySm"
              color={colors.text.secondary}
              style={{ fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 20 }}
            >
              {content}
            </ThemedText>
          </View>
        )}
      </Pressable>
    </View>
  );
}
