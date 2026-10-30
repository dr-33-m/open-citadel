import React from 'react';

import { IconButton } from '@/components/icon-button';
import { Search, X } from '@/components/icons';
import { iconSize } from '@/constants/theme';
import type { PageSearch } from '@/hooks/use-page-search';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** The search button's mark: the glass, or the ✕ that closes a search. */
export function PageSearchMark({ searching }: { searching: boolean }) {
  const primary = useThemeTokens()['--color-primary'];
  const Mark = searching ? X : Search;
  return <Mark size={iconSize.default} color={primary} />;
}

/** The button that opens a page's search, and closes it again from the same place. */
export function PageSearchButton({ search, label }: { search: PageSearch; label: string }) {
  const { searching, open, close } = search;
  return (
    <IconButton onPress={searching ? close : open} label={searching ? 'Close search' : label}>
      <PageSearchMark searching={searching} />
    </IconButton>
  );
}
