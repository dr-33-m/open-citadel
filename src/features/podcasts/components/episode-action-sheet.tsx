import React from 'react';
import { View } from 'react-native';

import {
  CircleCheckBig,
  Download,
  ExternalLink,
  Highlighter,
  Inbox,
  ListEnd,
  ListStart,
  ListX,
  MicSignal,
  Play,
  RotateCcw,
  Share,
  Star,
  StarOff,
  Trash2,
  type LucideIcon,
} from '@/components/icons';
import { MenuList } from '@/components/menu-list';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { episodeMenu, type EpisodeAction } from '@/features/podcasts/utils/episode-menu';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { EpisodeItem } from '@/services/podcasts/records';

const ICONS: Record<EpisodeAction, LucideIcon> = {
  play: Play,
  'play-next': ListStart,
  'queue-last': ListEnd,
  dequeue: ListX,
  download: Download,
  'remove-download': Trash2,
  favorite: Star,
  unfavorite: StarOff,
  played: CircleCheckBig,
  unplayed: RotateCcw,
  seen: Inbox,
  reset: RotateCcw,
  share: Share,
  website: ExternalLink,
  show: MicSignal,
  highlights: Highlighter,
};

type EpisodeActionSheetProps = {
  visible: boolean;
  episode: EpisodeItem | null;
  /** Off on the show's own page, where going to the show goes nowhere. */
  showLink?: boolean;
  /** The episode in the player: no queueing, it is already what plays now. */
  isCurrent: boolean;
  /** The screen can open the episode's highlights, and it has some. */
  highlights?: boolean;
  onClose: () => void;
  onAction: (action: EpisodeAction, episode: EpisodeItem) => void;
};

/**
 * Everything that can be done to one episode, from a long press anywhere it
 * appears. The same menu on every surface, so an action is always where the
 * listener last found it. Which rows appear is `episodeMenu`'s decision.
 */
export function EpisodeActionSheet({ visible, episode, showLink = true, isCurrent, highlights = false, onClose, onAction }: EpisodeActionSheetProps) {
  const tokens = useThemeTokens();
  // Held content through the close: the shell keeps the last children while
  // it animates away (see components/ui/sheet), so this renders nothing rather
  // than unmounting when the episode clears.
  if (!episode) return <Sheet visible={visible} onClose={onClose}>{null}</Sheet>;

  const select = (action: EpisodeAction) => {
    onClose();
    onAction(action, episode);
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View className="gap-4">
        <View className="gap-1 px-4">
          <ThemedText type="labelSm" color={tokens['--color-primary']} numberOfLines={1}>
            {episode.showTitle}
          </ThemedText>
          <ThemedText type="bodySm" color={tokens['--color-muted-foreground']} numberOfLines={2}>
            {episode.title}
          </ThemedText>
        </View>
        <MenuList rows={episodeMenu(episode, { showLink, isCurrent, highlights })} icons={ICONS} onSelect={select} />
      </View>
    </Sheet>
  );
}
