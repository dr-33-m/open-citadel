import { useRouter } from 'expo-router';
import React from 'react';

import { usePageSearch, useSearchResults } from '@/hooks/use-page-search';
import { useCollectionsStore } from '@/stores/collections';
import { countLabel } from '@/utils/format';

const collectionFields = (collection: { name: string }) => [collection.name];

/** Collections' "View all": every collection, searchable by name. */
export function useCollectionsSection() {
  const router = useRouter();
  const collections = useCollectionsStore((s) => s.collections);
  const search = usePageSearch();
  const results = useSearchResults(collections, search, collectionFields);
  const openCollection = React.useCallback((id: string) => router.push(`/collection/${id}` as any), [router]);
  const close = React.useCallback(() => router.back(), [router]);

  return {
    subtitle: countLabel(collections.length, 'COLLECTION'),
    search,
    canSearch: collections.length > 0,
    results,
    emptyText: search.query ? 'No results.' : 'No collections yet.',
    openCollection,
    close,
  };
}
