import { describe, expect, it } from 'vitest';

import { keywords, probesFor } from '../gutenberg.js';

/**
 * The query that came back empty on the first real run.
 *
 * The catalogue was fully loaded, the request reached the container, and
 * Gutendex answered `{"count":0,...}` in 52 bytes — because `search` ANDs every
 * space-separated term against title and author, and no book is titled with
 * the words "of" and "and" and "biographies" at once. Samwell then told a
 * brand new user that Project Gutenberg had nothing on what they cared about.
 */
const THE_QUERY = 'interested in Biographies of great entrepreneurs and entrepreneurship';

function paramsOf(query: string): string[] {
  return probesFor(query).map((p) => decodeURIComponent(p.params));
}

describe('keywords', () => {
  it('keeps only what a catalogue could match', () => {
    // "interested" and "great" carry no shelf between them, and each one
    // would otherwise eat one of the four probes the real words need.
    expect(keywords(THE_QUERY)).toEqual([
      'biographies',
      'entrepreneurs',
      'entrepreneurship',
    ]);
  });

  it('drops duplicates and punctuation', () => {
    expect(keywords('Stoicism, stoicism and STOICISM!')).toEqual(['stoicism']);
  });

  it('survives a query that is nothing but stopwords', () => {
    expect(keywords('how do I get more out of this')).toEqual([]);
  });
});

describe('probesFor', () => {
  it('asks about the words rather than the sentence', () => {
    const params = paramsOf(THE_QUERY);

    // The whole phrase as one `search` is the thing that returned nothing.
    expect(params).not.toContain(`search=${THE_QUERY.toLowerCase()}`);

    // Stems, so `topic`'s substring match reaches "Biography" from
    // "biographies" and "Entrepreneurship" from "entrepreneurs".
    expect(params).toContain('topic=biography');
    expect(params).toContain('topic=entrepreneur');
  });

  it('still tries the literal reading when it could actually match', () => {
    // Three words or fewer can share one title, so it is worth one request.
    expect(paramsOf('Marcus Aurelius Meditations')).toContain(
      'search=marcus aurelius meditations',
    );
  });

  it('never asks the catalogue to match the sentence it was given', () => {
    const params = paramsOf(THE_QUERY);
    // At most one probe is allowed to carry more than a single word, and it
    // carries the keywords rather than the filler they were buried in.
    const multiWord = params.filter((p) => p.split(' ').length > 1);
    expect(multiWord).toEqual(['search=biographies entrepreneurs entrepreneurship']);
  });

  it('asks something even when every word is a stopword', () => {
    expect(paramsOf('how do I get more out of this')).toEqual([
      'search=how do I get more out of this',
    ]);
  });

  it('stays within a handful of requests', () => {
    expect(probesFor('a b c d e f g h i j k l m n o p').length).toBeLessThanOrEqual(9);
  });
});
