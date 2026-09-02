import { MessageCircleHeart } from '@/components/icons';
import React from 'react';
import { Linking, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { InstagramIcon, TikTokIcon } from '@/components/ui/brand-icons';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';

const NOTE_PARAGRAPHS = [
  "Open Citadel started as a tool I needed myself. If you're using it, we're probably chasing the same thing: real growth and real execution.",
  "I'd love to hear what's working, what isn't, and the ideas you'd like to see next. My DMs are always open.",
];

const SOCIALS = [
  { label: 'TikTok', url: 'https://www.tiktok.com/@_dr_33_m_', Icon: TikTokIcon },
  { label: 'Instagram', url: 'https://www.instagram.com/_dr_33_m_', Icon: InstagramIcon },
] as const;

export function CreatorNoteSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  // ThemedText's `color` prop takes a literal, never a className.
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const paragraphColor = typeof mutedForeground === 'string' ? mutedForeground : undefined;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-6 px-6">
        <View className="flex-row items-center gap-3">
          <PrefixIcon icon={MessageCircleHeart} size={36} />
          <ThemedText type="headlineSm">Note from Thamsanqa Dreem</ThemedText>
        </View>
        <View className="gap-3">
          {NOTE_PARAGRAPHS.map((paragraph) => (
            <ThemedText key={paragraph} type="bodySm" color={paragraphColor}>
              {paragraph}
            </ThemedText>
          ))}
        </View>
        <View className="flex-row justify-center gap-3 border-t border-border pt-5">
          {SOCIALS.map(({ label, url, Icon }) => (
            <Touchable
              key={label}
              className="h-12 w-12 items-center justify-center border border-border"
              onPress={() => Linking.openURL(url)}
            >
              <Icon size={24} />
            </Touchable>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
