/**
 * The composer's episode picker: its four windows and what it says when one
 * is empty. Pure.
 */
import type { TranscriptWindow } from '@/services/podcasts/transcript/windows';

export const WINDOW_OPTIONS: readonly { value: TranscriptWindow; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All' },
];

const WHEN: Record<Exclude<TranscriptWindow, 'all'>, string> = { today: 'today', week: 'this week', month: 'this month' };

export function pickerEmptyText(window: TranscriptWindow): string {
  if (window === 'all') return 'No transcripts yet. Open an episode and tap Transcribe.';
  return `No transcripts ${WHEN[window]}. Open an episode and tap Transcribe.`;
}
