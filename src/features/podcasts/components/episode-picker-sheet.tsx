import React from 'react';

import { AttachmentPickerSheet } from '@/components/attachment-picker-sheet';
import { ChevronRight, MicSignal } from '@/components/icons';
import { PickerRowsSkeleton } from '@/components/skeletons/picker-rows-skeleton';
import { SquareArtwork } from '@/components/square-artwork';
import { TextSwitch } from '@/components/text-switch';
import { Item } from '@/components/ui/item';
import { pickerEmptyText, WINDOW_OPTIONS } from '@/features/podcasts/utils/episode-picker';
import { formatDuration } from '@/features/podcasts/utils/format';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { TranscribedEpisode } from '@/services/podcasts/transcript/library';
import type { TranscriptWindow } from '@/services/podcasts/transcript/windows';
import { matchesQuery } from '@/utils/format';
import { monogramOf } from '@/utils/monogram';

const ART = 56;
const META_TEXT = { fontSize: 12, lineHeight: 16 } as const;
const TITLE_TEXT = { fontSize: 15, lineHeight: 20 } as const;
const keyOf = (episode: TranscribedEpisode) => episode.id;
const matchesEpisode = (episode: TranscribedEpisode, query: string) => matchesQuery(query, episode.title, episode.showTitle);

type EpisodePickerSheetProps = {
  visible: boolean;
  /** Undefined until the window has been read. */
  episodes: TranscribedEpisode[] | undefined;
  window: TranscriptWindow;
  onWindow: (window: TranscriptWindow) => void;
  onSelect: (episode: TranscribedEpisode) => void;
  onClose: () => void;
};

/** One episode: its artwork, "Show · 1 hr 30 min", and its title, at one height so the list skims. */
const EpisodeOption = React.memo(function EpisodeOption({
  episode,
  onSelect,
}: {
  episode: TranscribedEpisode;
  onSelect: (episode: TranscribedEpisode) => void;
}) {
  const tokens = useThemeTokens();
  const meta = [episode.showTitle, formatDuration(episode.durationSec)].filter(Boolean).join(' · ');
  return (
    <Item className="px-6 py-3" onPress={() => onSelect(episode)}>
      <SquareArtwork
        uri={episode.imageUrl}
        fallbackIcon={MicSignal}
        monogram={monogramOf(episode.showTitle)}
        size={ART}
        recyclingKey={episode.id}
        placeholderColor={tokens['--color-surface-tertiary']}
      />
      <Item.Content>
        <Item.Description numberOfLines={1} style={META_TEXT}>
          {meta}
        </Item.Description>
        <Item.Title numberOfLines={2} style={TITLE_TEXT}>
          {episode.title}
        </Item.Title>
      </Item.Content>
      <Item.Actions>
        <ChevronRight size={16} color={tokens['--color-muted-foreground']} />
      </Item.Actions>
    </Item>
  );
});

/**
 * The episode picker: every episode with a transcript, transcribed here or
 * published by its show, in a window of when it was last played or
 * transcribed (Today, This week, This month, All). The third caller of the
 * shared `AttachmentPickerSheet`, after books and posts.
 */
export function EpisodePickerSheet({ visible, episodes, window, onWindow, onSelect, onClose }: EpisodePickerSheetProps) {
  const renderItem = React.useCallback(
    ({ item }: { item: TranscribedEpisode }) => <EpisodeOption episode={item} onSelect={onSelect} />,
    [onSelect],
  );

  return (
    <AttachmentPickerSheet
      visible={visible}
      onClose={onClose}
      title="Pick an episode"
      placeholder="Search episodes…"
      items={episodes}
      matches={matchesEpisode}
      keyOf={keyOf}
      renderItem={renderItem}
      skeleton={<PickerRowsSkeleton label="Loading episodes" />}
      emptyText={pickerEmptyText(window)}
      noMatchText="No episodes found"
      filter={<TextSwitch options={WINDOW_OPTIONS} value={window} onChange={onWindow} />}
    />
  );
}
