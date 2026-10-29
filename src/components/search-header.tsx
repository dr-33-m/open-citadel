import React from 'react';

import { ChevronLeft, Search, X } from '@/components/icons';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchBar } from '@/components/ui/search-bar';
import { iconSize } from '@/constants/theme';
import type { PageSearch } from '@/hooks/use-page-search';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SearchHeaderProps = PageSearch & {
  /** Shown until a search opens, when the field takes its place. */
  title?: string;
  onBack: () => void;
  /** "Search episodes": the field's placeholder and the button's label. */
  placeholder: string;
  /** False until there is a list to search; the button's place is held. */
  canSearch: boolean;
  /** For a search that goes to a server: how long typing pauses before `term` is set. */
  debounce?: number;
  /** A server search is on its way; the field's ✕ gives way to a spinner. */
  loading?: boolean;
};

/**
 * A page's top bar with a search in it: Back, and a search button that turns
 * the bar itself into the field, with a ✕ in the button's place. The bar
 * keeps its height either way, so nothing under it moves when a search
 * starts, and the field never scrolls away from the results it is filtering.
 */
export function SearchHeader({
  searching,
  query,
  setQuery,
  setTerm,
  open,
  close,
  title = '',
  onBack,
  placeholder,
  canSearch,
  debounce,
  loading,
}: SearchHeaderProps) {
  const tokens = useThemeTokens();
  const primary = tokens['--color-primary'];

  const field = searching ? (
    <SearchBar
      variant="filled"
      size="sm"
      placeholder={placeholder}
      value={query}
      onChangeText={setQuery}
      debounce={debounce}
      onDebouncedChange={debounce ? setTerm : undefined}
      loading={loading}
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
      title={title}
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
