import { useRouter } from 'expo-router';
import React from 'react';

import { ThemedView } from '@/components/themed-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConciergeSignInSheet } from '@/features/onboarding/components/concierge-sign-in-sheet';
import { OnboardingConversation } from '@/features/onboarding/components/onboarding-conversation';
import { WelcomeScreen } from '@/features/onboarding/components/welcome-screen';
import { useAccountStore } from '@/stores/account';
import { hasOnboardingSession, useOnboardingChatStore } from '@/stores/onboarding-chat';
import { useSettingsStore } from '@/stores/settings';

/**
 * The first run: which of the two doors, and what happens after.
 *
 * Two stages rather than two routes. The welcome screen and the conversation
 * are one continuous moment — nobody should be able to press Back out of the
 * conversation and land on the two doors they already chose between — and a
 * stage in state says that more honestly than a route with its history
 * suppressed.
 *
 * Which stage is not decided by a flag anybody writes down. If a concierge
 * conversation exists on this device, that IS the answer, whatever the app was
 * doing when it last closed. It closes routinely mid-flow: the Android folder
 * picker is a system activity, and Open Citadel goes to the background behind
 * it.
 *
 * This component subscribes to nothing that changes during a turn, which is
 * deliberate — everything a streaming reply touches lives in
 * `OnboardingConversation`, so tokens never reach this far up.
 */
export function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Read once, on mount, from SQLite. A conversation already on disk means the
  // doors have been walked through.
  const [stage, setStage] = React.useState<'welcome' | 'chat'>(() =>
    hasOnboardingSession() ? 'chat' : 'welcome',
  );
  const [signingIn, setSigningIn] = React.useState(false);

  const accountStatus = useAccountStore((s) => s.status);
  const finishOnboarding = useSettingsStore((s) => s.finishOnboarding);

  const leaveForLibrary = React.useCallback(() => {
    // `replace`, never `push`. Onboarding is behind them and the system Back
    // button must not walk into it.
    router.replace('/');
  }, [router]);

  /**
   * Opening the conversation, from either direction.
   *
   * `samwellMode` becomes cloud here and nowhere earlier, because this is the
   * moment it becomes true: the concierge IS cloud Samwell, and leaving the app
   * in offline mode would have `useSamwellReadiness` report `offlineMode` on
   * the Samwell page immediately afterwards.
   */
  const openConversation = React.useCallback(() => {
    const settings = useSettingsStore.getState();
    void settings.setSamwellMode('cloud');

    /*
     * The account name, read from the store rather than from a render's
     * closure, and copied into settings so the rest of the app knows what to
     * call them without asking again.
     *
     * The sheet calls this the instant `signIn` resolves, which is before React
     * has re-rendered with the new profile — so a subscribed `name` up here
     * would still be whatever it was before the browser opened. The account
     * card documents being bitten by exactly this.
     */
    const name = useAccountStore.getState().name;
    if (name && !settings.username) void settings.setUsername(name);

    setSigningIn(false);
    setStage('chat');
    void useOnboardingChatStore.getState().start();
  }, []);

  const handleConcierge = React.useCallback(() => {
    // Already signed in, so there is nothing to ask for. This is the reinstall
    // case, and a sign-in sheet in front of it would be asking somebody to sign
    // in to the account they are already using.
    if (accountStatus === 'signedIn') openConversation();
    else setSigningIn(true);
  }, [accountStatus, openConversation]);

  const handleTinker = React.useCallback(async () => {
    await finishOnboarding();
    leaveForLibrary();
  }, [finishOnboarding, leaveForLibrary]);

  if (stage === 'chat') return <OnboardingConversation onDone={leaveForLibrary} />;

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <WelcomeScreen onConcierge={handleConcierge} onTinker={() => void handleTinker()} />
      <ConciergeSignInSheet
        visible={signingIn}
        onClose={() => setSigningIn(false)}
        onSignedIn={openConversation}
      />
    </ThemedView>
  );
}
