import React from 'react';

import { MediaCard } from '@/components/chat/media-card';
import { Headphones } from '@/components/icons';
import { readPodcastCard, type PodcastCardKind } from '@/services/listening-tools/card';

interface PodcastCardProps {
  kind: PodcastCardKind;
  id: string;
  onNavigate?: (kind: PodcastCardKind, id: string) => void;
}

/**
 * A show or an episode Samwell named, shown by its artwork rather than as a
 * name in a sentence: the podcasts' counterpart of the book card, drawn by the
 * same `MediaCard`. Tapping it opens the show's page or the episode's.
 */
export const PodcastCard = React.memo(function PodcastCard({ kind, id, onNavigate }: PodcastCardProps) {
  // Read during render, as the book card is: an effect drew nothing for a
  // frame and then the whole card, a jump in the middle of a reply.
  const data = React.useMemo(() => readPodcastCard(kind, id), [kind, id]);
  const onPress = React.useMemo(() => (onNavigate ? () => onNavigate(kind, id) : undefined), [onNavigate, kind, id]);

  // Gone from the device (unfollowed and tidied away): no card rather than one that opens nothing.
  if (!data) return null;

  return (
    <MediaCard
      id={id}
      coverUri={data.coverUri}
      coverShape="square"
      FallbackIcon={Headphones}
      title={data.title}
      subtitle={data.subtitle}
      status={data.status}
      onPress={onPress}
    />
  );
});
