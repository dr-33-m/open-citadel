import { useNavigation } from 'expo-router';
import React from 'react';
import { Keyboard } from 'react-native';

import { useBackHandler } from '@/hooks/use-back-handler';
import { matchesQuery } from '@/utils/format';

/**
 * A search over one page's list (a show's episodes, a blog's posts), opened
 * from the page's top bar and closed again with its ✕ or the back button.
 * Closing it empties the query, so the page comes back as it was.
 */
export function usePageSearch() {
  const navigation = useNavigation();
  const [searching, setSearching] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const open = React.useCallback(() => setSearching(true), []);
  const close = React.useCallback(() => {
    setSearching(false);
    setQuery('');
  }, []);
  // Back ends the search before it leaves the page, but only while the page
  // is the one on screen: a page still searching under an episode opened
  // from its results otherwise took that episode's back press for itself.
  // Asked at the press, so focus changing never re-renders the page.
  useBackHandler(searching, () => {
    if (!navigation.isFocused()) return false;
    close();
  });
  // The keyboard belongs to this page's field. Without this it stayed up
  // over a result opened from the list, and over the page gone back to.
  React.useEffect(() => {
    if (!searching) return;
    const offBlur = navigation.addListener('blur', () => Keyboard.dismiss());
    const offRemove = navigation.addListener('beforeRemove', () => Keyboard.dismiss());
    return () => {
      offBlur();
      offRemove();
    };
  }, [navigation, searching]);

  return { searching, query, setQuery, open, close };
}

export type PageSearch = ReturnType<typeof usePageSearch>;

/**
 * The items a page search lets through: all of them until something is
 * typed. `fields` names what an item is searched by; keep it at module level,
 * since a fresh function per render re-runs the filter on every render.
 */
export function useSearchResults<T>(items: T[], search: PageSearch, fields: (item: T) => (string | null | undefined)[]) {
  const { searching, query } = search;
  return React.useMemo(
    () => (searching && query.trim() ? items.filter((item) => matchesQuery(query, ...fields(item))) : items),
    [items, fields, query, searching],
  );
}
