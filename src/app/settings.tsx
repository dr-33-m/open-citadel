import React from 'react';
import { useCSSVariable } from 'uniwind';
import { ChevronDown } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, type ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageFade } from '@/components/scroll-fades';
import { AppearanceSection } from '@/features/settings/components/appearance-section';
import { BooksTipSection } from '@/features/settings/components/books-tip-section';
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
  const settled = useScreenSettled();

  /**
   * Arriving pointed at a section, from the "set Samwell up" way out of an
   * empty chat.
   *
   * The scroll waits for `settled` and then animates. Both halves matter: run
   * it during the drawer's rise and it competes with the transition for the UI
   * thread, and jump to the offset outright and the reader lands somewhere
   * with no idea what they travelled past.
   */
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = React.useRef<ScrollView>(null);
  const scrolled = React.useRef(false);
  /**
   * Where each named section starts, filled in by its own `onLayout`.
   *
   * Measured rather than assumed. Profile is the first section today and a
   * scroll to zero would look right for exactly as long as that stays true,
   * which is the sort of thing that stays true until it quietly does not.
   */
  const sectionY = React.useRef<Record<string, number>>({});

  const scrollToSection = React.useCallback((name: string) => {
    const y = sectionY.current[name];
    if (y == null) return;
    // A little above it, so the section's own label is not welded to the
    // top edge and you can see it has something above it.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, []);

  const revealSection = React.useCallback(() => {
    if (scrolled.current || !settled || !section) return;
    if (sectionY.current[section] == null) return;
    scrolled.current = true;
    scrollToSection(section);
  }, [section, settled, scrollToSection]);

  React.useEffect(revealSection, [revealSection]);

  /** The cloud panel's "sign in" way out, one section up the same screen. */
  const revealAccount = React.useCallback(() => scrollToSection('account'), [scrollToSection]);

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
            ref={scrollRef}
            className="flex-1 px-6"
            style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
            contentContainerStyle={{
              paddingBottom: layout.scrollBottom + insets.bottom,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              onLayout={(e) => {
                sectionY.current.account = e.nativeEvent.layout.y;
                revealSection();
              }}
            >
              <ProfileSection />
            </View>

            <AppearanceSection />

            <BooksTipSection />

            <View
              onLayout={(e) => {
                sectionY.current.samwell = e.nativeEvent.layout.y;
                revealSection();
              }}
            >
              <SamwellSection onRequestAccount={revealAccount} />
            </View>

            {settled && <TtsSection />}

            {settled && <ReachOutSection />}
          </TransitionScrollView>
        </PageFade>
      </Handover>
    </ThemedView>
  );
}
