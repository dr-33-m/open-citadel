import React from 'react';
import { View } from 'react-native';

import { PlayerScrubber } from '@/features/podcasts/components/player-scrubber';
import { PlayerTransport } from '@/features/podcasts/components/player-transport';
import { useTranscriptTransport } from '@/features/podcasts/hooks/use-transcript-transport';

/**
 * Pinned under the transcript while its episode plays: the scrubber and the
 * transport, so reading along never means closing the sheet to pause. A
 * container: the clock ticks here, not in the list.
 */
export function TranscriptTransport() {
  const { scrubber, transport } = useTranscriptTransport();
  return (
    <View className="gap-1 px-6 pt-2">
      <PlayerScrubber {...scrubber} />
      <PlayerTransport {...transport} compact />
    </View>
  );
}
