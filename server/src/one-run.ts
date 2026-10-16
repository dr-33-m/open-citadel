/**
 * One request, one run, however many steps the agent loop took inside it.
 *
 * TanStack AI's `chat()` runs server tools in its own loop: the model calls
 * `web_search`, the server runs it, and the model is asked again, all inside
 * one response. Each of those model calls is an adapter stream of its own, so
 * each brings its own `RUN_STARTED` and `RUN_FINISHED`, and the second one
 * carries only its own usage.
 *
 * Two things downstream were written for exactly one of each, and both break:
 *
 * - **Billing.** `meterStream` settles credits on a `RUN_FINISHED`. On the
 *   first of several it charged the first step alone and the rest of the turn
 *   was never billed (the settle is single-winner, so the later ones were
 *   no-ops).
 * - **The app.** `ChatClient` treats a `RUN_FINISHED` as the end of the
 *   request's processing. With one arriving mid-response it could decide the
 *   server tool's result was the last word and send a continuation of its own
 *   while the server was still writing the answer: the same turn twice.
 *
 * So the steps are joined here. The first `RUN_STARTED` passes; a later one
 * proves the `RUN_FINISHED` before it was a step and not the end, and both are
 * dropped. Usage is summed across every step and put on the one
 * `RUN_FINISHED` that does go out, at the end, followed by whatever came after
 * it (a client tool's call, an approval request) in the order it came.
 *
 * A step that fails after an earlier one finished ends the run as a failure:
 * the held finish is dropped, so a turn that errors is not charged for its
 * first half (the same rule `meterStream` applies to any failed turn).
 *
 * Every step also has its own `runId` (the OpenRouter adapter makes one per
 * model call), so the finish that goes out is stamped with the id of the start
 * that went out. `ChatClient` closes runs by id: a finish for a run it never
 * saw start ends the request but leaves the first run open, and the client
 * goes on reporting a run in progress.
 *
 * Pure over an async iterable so it can be tested without a model.
 */
import type { StreamChunk } from '@tanstack/ai';

type Usage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  promptTokensDetails?: { cachedTokens?: number } | null;
};

type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number | null;
  cachedTokens: number | null;
  reported: boolean;
};

function addUsage(totals: UsageTotals, raw: unknown): void {
  const usage = raw as Usage | undefined;
  if (!usage) return;
  totals.reported = true;
  totals.promptTokens += usage.promptTokens ?? 0;
  totals.completionTokens += usage.completionTokens ?? 0;
  totals.totalTokens += usage.totalTokens ?? 0;
  if (typeof usage.cost === 'number') totals.cost = (totals.cost ?? 0) + usage.cost;
  const cached = usage.promptTokensDetails?.cachedTokens;
  if (typeof cached === 'number') totals.cachedTokens = (totals.cachedTokens ?? 0) + cached;
}

function summedUsage(totals: UsageTotals): Usage | undefined {
  if (!totals.reported) return undefined;
  return {
    promptTokens: totals.promptTokens,
    completionTokens: totals.completionTokens,
    totalTokens: totals.totalTokens,
    ...(totals.cost !== null ? { cost: totals.cost } : {}),
    ...(totals.cachedTokens !== null ? { promptTokensDetails: { cachedTokens: totals.cachedTokens } } : {}),
  };
}

export async function* asOneRun(stream: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
  const totals: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: null,
    cachedTokens: null,
    reported: false,
  };
  let started = false;
  let runId: string | undefined;
  let held: StreamChunk | null = null;
  let after: StreamChunk[] = [];
  /** A terminal chunk, under the id of the run the client saw start. */
  const asTheRun = (end: StreamChunk): StreamChunk =>
    runId !== undefined && (end as { runId?: unknown }).runId !== runId ? ({ ...end, runId } as StreamChunk) : end;

  for await (const chunk of stream) {
    if (chunk.type === 'RUN_STARTED') {
      if (!started) {
        started = true;
        const id = (chunk as { runId?: unknown }).runId;
        runId = typeof id === 'string' ? id : undefined;
        yield chunk;
        continue;
      }
      // Another step: the finish being held was not the end.
      held = null;
      yield* after;
      after = [];
      continue;
    }
    if (chunk.type === 'RUN_FINISHED') {
      // Two finishes with no start between them: the first was a step all the same.
      if (held) {
        yield* after;
        after = [];
      }
      addUsage(totals, (chunk as { usage?: unknown }).usage);
      held = chunk;
      continue;
    }
    if (chunk.type === 'RUN_ERROR') {
      if (held) {
        held = null;
        yield* after;
        after = [];
      }
      yield asTheRun(chunk);
      continue;
    }
    if (held) {
      after.push(chunk);
      continue;
    }
    yield chunk;
  }

  if (held) {
    const usage = summedUsage(totals);
    yield asTheRun((usage ? { ...held, usage } : held) as StreamChunk);
  }
  yield* after;
}
