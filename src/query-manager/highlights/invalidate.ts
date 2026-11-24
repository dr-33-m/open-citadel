import { queryClient } from '@/lib/query-client';
import { audiobookKeys } from '@/query-manager/audiobook/keys';
import { transcriptKeys } from '@/query-manager/transcripts/keys';

/**
 * A highlight was kept, changed, moved or removed: every list of highlights
 * read from the cache is read again, wherever the change was made. For
 * `services/highlights.ts`, where every highlight write ends with it.
 *
 * A highlight can be changed from the timeline, the reader, Samwell and the
 * audiobook, and the episode page and the follow-along sheet each keep their
 * own cached list. Refreshing only the list on screen at the time left the
 * others showing a deleted one until the app restarted.
 */
export function invalidateHighlightLists(): void {
  void queryClient.invalidateQueries({ queryKey: transcriptKeys.allHighlights() });
  void queryClient.invalidateQueries({ queryKey: audiobookKeys.allHighlights() });
}
