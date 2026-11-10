import { describe, expect, it } from 'vitest';

import { ATTACHMENT_OPEN_LABEL, attachmentOpenTarget } from '../attachment-open';

describe('attachmentOpenTarget', () => {
  it('opens an episode at its transcript, once the episode is known', () => {
    expect(attachmentOpenTarget({ kind: 'episode', episode: true, passage: false })).toBe('transcript');
    expect(attachmentOpenTarget({ kind: 'episode', episode: false, passage: false })).toBeNull();
  });

  it('opens a book or a post at its passage when the chat has one', () => {
    expect(attachmentOpenTarget({ kind: 'book', episode: false, passage: true })).toBe('passage');
    expect(attachmentOpenTarget({ kind: 'article', episode: false, passage: true })).toBe('passage');
  });

  it('opens a whole-book chat at the book', () => {
    expect(attachmentOpenTarget({ kind: 'book', episode: false, passage: false })).toBe('book');
  });

  it('offers nothing for a post with no passage', () => {
    expect(attachmentOpenTarget({ kind: 'article', episode: false, passage: false })).toBeNull();
  });

  it('names every target', () => {
    expect(ATTACHMENT_OPEN_LABEL.transcript).toBe('Read the transcript');
    expect(ATTACHMENT_OPEN_LABEL.passage).toBe('Open at the passage');
    expect(ATTACHMENT_OPEN_LABEL.book).toBe('Open the book');
  });
});
