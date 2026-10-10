import React from 'react';
import { CREDIT_PLANS, parseCloudVoiceKey } from 'samwell-shared';

import { ACCOUNT_ENABLED } from '@/constants/logto';
import type { SettingsPane } from '@/features/settings/utils/panes';
import { podcastSummary, profileSummary, samwellSummary, voiceSummary } from '@/features/settings/utils/summaries';
import { useCloudIdentity } from '@/hooks/use-cloud-identity';
import { cloudVoiceLabel } from '@/features/tts/utils/cloud-voice-names';
import { DEVICE_VOICE, isAiVoice, voiceLabel, voiceMode } from '@/services/device-tts/catalogue';
import { useAccountStore } from '@/stores/account';
import { useModelStore } from '@/stores/model';
import { usePodcastPrefs } from '@/stores/podcast-prefs';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';
import { deviceVoiceName } from '@/utils/device-voices';

const NO_VOICES: never[] = [];

/** What each row of the Settings list says is set. Every value is already in memory. */
export function useSettingsSummaries(): Record<SettingsPane, string> {
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const cloudModelId = useSettingsStore((s) => s.cloudModelId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const brain = useModelStore((s) => s.models.find((model) => model.id === s.activeModelId)?.name ?? null);
  const cloudBrain = useSubscriptionStore((s) => s.models.find((model) => model.id === cloudModelId)?.label ?? null);
  const plan = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  const signedIn = useAccountStore((s) => s.status === 'signedIn');
  const email = useAccountStore((s) => s.email);
  const isGuest = useCloudIdentity().kind === 'guest';
  const skipBackSec = usePodcastPrefs((s) => s.skipBackSec);
  const skipForwardSec = usePodcastPrefs((s) => s.skipForwardSec);

  return React.useMemo(() => {
    const planName = plan ? CREDIT_PLANS[plan].label : null;
    const mode = voiceMode(ttsVoice);
    // A phone voice is named from its own identifier here: the phone's list of
    // voices is slow to ask for, and one row is no reason to ask.
    const phoneVoice = ttsVoice && ttsVoice !== DEVICE_VOICE ? ttsVoice : '';
    const cloud = parseCloudVoiceKey(ttsVoice);
    const voice =
      mode === 'cloud'
        ? (cloud ? cloudVoiceLabel(cloud.voice) : null)
        : mode === 'ai'
          ? (isAiVoice(ttsVoice) ? voiceLabel(ttsVoice) : null)
          : deviceVoiceName(NO_VOICES, phoneVoice);
    return {
      profile: profileSummary({
        accountsEnabled: ACCOUNT_ENABLED,
        signedIn,
        email,
        guestPlan: isGuest ? planName : null,
      }),
      samwell: samwellSummary({ mode: samwellMode, brain, cloudBrain, plan: planName }),
      voice: voiceSummary({ mode, name: voice }),
      podcasts: podcastSummary({ skipBackSec, skipForwardSec }),
    };
  }, [samwellMode, ttsVoice, brain, cloudBrain, plan, signedIn, email, isGuest, skipBackSec, skipForwardSec]);
}
