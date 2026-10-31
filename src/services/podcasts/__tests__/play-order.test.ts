import { describe, expect, it } from 'vitest';

import { playOrder, splitAfterMove, splitQueue } from '@/services/podcasts/player/play-order';

const started = (...ids: string[]) => ids.map((id): { id: string; queuePosition: number | null } => ({ id, queuePosition: null }));
const queued = (...rows: [string, number][]) => rows.map(([id, queuePosition]) => ({ id, queuePosition }));
const ids = (list: { id: string }[]) => list.map((episode) => episode.id);

describe('playOrder', () => {
  it('finishes what is under way before starting the queue', () => {
    expect(ids(playOrder(started('a', 'b', 'c'), queued(['d', 0], ['e', 1])))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('plays an episode in both lists once, with those under way', () => {
    expect(ids(playOrder(started('a', 'b'), queued(['c', 0], ['b', 1], ['d', 2])))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is the queue alone when nothing is under way', () => {
    expect(ids(playOrder([], queued(['c', 0], ['d', 1])))).toEqual(['c', 'd']);
  });

  it('puts "Play next" ahead of what is under way', () => {
    const order = playOrder(started('a', 'b'), queued(['x', -2], ['y', -1], ['c', 0]));
    expect(ids(order)).toEqual(['x', 'y', 'a', 'b', 'c']);
  });

  it('plays a part-played episode marked "Play next" first, and once', () => {
    expect(ids(playOrder(started('a', 'b'), queued(['b', -1], ['c', 0])))).toEqual(['b', 'a', 'c']);
  });
});

describe('splitQueue', () => {
  it('parts the "Play next" block from the rest', () => {
    expect(splitQueue(queued(['x', -1], ['c', 0], ['d', 1]))).toEqual({ playNext: ['x'], rest: ['c', 'd'] });
  });
});

describe('splitAfterMove', () => {
  const queue = queued(['x', -2], ['y', -1], ['c', 0], ['d', 1]);

  it('joins the block when dropped inside it', () => {
    expect(splitAfterMove(queue, 'd', 1)).toEqual({ playNext: ['x', 'd', 'y'], rest: ['c'] });
  });

  it('leaves the block when dragged below it', () => {
    expect(splitAfterMove(queue, 'x', 2)).toEqual({ playNext: ['y'], rest: ['c', 'x', 'd'] });
  });

  it('stays an ordinary place when moved within the rest', () => {
    expect(splitAfterMove(queue, 'd', 2)).toEqual({ playNext: ['x', 'y'], rest: ['d', 'c'] });
  });

  it('keeps a move inside a queue with no block ordinary', () => {
    expect(splitAfterMove(queued(['c', 0], ['d', 1]), 'd', 0)).toEqual({ playNext: [], rest: ['d', 'c'] });
  });

  it('holds an index past either end to the end', () => {
    expect(splitAfterMove(queue, 'c', 99)).toEqual({ playNext: ['x', 'y'], rest: ['d', 'c'] });
  });
});
