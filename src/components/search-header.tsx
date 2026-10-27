import React from 'react';

import { ChevronLeft, Search, X } from '@/components/icons';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchBar } from '@/components/ui/search-bar';
import { iconSize } from '@/constants/theme';
import type { PageSearch } from '@/hooks/use-page-search';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SearchHeaderProps = PageSearch & {
  onBack: () => void;
  /** "Search episodes": the field's placeholder and the button's label. */
  placeholder: string;
  /** False until there is a list to search; the button's place is held. */
  canSearch: boolean;
};

/**
 * A page's top bar with a search in it: Back, and a search button that turns
 * the bar itself into the field, with a ✕ in the button's place. The bar
 * keeps its height either way, so nothing under it moves when a search
 * starts, and the field never scrolls away from the results it is filtering.
 */
export function SearchHeader({ searching, query, setQuery, open, close, onBack, placeholder, canSearch }: SearchHeaderProps) {
  const tokens = useThemeTokens();
  const primary = tokens['--color-primary'];

  const field = searching ? (
    <SearchBar
      variant="filled"
      size="sm"
      placeholder={placeholder}
      value={query}
      onChangeText={setQuery}
      returnKeyType="search"
      autoCorrect={false}
      // The search button was the tap asking for the keyboard.
      autoFocus
    />
  ) : undefined;
  const rightIcon = searching ? (
    <X size={iconSize.default} color={primary} />
  ) : canSearch ? (
    <Search size={iconSize.default} color={primary} />
  ) : undefined;
  const rightLabel = searching ? 'Close search' : placeholder;
  const onRightPress = searching ? close : open;

  return (
    <ScreenHeader
      title=""
      leftIcon={<ChevronLeft size={iconSize.default} color={tokens['--color-foreground']} />}
      leftLabel="Back"
      onLeftPress={onBack}
      center={field}
      rightIcon={rightIcon}
      rightLabel={rightLabel}
      onRightPress={onRightPress}
    />
  );
}
