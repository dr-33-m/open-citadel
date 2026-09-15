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

import {
    Cloud,
    CloudCog,
    LogIn,
    MessageSquarePlus,
    Power,
    RefreshCw,
    Settings,
    type LucideIcon,
} from '@/components/icons';
import type { SamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

export interface SamwellStatusAction {
  label: string;
  onPress: () => void;
  /**
   * The mark that leads the label, as every other button in the app carries
   * one. Optional on the type, present on every action here: a row where some
   * buttons are marked and some are not reads worse than either alone.
   */
  icon?: LucideIcon;
  /**
   * Drawn as the quiet outline button even when it comes first. Without it
   * the first action is the gold one, which is right for every row except one
   * that leads with a "learn more" before the way through.
   */
  secondary?: boolean;
}

/**
 * The way to a plan, wherever a missing plan is the wall.
 *
 * One definition because chat and Compass each spelled it out and had already
 * drifted: chat said SEE PLANS while Compass, one tab over and blocked by the
 * very same missing plan, said OPEN SETTINGS.
 */
export function seePlansAction(onPress: () => void): SamwellStatusAction {
  return { label: 'SEE PLANS', icon: CloudCog, onPress };
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
  /** Opens the Cloud panel without changing the saved engine mode. */
  onOpenPlans: () => void;
  /**
   * Settings, scrolled to the account rather than to Samwell.
   *
   * Its own callback because the destination differs by what is wrong. "SET
   * UP CLOUD" wants the engine section; "SIGN IN" wants the account card, and
   * sending it to Samwell left the reader looking at a panel whose only
   * advice was to sign in somewhere further up the page they had just been
   * scrolled past.
   */
  onOpenAccount: () => void;
  /** Starts a fresh conversation, for the "too long" way out. */
  onNewChat: () => void;
}

export function useSamwellStatus({
  readiness,
  onOpenSettings,
  onOpenPlans,
  onOpenAccount,
  onNewChat,
}: UseSamwellStatusArgs): SamwellStatus | null {
  const deviceLimit = useChatStore((s) => s.deviceLimit);
  const clearDeviceLimit = useChatStore((s) => s.clearDeviceLimit);
  const setSamwellMode = useSettingsStore((s) => s.setSamwellMode);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const cloudConfigured = cloudBaseUrl.length > 0;
  // Asking the server again. The action, not the status: nothing here draws
  // from the plan itself.
  const retryCloud = useSubscriptionStore((s) => s.refresh);

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
  const {
    ready,
    downloaded,
    nativeSupported,
    loading,
    loadError,
    initContext,
    mode,
    cloudBlocker,
  } = readiness;

  let cloudEscape: SamwellStatusAction | null = null;
  let cloudRequirement: string | null = null;

  if (!cloudConfigured || cloudBlocker === 'notConfigured') {
    cloudEscape = { label: 'SET UP CLOUD', icon: Cloud, onPress: onOpenSettings };
  } else if (cloudBlocker === 'needsAccount') {
    cloudRequirement = 'Samwell Cloud requires an account.';
    cloudEscape = { label: 'SIGN IN', icon: LogIn, onPress: onOpenAccount };
  } else if (cloudBlocker === 'needsPlan') {
    cloudRequirement = 'Choose a plan to continue this chat in Samwell Cloud.';
    cloudEscape = seePlansAction(onOpenPlans);
  } else if (cloudBlocker === 'cloudUnreachable') {
    // No escape offered, for the same reason `checkingAccount` offers none:
    // nothing on this screen fixes a server that did not answer, and a button
    // that cannot help is worse than a plain statement of what happened.
    cloudRequirement = 'Samwell Cloud did not answer. Check your connection.';
  } else if (cloudBlocker === 'checkingAccount' || cloudBlocker === 'checkingPlan') {
    cloudRequirement = 'Checking your Cloud access…';
  } else {
    cloudEscape = {
      label: 'SWITCH TO CLOUD',
      icon: Cloud,
      onPress: () => void switchToCloud(),
    };
  }

  if (mode === 'offline' && deviceLimit === 'context') {
    const message = [
      'This chat has grown too long for Samwell to hold on your device.',
      cloudRequirement,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      message,
      actions: [
        ...(cloudEscape ? [cloudEscape] : []),
        {
          label: 'START NEW CHAT',
          icon: MessageSquarePlus,
          // `newChat` owns clearing the limit together with resetting the
          // native conversation. Clearing it here first made the switch run
          // an unsafe auto-title pass on the exhausted engine.
          onPress: onNewChat,
        },
      ],
      isLoading: cloudEscape === null,
    };
  }

  if (mode === 'offline' && deviceLimit === 'memory') {
    const message = [
      'Your device is low on memory, so Samwell had to stop here.',
      cloudRequirement,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      message,
      actions: cloudEscape ? [cloudEscape] : undefined,
      isLoading: cloudEscape === null,
    };
  }

  /*
   * `mode === 'cloud' &&` on both of these, and it is load-bearing.
   *
   * `cloudBlocker` is ordered by what to fix first, so it now names a missing
   * account even while Samwell is set to run on this device — which Compass
   * needs, being cloud-only. Chat does not: offline chat with a local model
   * is working exactly as asked, and telling that reader to sign in would be
   * answering a question they have not asked.
   */
  if (mode === 'cloud' && cloudBlocker === 'notConfigured') {
    // Also carried no action until now, which stranded anyone who reached it
    // — including from the device-limit banner above. Settings is where the
    // base URL is entered and where switching back offline lives, so it is
    // the way out of this either way.
    return {
      title: 'Samwell Cloud is not set up.',
      message: 'This build has no cloud server, so there is nothing to talk to yet.',
      actions: [{ label: 'OPEN SETTINGS', icon: Settings, onPress: onOpenSettings }],
    };
  }

  // The server never answered. Before `unreachable` existed this rested on
  // "Checking your Cloud access…" forever; now it says so, and asking again is
  // the only thing the reader can usefully do from here.
  if (mode === 'cloud' && cloudBlocker === 'cloudUnreachable') {
    return {
      title: 'Cannot reach Samwell Cloud.',
      message: 'He did not answer. Check your connection and try again.',
      actions: [{ label: 'TRY AGAIN', icon: RefreshCw, onPress: () => void retryCloud() }],
    };
  }

  if (mode === 'cloud' && cloudBlocker === 'needsAccount') {
    return {
      title: 'Samwell Cloud works with your Cloud Account.',
      message: 'Sign in and he can pick up where you left off.',
      actions: [{ label: 'SIGN IN', icon: LogIn, onPress: onOpenAccount }],
    };
  }

  if (mode === 'cloud' && cloudBlocker === 'needsPlan') {
    return {
      title: 'Samwell Cloud needs an active plan.',
      message: 'Choose the plan that fits how you want to work with him.',
      actions: [seePlansAction(onOpenPlans)],
    };
  }

  if (
    mode === 'cloud' &&
    (cloudBlocker === 'checkingAccount' || cloudBlocker === 'checkingPlan')
  ) {
    return { message: 'Checking your Cloud access…', isLoading: true };
  }

  if (mode === 'cloud') return null;

  /*
   * An older phone that cannot run on-device AI. Offering a brain to download
   * sent it to Settings, which then said the phone was not supported: a dead
   * end both ways. Cloud is the only way to talk to him here, so that is the
   * action, gated the same way every other cloud escape is.
   */
  if (!nativeSupported) {
    const unreachable = cloudBlocker === 'cloudUnreachable';
    return {
      title: 'On-device Samwell is not supported on this phone.',
      message: cloudRequirement ?? 'Switch to Samwell Cloud to talk to him.',
      actions: unreachable
        ? [{ label: 'TRY AGAIN', icon: RefreshCw, onPress: () => void retryCloud() }]
        : cloudEscape
          ? [cloudEscape]
          : undefined,
      isLoading: !unreachable && cloudEscape === null,
    };
  }

  if (!downloaded) {
    return {
      title: 'Samwell needs a brain to run.',
      message: 'Tap button below to set up Samwell.',
      actions: [{ label: 'SET UP SAMWELL', icon: Settings, onPress: onOpenSettings }],
    };
  }

  if (loadError) {
    return {
      message: loadError,
      actions: [{ label: 'RETRY', icon: RefreshCw, onPress: initContext }],
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
      actions: [{ label: 'WAKE UP', icon: Power, onPress: initContext }],
    };
  }

  return null;
}
