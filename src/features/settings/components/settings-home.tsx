import React from 'react';
import { View } from 'react-native';

import { Activity, AudioLines, BookOpen, Brain, MessageCircleHeart, MicSignal, Sun, User, ZodiacPisces } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Switch } from '@/components/ui/switch';
import { SectionLabel } from '@/features/settings/components/section-label';
import { SettingsRow } from '@/features/settings/components/settings-row';
import type { SettingsPane } from '@/features/settings/utils/panes';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type SettingsHomeProps = {
  /** The reader's name, or the invitation to add one. */
  name: string;
  /** Each row's one line of state. */
  summaries: Record<SettingsPane, string>;
  light: boolean;
  onLightChange: (light: boolean) => void;
  /** Whether the app sends how it performed (`usePerformanceSharing`), and its line. */
  sharing: boolean;
  sharingLine: string;
  /** Turning it on opens what it sends first; turning it off is at once. */
  onSharingChange: (sharing: boolean) => void;
  /** The "i": what is sent, and the choice. */
  onSharingInfo: () => void;
  onOpen: (destination: SettingsPane) => void;
  onOpenNote: () => void;
};

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </View>
  );
}

/**
 * The Settings list: what there is to set, each row already saying what it is
 * set to. Everything with controls in it is one press deeper, in a pane of
 * its own, so opening Settings shows a handful of rows rather than every
 * control the app has.
 *
 * Memoized: its props only change when a row's line of state does, and the
 * screen above it draws again on every press.
 */
export const SettingsHome = React.memo(function SettingsHome({
  name,
  summaries,
  light,
  onLightChange,
  sharing,
  sharingLine,
  onSharingChange,
  onSharingInfo,
  onOpen,
  onOpenNote,
}: SettingsHomeProps) {
  const tokens = useThemeTokens();
  const toggleLight = () => onLightChange(!light);
  const toggleSharing = () => onSharingChange(!sharing);

  return (
    <View className="gap-8">
      <SettingsRow icon={User} title={name} detail={summaries.profile} onPress={() => onOpen('profile')} />

      <Group label="SAMWELL">
        <SettingsRow
          icon={ZodiacPisces}
          title="Samwell"
          detail={summaries.samwell}
          onPress={() => onOpen('samwell')}
        />
        <SettingsRow
          icon={Brain}
          title="What Samwell knows"
          detail={summaries.memory}
          onPress={() => onOpen('memory')}
        />
      </Group>

      <Group label="READING AND LISTENING">
        <SettingsRow
          icon={AudioLines}
          title="Reading voice"
          detail={summaries.voice}
          onPress={() => onOpen('voice')}
        />
        <SettingsRow
          icon={MicSignal}
          title="Podcasts"
          detail={summaries.podcasts}
          onPress={() => onOpen('podcasts')}
        />
      </Group>

      <Group label="APP">
        <SettingsRow
          icon={Sun}
          title="Light mode"
          accessory={<Switch value={light} onValueChange={onLightChange} />}
          onPress={toggleLight}
        />
        <SettingsRow
          icon={Activity}
          title="Share app performance"
          detail={sharingLine}
          onInfo={onSharingInfo}
          accessory={<Switch value={sharing} onValueChange={onSharingChange} />}
          onPress={toggleSharing}
        />
        <SettingsRow
          icon={MessageCircleHeart}
          title="Community"
          detail="A note from Thamsanqa"
          opens="sheet"
          onPress={onOpenNote}
        />
      </Group>

      {/* Not a setting, so not a row: the one thing about books worth knowing. */}
      <View className="flex-row gap-3">
        <BookOpen size={16} color={tokens['--color-muted-foreground']} />
        <ThemedText type="bodySm" color={tokens['--color-muted-foreground']} className="flex-1">
          Open Citadel is EPUB-only. EPUB is the best format for knowledge capture. It supports themes, custom
          fonts, and text-to-speech.
        </ThemedText>
      </View>
    </View>
  );
});
