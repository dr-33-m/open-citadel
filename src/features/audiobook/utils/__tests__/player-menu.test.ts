import { describe, expect, it } from 'vitest';

import { bookPlayerMenu } from '@/features/audiobook/utils/player-menu';

describe('bookPlayerMenu', () => {
  it('reads along in a book, or in a post', () => {
    expect(bookPlayerMenu(false).map((r) => r.label)).toEqual(['Read Along in the Book', 'Stop Listening']);
    expect(bookPlayerMenu(true)[0].label).toBe('Read Along in the Post');
  });
});
