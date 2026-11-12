import React from 'react';

import { ChevronDown, ChevronLeft } from '@/components/icons';
import { PageSearchMark } from '@/components/page-search-button';
import { PageSearchField, type PageSearchFieldOptions } from '@/components/page-search-field';
import { ScreenHeader } from '@/components/ui/screen-header';
import { iconSize } from '@/constants/theme';
import type { PageSearch } from '@/hooks/use-page-search';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SearchHeaderProps = PageSearch &
  PageSearchFieldOptions & {
    /** Shown until a search opens, when the field takes its place. */
    title?: string;
    onBack: () => void;
    /** The page rose as a drawer and leaves going down: Close rather than Back. */
    drawer?: boolean;
    /** False until there is a list to search; the button's place is held. */
    canSearch: boolean;
  };

/**
 * A page's top bar with a search in it: Back, and a search button that turns
 * the bar itself into the field, with a ✕ in the button's place. The bar
 * keeps its height either way, so nothing under it moves when a search
 * starts, and the field never scrolls away from the results it is filtering.
 */
export function SearchHeader({
  title = '',
  onBack,
  drawer = false,
  placeholder,
  canSearch,
  debounce,
  loading,
  autoCapitalize,
  ...search
}: SearchHeaderProps) {
  const ink = useThemeTokens()['--color-foreground'];
  const { searching, open, close } = search;
  const Leave = drawer ? ChevronDown : ChevronLeft;
  const field = searching ? (
    <PageSearchField search={search} placeholder={placeholder} debounce={debounce} loading={loading} autoCapitalize={autoCapitalize} />
  ) : undefined;
  const rightIcon = searching || canSearch ? <PageSearchMark searching={searching} /> : undefined;

  return (
    <ScreenHeader
      title={title}
      leftIcon={<Leave size={iconSize.default} color={ink} />}
      leftLabel={drawer ? 'Close' : 'Back'}
      onLeftPress={onBack}
      center={field}
      rightIcon={rightIcon}
      rightLabel={searching ? 'Close search' : placeholder}
      onRightPress={searching ? close : open}
    />
  );
}
