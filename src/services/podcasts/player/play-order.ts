type Queued = { id: string; queuePosition: number | null };

/**
 * "Play next" is a promise about what comes next, so it sits ahead of
 * everything else. Those episodes are the front of Up Next, marked by a position
 * below zero (see `queue`), which also keeps them in order and across a restart.
 */
function isPlayNext(episode: Queued): boolean {
  return episode.queuePosition != null && episode.queuePosition < 0;
}

/**
 * What plays next: "Play next", then whatever is part-way through, most recently
 * heard first, then the rest of Up Next. An episode in two of these plays once,
 * at the first of them.
 */
export function playOrder<T extends Queued>(inProgress: T[], upNext: T[]): T[] {
  const playNext = upNext.filter(isPlayNext);
  const placed = new Set(playNext.map((episode) => episode.id));
  const started = inProgress.filter((episode) => !placed.has(episode.id));
  for (const episode of started) placed.add(episode.id);
  return [...playNext, ...started, ...upNext.filter((episode) => !placed.has(episode.id))];
}

/** Up Next in two parts: the "Play next" block at its front, and the rest. */
export function splitQueue(queue: Queued[]): { playNext: string[]; rest: string[] } {
  return {
    playNext: queue.filter(isPlayNext).map((episode) => episode.id),
    rest: queue.filter((episode) => !isPlayNext(episode)).map((episode) => episode.id),
  };
}

/**
 * Up Next after an episode is dragged to `toIndex`. Dropped inside the "Play
 * next" block it joins it; dropped below, it is an ordinary place in the queue.
 */
export function splitAfterMove(queue: Queued[], id: string, toIndex: number): { playNext: string[]; rest: string[] } {
  const { playNext, rest } = splitQueue(queue.filter((episode) => episode.id !== id));
  const ordered = [...playNext, ...rest];
  const index = Math.max(0, Math.min(toIndex, ordered.length));
  ordered.splice(index, 0, id);
  const blockSize = index < playNext.length ? playNext.length + 1 : playNext.length;
  return { playNext: ordered.slice(0, blockSize), rest: ordered.slice(blockSize) };
}
