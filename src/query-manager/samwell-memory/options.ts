import { queryOptions } from '@tanstack/react-query';

import { samwellMemoryKeys } from '@/query-manager/samwell-memory/keys';
import { readSamwellMemory } from '@/services/samwell-memory';

export function createSamwellMemoryQueryOptions() {
  return queryOptions({
    queryKey: samwellMemoryKeys.all,
    queryFn: async () => readSamwellMemory(),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    networkMode: 'always',
    retry: false,
  });
}
