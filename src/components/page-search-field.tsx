import React from 'react';

import { SearchBar } from '@/components/ui/search-bar';
import type { PageSearch } from '@/hooks/use-page-search';

export type PageSearchFieldOptions = {
  /** "Search episodes": the field's placeholder and the button's label. */
  placeholder: string;
  /** For a search that goes to a server: how long typing pauses before `term` is set. */
  debounce?: number;
  /** A server search is on its way; the field's ✕ gives way to a spinner. */
  loading?: boolean;
  /** "none" where a link or an address can be pasted or typed. */
  autoCapitalize?: 'none' | 'sentences';
};

/** The field a page's search button turns its header into. */
export function PageSearchField({ search, placeholder, debounce, loading, autoCapitalize }: PageSearchFieldOptions & { search: PageSearch }) {
  return (
    <SearchBar
      variant="filled"
      size="sm"
      placeholder={placeholder}
      value={search.query}
      onChangeText={search.setQuery}
      debounce={debounce}
      onDebouncedChange={debounce ? search.setTerm : undefined}
      loading={loading}
      returnKeyType="search"
      autoCorrect={false}
      autoCapitalize={autoCapitalize}
      // The search button was the tap asking for the keyboard.
      autoFocus
    />
  );
}
