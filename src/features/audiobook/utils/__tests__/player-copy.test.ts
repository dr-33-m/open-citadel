import { describe, expect, it } from 'vitest';

import { listenPlansLine } from '@/features/audiobook/utils/listen-info';
import { bookPlayerMenu } from '@/features/audiobook/utils/player-menu';

describe('bookPlayerMenu', () => {
  it('reads along in a book, or in a post', () => {
    expect(bookPlayerMenu(false).map((r) => r.label)).toEqual(['Read Along in the Book', 'Stop Listening']);
    expect(bookPlayerMenu(true)[0].label).toBe('Read Along in the Post');
  });
});

describe('listenPlansLine', () => {
  it('says books or posts, as the thing listened to is', () => {
    expect(listenPlansLine(false)).toBe('Listening to books comes with every plan.');
    expect(listenPlansLine(true)).toBe('Listening to posts comes with every plan.');
  });
});
