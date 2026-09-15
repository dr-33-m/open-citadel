import { describe, expect, it } from 'vitest';

import { hasThinkMarkers, splitThinking } from '../think-stream';

describe('splitThinking', () => {
  it('leaves a plain answer untouched', () => {
    expect(splitThinking('Hello there')).toEqual({
      visible: 'Hello there',
      thinking: '',
      isThinking: false,
    });
  });

  it('separates a finished reasoning block from the answer', () => {
    const r = splitThinking('<think>weighing it up</think>Hi! How can I help?');
    expect(r.visible).toBe('Hi! How can I help?');
    expect(r.thinking).toBe('weighing it up');
    expect(r.isThinking).toBe(false);
  });

  it('reports thinking while the block is still open', () => {
    const r = splitThinking('<think>still going');
    expect(r.visible).toBe('');
    expect(r.thinking).toBe('still going');
    expect(r.isThinking).toBe(true);
  });

  it('holds back a marker split across callbacks', () => {
    // The engine hands back accumulated text, so "<thi" can be all there is
    // of an opening tag so far. Showing it would flicker into the bubble.
    expect(splitThinking('Answer so far <thi').visible).toBe('Answer so far ');
    expect(splitThinking('<think>mid </thi').thinking).toBe('mid ');
  });

  it('handles several blocks in one stream', () => {
    const r = splitThinking('<think>one</think>A<think>two</think>B');
    expect(r.visible).toBe('AB');
    expect(r.thinking).toBe('onetwo');
    expect(r.isThinking).toBe(false);
  });

  it('keeps text that merely mentions the word think', () => {
    const r = splitThinking('I think that is right');
    expect(r.visible).toBe('I think that is right');
    expect(r.thinking).toBe('');
  });

  it('survives a close with no open', () => {
    expect(splitThinking('stray</think>tail').visible).toBe('stray</think>tail');
  });
});

describe('hasThinkMarkers', () => {
  it('spots either marker', () => {
    expect(hasThinkMarkers('a <think> b')).toBe(true);
    expect(hasThinkMarkers('plain')).toBe(false);
  });
});

describe('the handover from reasoning to answer', () => {
  it('leaves the separating blank lines on the visible side', () => {
    // Documents the shape the store has to cope with: a reasoning model closes
    // its trace and then emits the blank lines that separated it from the
    // answer, so `visible` is whitespace-only for a token or two.
    const r = splitThinking('<think>weighing it</think>\n\n');
    expect(r.visible).toBe('\n\n');
    expect(r.visible.trimStart()).toBe('');
    expect(r.isThinking).toBe(false);
  });

  it('keeps whitespace inside the answer once it has begun', () => {
    const r = splitThinking('<think>x</think>\n\nFirst line.\n\nSecond line.');
    expect(r.visible.trimStart()).toBe('First line.\n\nSecond line.');
  });
});

describe('the newlines the markers are written with', () => {
  it('opens the trace with the blank line that followed the tag', () => {
    // A model emits `<think>\n … \n</think>\n\n`, so both sides arrive padded.
    // The store trims at the edges before showing either; this documents what
    // it is trimming, so a change to the parser cannot silently undo it.
    const r = splitThinking('<think>\nWeighing it up.\n</think>\n\nHello.');
    expect(r.thinking).toBe('\nWeighing it up.\n');
    expect(r.thinking.trim()).toBe('Weighing it up.');
    expect(r.visible).toBe('\n\nHello.');
    expect(r.visible.trimStart()).toBe('Hello.');
  });
});
