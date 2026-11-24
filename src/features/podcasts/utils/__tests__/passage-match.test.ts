import { describe, expect, it } from 'vitest';

import { findPassage, PassageIndex, passageWords, type PassageLine } from '@/features/podcasts/utils/passage-match';

const lines = (...texts: [string, number][]): PassageIndex => new PassageIndex(texts.map(([text, start]): PassageLine => ({ text, start })));

describe('passageWords', () => {
  it('compares words without case, punctuation, accents, filler, stutters or a word said twice', () => {
    expect(passageWords("You, you didn't finish the story because y- you got up to the Café, um, so forth,")).toEqual([
      'you',
      "didn't",
      'finish',
      'the',
      'story',
      'because',
      'you',
      'got',
      'up',
      'to',
      'the',
      'cafe',
      'so',
      'forth',
    ]);
  });

  it('leaves out the sounds noted in square brackets, unless that is all there is', () => {
    expect(passageWords('[laughs] No, stop. Stop.')).toEqual(passageWords('No, stop, stop. [laughing]'));
    expect(passageWords('[laughs]')).toEqual(['laughs']);
  });

  it('keeps a hyphenated word as its words, and a curly apostrophe as a straight one', () => {
    expect(passageWords('A well-known fact, isn’t it?')).toEqual(['a', 'well', 'known', 'fact', "isn't", 'it']);
  });
});

describe('findPassage', () => {
  const index = lines(
    ['So, so wait a minute.', 10],
    ["You didn't finish the story because you got up to the fact", 12],
    ['that they were trading their tokens and so forth,', 15],
    ['but when they broke out, they, they...', 18],
    ["That's, so go, go from there.", 21],
  );

  it('finds a line written differently the second time', () => {
    const found = findPassage(index, "You, you didn't finish the story because y- you got up to the fact that they were trading their tokens and so forth,", 12);
    expect(found).toEqual({ first: 1, last: 2, similarity: 1 });
  });

  it('takes a word heard differently', () => {
    const found = findPassage(index, 'but when they broke loose, they, th- they...', 18);
    expect(found?.first).toBe(3);
    expect(found?.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('finds a passage now inside a longer line', () => {
    expect(findPassage(index, 'trading their tokens', null)).toMatchObject({ first: 2, last: 2 });
  });

  it('is null when two words in a short line differ', () => {
    expect(findPassage(index, 'but when they broke loose, they, th- that is', 18)).toBeNull();
  });

  it('is null when the words are not there closely enough', () => {
    expect(findPassage(index, 'the cat sat on the mat and looked out of the window', 12)).toBeNull();
  });

  it('wants a short passage word for word', () => {
    expect(findPassage(index, 'So wait a minute.', 10)).toMatchObject({ first: 0, similarity: 1 });
    expect(findPassage(index, 'So wait one minute.', 10)).toBeNull();
  });

  it('does not find a short passage as a word inside a long line', () => {
    const long = lines(['Well...', 10], ['Although scientists are discovering this as well, it is not what it seems.', 12]);
    expect(findPassage(long, 'Well... [laughs]', 11)?.first).toBe(0);
    expect(findPassage(lines(['Although scientists are discovering this as well, it is not what it seems.', 12]), 'Well... [laughs]', 11)).toBeNull();
  });

  it('chooses the repeat nearest the old moment', () => {
    const repeats = lines(['Exactly right.', 100], ['Something in between.', 400], ['Exactly right.', 700]);
    expect(findPassage(repeats, 'Exactly right.', 690)?.first).toBe(2);
    expect(findPassage(repeats, 'Exactly right.', 95)?.first).toBe(0);
  });

  it('tells two lines alike in a row apart', () => {
    const twice = lines(['[laughs]', 3570.4], ['[laughs]', 3571.9], ['And then it went on.', 3573]);
    expect(findPassage(twice, '[laughs]', 3571.9)?.first).toBe(1);
  });

  it('looks beyond the old moment when it is not near it', () => {
    const far = lines(['An opening line of the show.', 0], ['The words that were highlighted are here now.', 900]);
    expect(findPassage(far, 'The words that were highlighted are here now.', 30)?.first).toBe(1);
  });

  it('looks only near the old moment when asked to', () => {
    const far = lines(['An opening line of the show.', 0], ['The words that were highlighted are here now.', 900]);
    expect(findPassage(far, 'The words that were highlighted are here now.', 30, { nearOnly: true })).toBeNull();
  });

  it('is null for a passage with no words', () => {
    expect(findPassage(index, '...', 10)).toBeNull();
  });
});
