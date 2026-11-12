import React from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { ChoiceChips, type Choice } from '@/components/choice-chips';
import { IconButton } from '@/components/icon-button';
import { Check, CircleAlert, Globe, Newspaper } from '@/components/icons';
import { SquareArtwork } from '@/components/square-artwork';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { elevation } from '@/constants/theme';
import { WholePostsRow, type WholePostsRowProps } from '@/features/blogs/components/whole-posts-row';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import type { BlogArticleFilter } from '@/services/blogs/articles';
import { monogramOf } from '@/utils/monogram';

const ART = 128;

const FILTERS: Choice<BlogArticleFilter>[] = [
  { value: 'all', label: 'All posts' },
  { value: 'unread', label: 'Unread' },
];

export type BlogHeroProps = {
  title: string;
  /** The blog's host, `fs.blog`. */
  host: string | null;
  imageUrl: string | null;
  /** Plain text. */
  description: string | null;
  following: boolean;
  /** Still being fetched (a blog opened from Explore). */
  loading: boolean;
  /** False when the blog could not be reached, so there is nothing to follow. */
  canFollow: boolean;
  refreshError: string | null;
  filter: BlogArticleFilter;
  onFilter: (filter: BlogArticleFilter) => void;
  onFollow: () => void;
  onUnfollow: () => void;
  onOpenSite: () => void;
  /**
   * For a blog whose feed carries only openings: where its posts are read, and
   * the way to change it (null when its publisher has settled it).
   */
  wholePosts: Omit<WholePostsRowProps, 'muted'> | null;
};

/**
 * The top of a blog's page: its picture or its initials, its name in the
 * library's serif, and the one decision the page exists for. Following is
 * gold until it is made, then steps back to a plain "Following" beside the
 * way to the blog's own site.
 */
export function BlogHero({
  title,
  host,
  imageUrl,
  description,
  following,
  loading,
  canFollow,
  refreshError,
  filter,
  onFilter,
  onFollow,
  onUnfollow,
  onOpenSite,
  wholePosts,
}: BlogHeroProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const gold = tokens['--color-primary'];

  return (
    <View className="gap-5 pb-4 pt-2">
      <View className="gap-5 px-6">
        <View className="items-center">
          <View style={elevation.card}>
            <SquareArtwork
              uri={imageUrl}
              fallbackIcon={Newspaper}
              monogram={monogramOf(title)}
              size={ART}
              placeholderColor={tokens['--color-surface-tertiary']}
            />
          </View>
        </View>
        <View className="items-center gap-1">
          <ThemedText type="headlineLg" className="text-center" numberOfLines={3}>
            {title}
          </ThemedText>
          {host ? (
            <ThemedText type="labelSm" color={muted} className="text-center" numberOfLines={1}>
              {host}
            </ThemedText>
          ) : null}
        </View>
        {description ? (
          <ThemedText type="bodyMd" color={muted} className="text-center" numberOfLines={3}>
            {description}
          </ThemedText>
        ) : null}

        {following ? (
          <View className="flex-row gap-3">
            <ActionButton icon={Check} label="FOLLOWING" onPress={onUnfollow} tint={gold} centered className="h-11 flex-1" />
            <IconButton label="Open the blog's site" onPress={onOpenSite} className="h-11 w-11">
              <Globe size={18} color={gold} />
            </IconButton>
          </View>
        ) : (
          <GoldButton label="FOLLOW" size="compact" onPress={onFollow} loading={loading} disabled={loading || !canFollow} />
        )}

        {wholePosts ? <WholePostsRow {...wholePosts} muted={muted} /> : null}

        {refreshError ? (
          <View className="flex-row items-start gap-2">
            <CircleAlert size={16} color={muted} />
            <ThemedText type="bodySm" color={muted} className="flex-1">
              {refreshError}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ChoiceChips choices={FILTERS} value={filter} onChange={onFilter} surface="background" gutter="page" />
    </View>
  );
}
