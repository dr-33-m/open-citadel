/**
 * Telling a long piece of work from a model going round in circles.
 *
 * A turn used to stop at a fixed count of tool calls (twelve), which could not
 * tell the two apart: writing seven video scripts from seven books honestly
 * needs more than twelve looks into the library, and was cut off mid-job with
 * no word said. What a circling model actually does is ask for the same thing
 * again, with the same input, having already been given the answer. That is
 * what this watches for. The hard ceiling in `samwell-shared` stays as a
 * backstop, and the per-message credit ceiling on the server is what bounds
 * the cost.
 */

/** The same call this many times in one turn is circling. */
export const CIRCLING_REPEATS = 3;

/** Key order and spacing do not make a call a different call. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** One string per distinct call: the tool's name and its input. */
export function callSignature(name: string, args: string): string {
  try {
    return `${name}:${JSON.stringify(canonical(JSON.parse(args)))}`;
  } catch {
    return `${name}:${args.trim()}`;
  }
}

export type CircleWatch = {
  /** Counts a call once, however often it is seen; true once it is circling. */
  record: (id: string, name: string, args: string) => boolean;
};

export function createCircleWatch(repeats: number = CIRCLING_REPEATS): CircleWatch {
  const counts = new Map<string, number>();
  const seenIds = new Set<string>();
  return {
    record(id, name, args) {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      const signature = callSignature(name, args);
      const count = (counts.get(signature) ?? 0) + 1;
      counts.set(signature, count);
      return count >= repeats;
    },
  };
}
