/**
 * What the Listen sheet's "i" says: how listening is paid for, and on an
 * iPhone, where Highlight is (its lock screen has no room for it).
 *
 * Pure, so it can be tested on its own.
 */
import type { InfoContent } from '@/components/info-sheet';

export function listenInfo(platform: 'ios' | 'android' | string): InfoContent {
  return {
    label: 'LISTENING',
    title: 'Paid as you listen',
    line: 'A book is made into speech a few minutes ahead of you, never all at once.',
    points: [
      'Each sentence is made about two minutes before you hear it.',
      'It is paid for from the same Neurons as Samwell, as it plays.',
      'Stop, and nothing more is made or paid for.',
      'A sentence heard again plays from this phone, for free.',
      ...(platform === 'ios' ? ['Highlight is in the player and the mini player. The lock screen has no room for it on iPhone.'] : []),
    ],
  };
}

/** The line over the plans where listening asks for one: a book's, or a blog post's. */
export function listenPlansLine(post: boolean): string {
  return post ? 'Listening to posts comes with every plan.' : 'Listening to books comes with every plan.';
}
