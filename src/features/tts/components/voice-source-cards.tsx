import React from 'react';
import { View } from 'react-native';

import { Cloud, Smartphone } from '@/components/icons';
import { ModeCard } from '@/components/mode-card';
import type { VoiceSource } from '@/features/tts/utils/voice-copy';

export interface VoiceSourceCardsProps {
  source: VoiceSource;
  /** Cloud voices are not open yet: the card is drawn shut and takes no press. */
  cloudLocked: boolean;
  /** The line at the foot of the cloud card, e.g. "COMING SOON". */
  cloudStatus: string;
  onSelectDevice: () => void;
  onSelectCloud: () => void;
  /** Opens what there is to know about cloud voices. Left out while the card is shut. */
  onCloudInfo?: () => void;
}

/**
 * The first choice about a reading voice: where it runs. The same two cards,
 * with the same two names, as Samwell's own on-device and cloud, so the app
 * has one idea of what "on-device" and "cloud" mean.
 */
export function VoiceSourceCards({ source, cloudLocked, cloudStatus, onSelectDevice, onSelectCloud, onCloudInfo }: VoiceSourceCardsProps) {
  return (
    <View className="flex-row gap-3" accessibilityRole="radiogroup">
      <ModeCard
        active={source === 'device'}
        icon={Smartphone}
        label="On-device"
        description="Voices that read on this phone, offline."
        status="READY"
        compact
        onSelect={onSelectDevice}
      />
      <ModeCard
        active={source === 'cloud'}
        icon={Cloud}
        label="Cloud"
        description="Studio voices, read from the cloud."
        status={cloudStatus}
        locked={cloudLocked}
        compact
        onSelect={onSelectCloud}
        // The padlock has the corner while the card is shut.
        onInfo={cloudLocked ? undefined : onCloudInfo}
      />
    </View>
  );
}
