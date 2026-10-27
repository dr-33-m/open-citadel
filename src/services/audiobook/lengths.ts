/**
 * How long each sentence of a book plays in a voice, once it has been made,
 * kept so a second listen knows them all and the clock is exact from the
 * start. One small JSON file per book and voice, beside the audio cache; it
 * goes when the cache is cleared, which only makes the clock an estimate
 * again.
 *
 * Written a moment after it changes rather than on every sentence.
 */
import { Directory, File, Paths } from 'expo-file-system';

import type { Measured } from '@/features/audiobook/utils/book-clock';

const WRITE_DELAY_MS = 3_000;

/** A sentence id's length in seconds and its characters, compactly. */
type Stored = Record<string, [number, number]>;

function fileFor(bookId: string, modelId: string, voice: string): File {
  const folder = new Directory(Paths.cache, 'audiobook', encodeURIComponent(bookId));
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return new File(folder, `${encodeURIComponent(`${modelId}.${voice}`)}.lengths.json`);
}

export class SentenceLengths {
  readonly map = new Map<string, Measured>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private readonly file: File) {}

  static async load(bookId: string, modelId: string, voice: string): Promise<SentenceLengths> {
    const lengths = new SentenceLengths(fileFor(bookId, modelId, voice));
    try {
      if (lengths.file.exists) {
        const stored = JSON.parse(await lengths.file.text()) as Stored;
        for (const [id, value] of Object.entries(stored)) {
          if (Array.isArray(value) && value[0] > 0 && value[1] > 0) lengths.map.set(id, { sec: value[0], chars: value[1] });
        }
      }
    } catch {
      // Unreadable: the clock estimates until the sentences are measured again.
    }
    return lengths;
  }

  record(sentenceId: string, measured: Measured): void {
    if (!(measured.sec > 0)) return;
    this.map.set(sentenceId, measured);
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), WRITE_DELAY_MS);
  }

  /** Writes now, for when the book is put away. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const stored: Stored = {};
    for (const [id, { sec, chars }] of this.map) stored[id] = [Math.round(sec * 1000) / 1000, chars];
    try {
      this.file.write(JSON.stringify(stored));
    } catch {
      // Next change tries again.
    }
  }
}
