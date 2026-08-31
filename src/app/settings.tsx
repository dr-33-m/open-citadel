import React from 'react';
import { useCSSVariable } from 'uniwind';
import { ChevronDown } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageFade } from '@/components/scroll-fades';
import { AppearanceSection } from '@/features/settings/components/appearance-section';
import { BooksTipSection } from '@/features/settings/components/books-tip-section';
import { CompassSection } from '@/features/settings/components/compass-section';
import { ProfileSection } from '@/features/settings/components/profile-section';
import { ReachOutSection } from '@/features/settings/components/reach-out-section';
import { SamwellSection } from '@/features/settings/components/samwell-section';
import { TtsSection } from '@/features/settings/components/tts-section';
import { Handover } from '@/components/navigation/handover';
import { SettingsSkeleton } from '@/components/skeletons/settings-skeleton';
import { TransitionScrollView } from '@/components/navigation/transition-scroll';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, iconSize, layout } from '@/constants/theme';
import { backTo } from '@/navigation/navigate';
import { useScreenSettled } from '@/navigation/use-screen-settled';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';

/**
 * Settings.
 *
 * This file is composition only: the header, the scroll surface, and the
 * order of sections. Each section is a feature component under
 * `features/settings/` that owns its store slices and its sheets — the
 * route holds no screen state, so nothing here re-renders when a section
 * changes.
 *
 * Sections arrive in two waves. The above-fold four mount with the body and
 * cascade during the drawer's rise; the rest mount after the drawer lands
 * (see `useScreenSettled`), so no commit competes with the transition and
 * the below-fold content fills in as you arrive.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [foreground] = useCSSVariable(['--color-foreground']);
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const settled = useScreenSettled();

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      {/* A drawer, so the way out points the way it will go: down. The same
          movement dismisses it by hand — drag anywhere in this band (see
          `navigation/transitions`). */}
      <ScreenHeader
        title="Settings"
        leftIcon={<ChevronDown size={iconSize.default} color={asColor(foreground)} />}
        leftLabel="Close settings"
        onLeftPress={() => backTo(router, '/')}
      />

      {/* Held until the drawer has settled, not merely a frame past the shell.
          A commit this size landing mid-rise competes with the transition for
          the UI thread and stalls it partway, which reads as the drawer
          stuttering near the top rather than as a slow screen. The placeholder
          covers the wait (see `Handover`). */}
      <Handover
        ready={settled}
        skeleton={
          <View
            className="flex-1 px-6"
            style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
          >
            <SettingsSkeleton />
          </View>
        }
      >
        {/* Replaces the header's bottom rule — see library-page. */}
        <PageFade>
          <TransitionScrollView
            className="flex-1 px-6"
            style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
            contentContainerStyle={{
              paddingBottom: layout.scrollBottom + insets.bottom,
            }}
            showsVerticalScrollIndicator={false}
          >
            <ProfileSection />

            <AppearanceSection />

            <BooksTipSection />

            <SamwellSection />

            {/* Compass is cloud-only: check-ins run through Grand Maester
                Samwell on the server. */}
            {samwellMode === 'cloud' && settled && <CompassSection />}

            {settled && <TtsSection />}

            {settled && <ReachOutSection />}
          </TransitionScrollView>
        </PageFade>
      </Handover>
    </ThemedView>
  );
}
