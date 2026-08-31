import { LibraryBig } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { easing, motion, popIn } from '@/constants/theme';

type DirectoryPromptProps = {
  onPress: () => void;
};

// iOS brings books into an app-owned folder via the picker; Android references
// EPUBs in place from a folder the user selects.
const COPY =
  process.env.EXPO_OS === 'ios'
    ? {
        description:
          'Add your EPUB books and Open Citadel organizes them for you.',
        button: 'GET STARTED',
      }
    : {
        description:
          'Select the folder on your device where your ebooks are stored. The app will sync all .epub files from that folder.',
        button: 'SELECT FOLDER',
      };

/** ThemedText/lucide icons take a literal color, not a className. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function DirectoryPrompt({ onPress }: DirectoryPromptProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);

  return (
    <View className="flex-1 items-center justify-center gap-5 px-10">
      <Animated.View
        entering={popIn(motion.base)}
        style={{ marginBottom: 16 }}
      >
        <LibraryBig size={48} color={asColor(primary)} />
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(motion.base).easing(easing).delay(80)}>
        <ThemedText type="headlineLg" className="text-center">
          Build Your Library
        </ThemedText>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(motion.base).easing(easing).delay(140)}>
        <ThemedText
          type="bodyMd"
          color={asColor(mutedForeground)}
          style={{ textAlign: 'center', lineHeight: 24 }}
        >
          {COPY.description}
        </ThemedText>
      </Animated.View>

      <Animated.View
        entering={FadeInUp.duration(motion.base).easing(easing).delay(200)}
        style={{ marginTop: 24, alignSelf: 'stretch' }}
      >
        <GoldButton label={COPY.button} onPress={onPress} />
      </Animated.View>
    </View>
  );
}
