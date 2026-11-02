import { queryClient } from '@/lib/query-client';
import { samwellMemoryKeys } from '@/query-manager/samwell-memory/keys';

/**
 * What he has kept changed: read it again. The list never goes stale by itself,
 * so every write to his notes ends here, whoever makes it, or the screen goes on
 * showing what is no longer there.
 */
export function invalidateSamwellMemory(): void {
  void queryClient.invalidateQueries({ queryKey: samwellMemoryKeys.all });
}
