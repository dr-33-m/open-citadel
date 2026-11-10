import { BookOpen, MicSignal, Newspaper, type LucideIcon } from '@/components/icons';
import type { BookKind } from '@/db/schema';

/**
 * How each kind of thing a chat can hold is drawn: its icon and its name.
 *
 * One table for every place that shows one, the toolbox's Reading tiles and
 * the mark in the chat's header, so a kind never has two icons. Beside the
 * components rather than in `utils/`, because the icons pull in React Native.
 */
export const ATTACHMENT_KINDS: Record<BookKind, { icon: LucideIcon; label: string }> = {
  book: { icon: BookOpen, label: 'Book' },
  article: { icon: Newspaper, label: 'Blog post' },
  episode: { icon: MicSignal, label: 'Podcast' },
};
