import React from 'react';
import { View } from 'react-native';

import { PlayerScrubber } from '@/features/podcasts/components/player-scrubber';
import { PlayerTransport } from '@/features/podcasts/components/player-transport';
import { useFollowAlongTransport } from '@/features/podcasts/hooks/use-follow-along-transport';

/**
 * Pinned under a follow-along sheet (a transcript, a book's text) while what
 * it follows plays: the scrubber and the transport, so reading along never
 * means closing the sheet to pause. A container: the clock ticks here, not in
 * the list.
 */
export function FollowAlongTransport() {
  const { scrubber, transport } = useFollowAlongTransport();
  return (
    <View className="gap-1 px-6 pt-2">
      <PlayerScrubber {...scrubber} />
      <PlayerTransport {...transport} compact />
    </View>
  );
}
