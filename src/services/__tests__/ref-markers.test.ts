import { describe, expect, it } from 'vitest';

import { refsInToolResults, repairRefMarkers } from '../ref-markers';

// A search result as `formatSearchResultsForLLM` writes it, from a real chat.
const RESULT = `1. "There are other reasons why the Autobiography should be an intimate friend of American young people. Here they may establish a close relationship with one of the foremost Americans as well as one of the wisest men of his age."
   Book: Autobiography of Benjamin Franklin
   Tags: biography
   ID: hl-1790165338809-56n8e8
   Ref: [[ref:highlight:hl-1790165338809-56n8e8]]

2. "Short one."
   Book: Walden
   ID: th-42
   Ref: [[ref:thought:th-42]]`;

const refs = refsInToolResults([RESULT]);
const FRANKLIN = '[[ref:highlight:hl-1790165338809-56n8e8]]';

describe('refsInToolResults', () => {
  it('reads each entry a search named, with its text', () => {
    expect(refs.map((r) => [r.type, r.id])).toEqual([
      ['highlight', 'hl-1790165338809-56n8e8'],
      ['thought', 'th-42'],
    ]);
    expect(refs[0].text.startsWith('There are other reasons')).toBe(true);
    expect(refs[1].text).toBe('Short one.');
  });

  it('names an entry once, however often it was found', () => {
    expect(refsInToolResults([RESULT, RESULT])).toHaveLength(2);
  });
});

describe('repairRefMarkers', () => {
  it('points a mistyped id at the entry it meant', () => {
    const reply = 'The marker is [[ref:highlight:hl-12790165383809-56n8e8]]. Tap it.';
    expect(repairRefMarkers(reply, refs)).toBe(`The marker is ${FRANKLIN}. Tap it.`);
  });

  it('leaves a correct marker, and one that matches nothing known, alone', () => {
    const reply = `${FRANKLIN} and [[ref:highlight:hl-99]]`;
    expect(repairRefMarkers(reply, refs)).toBe(reply);
  });

  it('never mends an id into an entry of the other kind', () => {
    const reply = '[[ref:highlight:th-43]]';
    expect(repairRefMarkers(reply, refs)).toBe(reply);
  });

  it('adds the card for a highlight quoted without its marker, even loosely', () => {
    const reply =
      'Here is the highlight: "There are other reasons why the Autobiography should be an intimate friend of American young people. they may establish a close relationship with one of the foremost Americans as well as as one of wisest men of his age."';
    expect(repairRefMarkers(reply, refs)).toBe(`${reply}\n\n${FRANKLIN}`);
  });

  it('adds no card for an entry only mentioned in passing, or too short to tell', () => {
    const reply = 'Franklin wrote about young people, and this is a short one.';
    expect(repairRefMarkers(reply, refs)).toBe(reply);
  });

  it('adds nothing when no tool showed an entry', () => {
    expect(repairRefMarkers('[[ref:highlight:hl-1]]', [])).toBe('[[ref:highlight:hl-1]]');
  });
});
