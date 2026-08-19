import React, { useState } from 'react';
import { View } from 'react-native';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { easing, fontFamily, motion, spacing } from '@/constants/theme';
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
      <Animated.View
        layout={LinearTransition.duration(motion.base).easing(easing)}
        style={{
          alignSelf: 'flex-start',
          maxWidth: '85%',
          backgroundColor: colors.surface.mid,
          borderLeftWidth: 2,
          borderLeftColor: colors.primary.default,
          overflow: 'hidden',
        }}
      >
        <Touchable onPress={() => setExpanded((v) => !v)}>
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
        </Touchable>
        {expanded && (
          <Animated.View
            entering={FadeIn.duration(motion.base).easing(easing)}
            exiting={FadeOut.duration(motion.fast).easing(easing)}
            style={{ paddingHorizontal: spacing[2], paddingBottom: spacing[2] }}
          >
            <ThemedText
              type="bodySm"
              color={colors.text.secondary}
              style={{ fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 20 }}
            >
              {content}
            </ThemedText>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}
