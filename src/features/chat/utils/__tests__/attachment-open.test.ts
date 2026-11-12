import { describe, expect, it } from 'vitest';

import { ATTACHMENT_OPEN_LABEL, attachmentOpenTarget } from '../attachment-open';

const NONE = { episode: false, post: false, passage: false } as const;

describe('attachmentOpenTarget', () => {
  it('opens an episode at its transcript, once the episode is known', () => {
    expect(attachmentOpenTarget({ ...NONE, kind: 'episode', episode: true })).toBe('transcript');
    expect(attachmentOpenTarget({ ...NONE, kind: 'episode' })).toBeNull();
  });

  it('opens a book or a post at its passage when the chat has one', () => {
    expect(attachmentOpenTarget({ ...NONE, kind: 'book', passage: true })).toBe('passage');
    expect(attachmentOpenTarget({ ...NONE, kind: 'article', post: true, passage: true })).toBe('passage');
  });

  it('opens a whole-book chat at the book', () => {
    expect(attachmentOpenTarget({ ...NONE, kind: 'book' })).toBe('book');
  });

  it('opens a whole-post chat at the post, once the post is known', () => {
    expect(attachmentOpenTarget({ ...NONE, kind: 'article', post: true })).toBe('post');
    expect(attachmentOpenTarget({ ...NONE, kind: 'article' })).toBeNull();
  });

  it('names every target', () => {
    expect(ATTACHMENT_OPEN_LABEL.transcript).toBe('Read the transcript');
    expect(ATTACHMENT_OPEN_LABEL.passage).toBe('Open at the passage');
    expect(ATTACHMENT_OPEN_LABEL.book).toBe('Open the book');
    expect(ATTACHMENT_OPEN_LABEL.post).toBe('Open the post');
  });
});
