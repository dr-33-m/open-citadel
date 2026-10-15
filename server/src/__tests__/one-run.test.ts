import type { StreamChunk } from '@tanstack/ai';
import { describe, expect, it } from 'vitest';

import { asOneRun } from '../one-run.js';

const chunk = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra }) as unknown as StreamChunk;

async function collect(chunks: StreamChunk[]): Promise<StreamChunk[]> {
  async function* source() {
    yield* chunks;
  }
  const out: StreamChunk[] = [];
  for await (const c of asOneRun(source())) out.push(c);
  return out;
}

const types = (chunks: StreamChunk[]) => chunks.map((c) => c.type);

describe('asOneRun', () => {
  it('leaves a single-step run as it was', async () => {
    const out = await collect([
      chunk('RUN_STARTED'),
      chunk('TEXT_MESSAGE_CONTENT', { delta: 'hi' }),
      chunk('RUN_FINISHED', { finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 } }),
    ]);
    expect(types(out)).toEqual(['RUN_STARTED', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED']);
    expect((out[2] as { usage?: unknown }).usage).toEqual({ promptTokens: 10, completionTokens: 2, totalTokens: 12 });
  });

  it('joins a server tool step and the answer into one run with summed usage', async () => {
    const out = await collect([
      chunk('RUN_STARTED'),
      chunk('TOOL_CALL_START', { toolCallName: 'web_search' }),
      chunk('TOOL_CALL_END'),
      chunk('RUN_FINISHED', {
        finishReason: 'tool_calls',
        usage: { promptTokens: 100, completionTokens: 5, totalTokens: 105, cost: 0.01, promptTokensDetails: { cachedTokens: 80 } },
      }),
      chunk('TOOL_CALL_END', { result: '{"sources":[]}' }),
      chunk('RUN_STARTED'),
      chunk('TEXT_MESSAGE_CONTENT', { delta: 'answer' }),
      chunk('RUN_FINISHED', {
        finishReason: 'stop',
        usage: { promptTokens: 300, completionTokens: 50, totalTokens: 350, cost: 0.02, promptTokensDetails: { cachedTokens: 90 } },
      }),
    ]);
    expect(types(out)).toEqual(['RUN_STARTED', 'TOOL_CALL_START', 'TOOL_CALL_END', 'TOOL_CALL_END', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED']);
    const finish = out.at(-1) as { finishReason?: string; usage?: Record<string, unknown> };
    expect(finish.finishReason).toBe('stop');
    expect(finish.usage).toEqual({
      promptTokens: 400,
      completionTokens: 55,
      totalTokens: 455,
      cost: expect.closeTo(0.03, 10),
      promptTokensDetails: { cachedTokens: 170 },
    });
  });

  it('keeps what follows the last finish after it, in order', async () => {
    const out = await collect([
      chunk('RUN_STARTED'),
      chunk('TOOL_CALL_START', { toolCallName: 'add_to_queue' }),
      chunk('RUN_FINISHED', { finishReason: 'tool_calls' }),
      chunk('CUSTOM', { name: 'approval-requested' }),
    ]);
    expect(types(out)).toEqual(['RUN_STARTED', 'TOOL_CALL_START', 'RUN_FINISHED', 'CUSTOM']);
  });

  it('drops an earlier finish when a later step fails, so nothing is settled', async () => {
    const out = await collect([
      chunk('RUN_STARTED'),
      chunk('RUN_FINISHED', { finishReason: 'tool_calls', usage: { promptTokens: 5 } }),
      chunk('TOOL_CALL_END', { result: '{}' }),
      chunk('RUN_ERROR', { message: 'upstream' }),
    ]);
    expect(types(out)).toEqual(['RUN_STARTED', 'TOOL_CALL_END', 'RUN_ERROR']);
  });

  it('ends the run under the id it started with, though each step has its own', async () => {
    const out = await collect([
      chunk('RUN_STARTED', { runId: 'step-1' }),
      chunk('RUN_FINISHED', { runId: 'step-1', finishReason: 'tool_calls' }),
      chunk('TOOL_CALL_RESULT', { toolCallId: 't1' }),
      chunk('RUN_STARTED', { runId: 'step-2' }),
      chunk('RUN_FINISHED', { runId: 'step-2', finishReason: 'stop' }),
    ]);
    expect(out.map((c) => (c as { runId?: string }).runId)).toEqual(['step-1', undefined, 'step-1']);
  });

  it('fails the run under the id it started with', async () => {
    const out = await collect([
      chunk('RUN_STARTED', { runId: 'step-1' }),
      chunk('RUN_FINISHED', { runId: 'step-1', finishReason: 'tool_calls' }),
      chunk('RUN_STARTED', { runId: 'step-2' }),
      chunk('RUN_ERROR', { runId: 'step-2', message: 'upstream' }),
    ]);
    expect(types(out)).toEqual(['RUN_STARTED', 'RUN_ERROR']);
    expect((out[1] as { runId?: string }).runId).toBe('step-1');
  });

  it('passes a finish with no usage through untouched', async () => {
    const out = await collect([chunk('RUN_STARTED'), chunk('RUN_FINISHED', { finishReason: 'stop' })]);
    expect((out[1] as { usage?: unknown }).usage).toBeUndefined();
  });
});
