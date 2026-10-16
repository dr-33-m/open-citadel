import { describe, expect, it } from 'vitest';

import { plainReply, replyMarkerPattern } from '../reply-markers';

describe('plainReply', () => {
  it('drops the cards and closes the gaps they leave', () => {
    const reply = 'You have two unstarted books:\n\n- "My Life and Work"\n\n[[book:bk-1]]\n\n[[book:bk-2]]\n\nWant me to queue one?';
    expect(plainReply(reply)).toBe('You have two unstarted books:\n\n- "My Life and Work"\n\nWant me to queue one?');
  });

  it('drops highlight and thought markers, keeps markdown', () => {
    expect(plainReply('**Yes.** You marked this: [[ref:highlight:hl-9]] and [[suggest:thought:s-1]]')).toBe(
      '**Yes.** You marked this: and',
    );
  });

  it('keeps a nested list indented', () => {
    expect(plainReply('- one\n  - two')).toBe('- one\n  - two');
  });

  it('leaves a reply without markers alone', () => {
    expect(plainReply('  Just words.  ')).toBe('Just words.');
  });
});

describe('replyMarkerPattern', () => {
  it('names the kind and the id', () => {
    const match = replyMarkerPattern().exec('see [[ref:thought:th-1]]');
    expect(match?.slice(1)).toEqual(['ref', 'thought', undefined, 'th-1']);
  });
});
