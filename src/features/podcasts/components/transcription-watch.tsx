import { useTranscriptionWatch } from '@/features/podcasts/hooks/use-transcription-watch';

/**
 * Draws nothing. Its own component so a job's poll re-renders only this, not
 * the root layout it sits in.
 */
export function TranscriptionWatch({ ready }: { ready: boolean }) {
  useTranscriptionWatch(ready);
  return null;
}
