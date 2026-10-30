import React from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/icon-button';
import { ChevronDown } from '@/components/icons';
import { PageSearchButton } from '@/components/page-search-button';
import { PageSearchField } from '@/components/page-search-field';
import { ThemedText } from '@/components/themed-text';
import { contentColumn } from '@/constants/theme';
import type { PageSearch } from '@/hooks/use-page-search';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type DrawerHeaderProps = {
  title: string;
  /** The count under the title, `12 BOOKS`. It belongs to the title, not to the buttons. */
  subtitle: string;
  onClose: () => void;
  /** The page's search, opened from a button after the screen's own actions. */
  search?: PageSearch;
  /** "Search collections": the field's placeholder and the button's label. */
  searchLabel?: string;
  /** False while there is nothing to search. */
  canSearch?: boolean;
  /** Icon buttons on the right, in the order they appear. */
  children?: React.ReactNode;
};

const HIDDEN = { opacity: 0 } as const;

/**
 * The header of a screen that rises as a drawer (a shelf's "View all", a
 * collection): close, title and count, and the screen's own actions.
 *
 * The close points down, not back. These screens arrive on the `drawer`
 * transition, the same one Settings uses, so they leave by going down, and
 * the control should point where the screen actually goes.
 *
 * A search turns the bar into its field, as `SearchHeader` does: the title and
 * the actions give way, the ✕ takes the search button's place. The title stays
 * laid out under the field, unseen, so the bar keeps its height to the point
 * and nothing under it moves.
 */
export function DrawerHeader({ title, subtitle, onClose, search, searchLabel = 'Search', canSearch = true, children }: DrawerHeaderProps) {
  const tokens = useThemeTokens();
  const searching = search?.searching ?? false;
  return (
    <View className="flex-row items-center gap-3 px-4 py-4" style={contentColumn}>
      <IconButton onPress={onClose} label="Close">
        <ChevronDown size={20} color={tokens['--color-foreground']} strokeWidth={2} />
      </IconButton>
      <View className="flex-1">
        <View style={searching ? HIDDEN : undefined} importantForAccessibility={searching ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={searching}>
          <ThemedText type="headlineSm" numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText type="labelSm" color={tokens['--color-muted-foreground']}>
            {subtitle}
          </ThemedText>
        </View>
        {search && searching ? (
          <View style={StyleSheet.absoluteFill} className="justify-center">
            <PageSearchField search={search} placeholder={searchLabel} />
          </View>
        ) : null}
      </View>
      {searching ? null : children}
      {search && (searching || canSearch) ? <PageSearchButton search={search} label={searchLabel} /> : null}
    </View>
  );
}
