/**
 * What the player's menu offers for a book or a blog post: read along in it
 * (the voice carries on in the reader, at the sentence being heard), or stop
 * listening.
 *
 * Pure, so it can be tested on its own.
 */
import type { MenuRow } from '@/components/menu-list';

export type BookPlayerAction = 'read' | 'stop';

export function bookPlayerMenu(post: boolean): MenuRow<BookPlayerAction>[] {
  return [
    { key: 'read', label: post ? 'Read Along in the Post' : 'Read Along in the Book', tone: 'gold' },
    { key: 'stop', label: 'Stop Listening', tone: 'muted' },
  ];
}
