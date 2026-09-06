/**
 * The one sentence standing between the reader and a working chat, plus the
 * way out of it.
 *
 * This is `useSamwellReadiness` plus the two conditions that only exist once
 * a conversation is already running: a chat grown longer than the device can
 * hold, and a device out of memory. Readiness answers "can he run"; this
 * answers "why can't I talk to him, and what do I press".
 *
 * The order is the whole logic and it is not arbitrary — each test is a
 * precondition of the ones below it:
 *
 *   1. The device limits, which are about *this conversation* rather than the
 *      setup, and which only apply offline. Left ungated they kept showing
 *      after a switch to Cloud, where neither can happen.
 *   2. Cloud, which is either configured or is not; there is nothing local to
 *      download, wake or retry, so it returns before any of those are asked.
 *   3. Is there a model at all — "go to Settings", not "wake him up".
 *   4. Did loading fail, then is it loading, then is it merely asleep.
 *
 * Every state that is the reader's to fix carries an action. A message with
 * nowhere to go is a dead end, and both device limits have a real way out
 * (carry on in the cloud) that used to be the reader's job to guess.
 */
import React from 'react';

import type { SamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';

export interface SamwellStatusAction {
  label: string;
  onPress: () => void;
}

export interface SamwellStatus {
  /**
   * The wall, named in one line, with `message` saying what to do about it.
   *
   * Only the states that are a setup wall carry one. A transient state —
   * waking up, a retry — is a sentence about right now, and giving it a
   * heading would make a passing moment look like a place you have arrived.
   */
  title?: string;
  message: string;
  actions?: SamwellStatusAction[];
  /** Renders in the destructive colour — a failure, not a state. */
  isError?: boolean;
  /** Something is already happening; show a spinner instead of an icon. */
  isLoading?: boolean;
}

interface UseSamwellStatusArgs {
  readiness: SamwellReadiness;
  onOpenSettings: () => void;
  /** Starts a fresh conversation, for the "too long" way out. */
  onNewChat: () => void;
}

export function useSamwellStatus({
  readiness,
  onOpenSettings,
  onNewChat,
}: UseSamwellStatusArgs): SamwellStatus | null {
  const deviceLimit = useChatStore((s) => s.deviceLimit);
  const clearDeviceLimit = useChatStore((s) => s.clearDeviceLimit);
  const setSamwellMode = useSettingsStore((s) => s.setSamwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  /** Offering the cloud as a way out is only honest if there is a cloud. */
  const cloudConfigured = cloudBaseUrl.length > 0;

  const switchToCloud = React.useCallback(async () => {
    await setSamwellMode('cloud');
    // The limit belongs to the device run that hit it. Left set, the banner
    // survives the switch and Cloud opens showing a device error.
    clearDeviceLimit();
  }, [setSamwellMode, clearDeviceLimit]);

  /**
   * The escape hatch from a device limit.
   *
   * Both limits used to offer "SWITCH TO CLOUD" whether or not a cloud was
   * configured. Taking it in a build without one moved you from a chat that
   * had grown too long to "Grand Maester Samwell is not set up in this build
   * yet" — a message with no action on it at all — so the way out of the dead
   * end was itself a dead end. When there is no cloud to switch to, the
   * honest offer is the place where one gets set up.
   */
  const cloudEscape: SamwellStatusAction = cloudConfigured
    ? { label: 'SWITCH TO CLOUD', onPress: () => void switchToCloud() }
    : { label: 'SET UP CLOUD', onPress: onOpenSettings };

  const { ready, downloaded, loading, loadError, initContext, mode, cloudBlocker } = readiness;

  if (mode === 'offline' && deviceLimit === 'context') {
    return {
      message: 'This chat has grown too long for Samwell to hold on your device.',
      actions: [
        cloudEscape,
        {
          label: 'START NEW CHAT',
          onPress: () => {
            clearDeviceLimit();
            onNewChat();
          },
        },
      ],
    };
  }

  if (mode === 'offline' && deviceLimit === 'memory') {
    return {
      message: 'Your device is low on memory, so Samwell had to stop here.',
      actions: [cloudEscape],
    };
  }

  if (cloudBlocker === 'notConfigured') {
    // Also carried no action until now, which stranded anyone who reached it
    // — including from the device-limit banner above. Settings is where the
    // base URL is entered and where switching back offline lives, so it is
    // the way out of this either way.
    return {
      title: 'Samwell Cloud is not set up.',
      message: 'This build has no cloud server, so there is nothing to talk to yet.',
      actions: [{ label: 'OPEN SETTINGS', onPress: onOpenSettings }],
    };
  }

  if (cloudBlocker === 'needsAccount') {
    return {
      title: 'Grand Maester Samwell works from your account.',
      message: 'Sign in and he can pick up where you left off, on any device you read on.',
      actions: [{ label: 'SIGN IN', onPress: onOpenSettings }],
    };
  }

  if (mode === 'cloud') return null;

  if (!downloaded) {
    return {
      title: 'Samwell needs a model to run.',
      message: 'Tap button below to set up Samwell.',
      actions: [{ label: 'SET UP SAMWELL', onPress: onOpenSettings }],
    };
  }

  if (loadError) {
    return {
      message: loadError,
      actions: [{ label: 'RETRY', onPress: initContext }],
      isError: true,
    };
  }

  if (loading) {
    return { message: 'Waking Samwell up…', isLoading: true };
  }

  if (!ready) {
    return {
      title: 'Samwell is asleep.',
      message: 'Tap button below to wake him up.',
      actions: [{ label: 'WAKE UP', onPress: initContext }],
    };
  }

  return null;
}
