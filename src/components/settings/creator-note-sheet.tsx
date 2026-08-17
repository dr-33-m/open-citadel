import { MessageCircleHeart } from 'lucide-react-native';
import React from 'react';
import { Linking, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InstagramIcon, TikTokIcon } from '@/components/ui/brand-icons';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

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
  const colors = useColors();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, justifyContent: 'flex-end' },
        overlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
        },
        panel: {
          backgroundColor: colors.surface.low,
          paddingHorizontal: spacing[6],
          paddingTop: spacing[4],
          paddingBottom: spacing[10],
          maxHeight: '80%',
          gap: spacing[4],
        },
        grabber: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: 'center',
        },
        header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
        paragraphs: { gap: spacing[3] },
        socials: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing[4],
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.outline.variant,
          paddingTop: spacing[5],
        },
        socialButton: {
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.outline.variant,
        },
      }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Touchable style={styles.overlay} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <PrefixIcon icon={MessageCircleHeart} size={36} />
            <ThemedText type="headlineSm">Note from Thamsanqa Dreem</ThemedText>
          </View>
          <ScrollView contentContainerStyle={styles.paragraphs}>
            {NOTE_PARAGRAPHS.map((paragraph) => (
              <ThemedText key={paragraph} type="bodySm" color={colors.text.secondary}>
                {paragraph}
              </ThemedText>
            ))}
          </ScrollView>
          <View style={styles.socials}>
            {SOCIALS.map(({ label, url, Icon }) => (
              <Touchable key={label} style={styles.socialButton} onPress={() => Linking.openURL(url)}>
                <Icon size={24} />
              </Touchable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
