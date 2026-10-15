/**
 * What the app's `ChatClient` makes of a turn joined by `asOneRun`.
 *
 * The unit tests in `one-run.test.ts` say what the stream looks like; this
 * says what a real `ChatClient` does with it: a server tool's step and the
 * answer after it end as one turn, with no continuation of the client's own,
 * and a client tool called after a server tool is still run and answered.
 * The chunks are the ones `chat()` and the OpenRouter adapter emit, each
 * model call with its own run and message ids.
 */
import type { StreamChunk } from '@tanstack/ai';
import { toolDefinition } from '@tanstack/ai';
import { ChatClient } from '@tanstack/ai-client';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { asOneRun } from '../one-run.js';

const at = { timestamp: 0, model: 'test' };

function step(runId: string, body: Record<string, unknown>[], finishReason: string): StreamChunk[] {
  return [
    { type: 'RUN_STARTED', runId, threadId: 'thread', ...at },
    ...body.map((chunk) => ({ ...at, ...chunk })),
    { type: 'RUN_FINISHED', runId, threadId: 'thread', finishReason, ...at },
  ] as StreamChunk[];
}

const text = (messageId: string, delta: string) => [
  { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
  { type: 'TEXT_MESSAGE_CONTENT', messageId, delta },
  { type: 'TEXT_MESSAGE_END', messageId },
];

const toolCall = (toolCallId: string, name: string, args: string) => [
  { type: 'TOOL_CALL_START', toolCallId, toolCallName: name, toolName: name },
  { type: 'TOOL_CALL_ARGS', toolCallId, delta: args },
  { type: 'TOOL_CALL_END', toolCallId, toolCallName: name, toolName: name },
];

const searched = { type: 'TOOL_CALL_RESULT', messageId: 'r1', toolCallId: 'web-1', role: 'tool', content: '{"query":"luxury","sources":[{"title":"A","url":"https://a.test","snippet":""}]}', ...at } as StreamChunk;

async function* joined(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  yield* asOneRun(
    (async function* () {
      for (const chunk of chunks) {
        await Promise.resolve();
        yield chunk;
      }
    })(),
  );
}

type ChatClientTools = NonNullable<ConstructorParameters<typeof ChatClient>[0]['tools']>;

function client(responses: StreamChunk[][], tools?: ChatClientTools) {
  const requests: unknown[][] = [];
  const chat = new ChatClient({
    connection: {
      connect(messages: unknown[]) {
        requests.push(messages);
        const next = responses.shift();
        if (!next) throw new Error('an unexpected extra request');
        return joined(next);
      },
    },
    tools,
  });
  return { chat, requests };
}

describe('a joined run in ChatClient', () => {
  it('ends a web search and its answer as one turn, with no second request', async () => {
    const { chat, requests } = client([
      [
        ...step('step-1', toolCall('web-1', 'web_search', '{"query":"luxury"}'), 'tool_calls'),
        searched,
        ...step('step-2', text('m2', 'Here is what I found.'), 'stop'),
      ],
    ]);
    await chat.sendMessage('who wrote it?');

    expect(requests).toHaveLength(1);
    expect(chat.getStatus()).toBe('ready');
    const assistant = chat.getMessages().filter((m) => m.role === 'assistant');
    const parts = assistant.flatMap((m) => m.parts);
    const call = parts.find((p) => p.type === 'tool-call');
    expect(call).toMatchObject({ name: 'web_search', output: { query: 'luxury' } });
    expect(parts.filter((p) => p.type === 'text').map((p) => (p as { content: string }).content).join('')).toBe('Here is what I found.');
  });

  it('still runs a client tool called after a server tool, then continues once', async () => {
    const lookups: unknown[] = [];
    const searchLibrary = toolDefinition({
      name: 'search_library',
      description: 'find a book',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ total: z.number() }),
    }).client(async (input) => {
      lookups.push(input);
      return { total: 1 };
    });

    const { chat, requests } = client(
      [
        [
          ...step('step-1', toolCall('web-1', 'web_search', '{"query":"luxury"}'), 'tool_calls'),
          searched,
          ...step('step-2', toolCall('lib-1', 'search_library', '{"query":"luxury"}'), 'tool_calls'),
          {
            type: 'CUSTOM',
            name: 'tool-input-available',
            value: { toolCallId: 'lib-1', toolName: 'search_library', input: { query: 'luxury' } },
            ...at,
          } as StreamChunk,
        ],
        step('step-3', text('m3', 'It is in your Fashion collection.'), 'stop'),
      ],
      [searchLibrary] as unknown as ChatClientTools,
    );
    await chat.sendMessage('do I have it?');
    // The continuation is sent once the tool's result is in; let it land.
    for (let i = 0; i < 50 && requests.length < 2; i += 1) await new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < 50 && chat.getStatus() !== 'ready'; i += 1) await new Promise((r) => setTimeout(r, 5));

    expect(lookups).toEqual([{ query: 'luxury' }]);
    expect(requests).toHaveLength(2);
    expect(chat.getStatus()).toBe('ready');
    const said = chat
      .getMessages()
      .filter((m) => m.role === 'assistant')
      .flatMap((m) => m.parts)
      .filter((p) => p.type === 'text')
      .map((p) => (p as { content: string }).content)
      .join('');
    expect(said).toBe('It is in your Fashion collection.');
  });
});
