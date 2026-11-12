/**
 * Runs Samwell's prompts against `scenarios.ts` and has a second model score
 * each reply. Costs real money, so it is run by hand and not by `pnpm test`:
 *
 *   OPENROUTER_API_KEY=... pnpm exec tsx server/evals/run.ts [model ...] [--only "text"]
 *
 * Tools are stubbed, since what is being judged is what he does with what comes
 * back, not whether the tools work. Prompts are the server's own, in the order
 * `personaPromptsFor` sends them.
 */
import {
  COMPASS_CLIENT_TOOL_DEFINITIONS,
  COMPASS_SYSTEM_PROMPT,
  DISCOVERY_CLIENT_TOOL_DEFINITIONS,
  SAMWELL_APP_GUIDE_TOOL_PROMPT,
  SAMWELL_CLIENT_TOOL_DEFINITIONS,
  SAMWELL_DISCOVERY_TOOL_PROMPT,
  SAMWELL_JOURNEY_TOOL_PROMPT,
  SAMWELL_LISTENING_TOOL_PROMPT,
  SAMWELL_MOMENTS_PROMPT,
  SAMWELL_SYSTEM_PROMPT,
  SAMWELL_WEB_SEARCH_TOOL_PROMPT,
  webSearchTool,
} from 'samwell-shared';
import { z } from 'zod';

import { SCENARIOS, type Mode, type Scenario } from './scenarios.js';

const URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODELS = ['anthropic/claude-haiku-5.5', 'z-ai/glm-5.3-flash', 'openai/gpt-6-luna-pro'];
const JUDGE = process.env.EVAL_JUDGE_MODEL ?? 'anthropic/claude-sonnet-5.5';
/** A little room for looking things up; he should not need more for these. */
const MAX_TOOL_ROUNDS = 5;

type Message = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
type ToolCall = { id: string; function: { name: string; arguments: string } };
type Tool = { name: string; description: string; inputSchema: unknown };

function promptsFor(mode: Mode): string[] {
  const shared = [SAMWELL_WEB_SEARCH_TOOL_PROMPT, SAMWELL_LISTENING_TOOL_PROMPT, SAMWELL_DISCOVERY_TOOL_PROMPT, SAMWELL_MOMENTS_PROMPT];
  return mode === 'compass'
    ? [COMPASS_SYSTEM_PROMPT, SAMWELL_JOURNEY_TOOL_PROMPT, ...shared]
    : [SAMWELL_SYSTEM_PROMPT, SAMWELL_JOURNEY_TOOL_PROMPT, SAMWELL_APP_GUIDE_TOOL_PROMPT, ...shared];
}

function toolsFor(mode: Mode) {
  const base = mode === 'compass' ? COMPASS_CLIENT_TOOL_DEFINITIONS : SAMWELL_CLIENT_TOOL_DEFINITIONS;
  const all = [...base, ...DISCOVERY_CLIENT_TOOL_DEFINITIONS, webSearchTool] as unknown as Tool[];
  return all.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: z.toJSONSchema(tool.inputSchema as z.ZodType) },
  }));
}

async function complete(body: Record<string, unknown>): Promise<Message> {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: { data_collection: 'deny' }, ...body }),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = (await response.json()) as { choices: { message: Message }[] };
  return json.choices[0].message;
}

/** His reply, and the tools he reached for on the way to it. */
async function reply(scenario: Scenario, model: string): Promise<{ text: string; used: string[] }> {
  const system = [...promptsFor(scenario.mode), ...(scenario.memory ? [scenario.memory] : [])].join('\n\n');
  const messages: Message[] = [
    { role: 'system', content: system },
    ...scenario.turns.map((content, index) => ({ role: index % 2 === 0 ? 'user' : 'assistant', content })),
  ];
  const used: string[] = [];
  const tools = toolsFor(scenario.mode);
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const message = await complete({ model, messages, tools, max_tokens: 1200 });
    if (!message.tool_calls?.length) return { text: message.content ?? '', used };
    messages.push(message);
    for (const call of message.tool_calls) {
      used.push(call.function.name);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: scenario.toolAnswers?.[call.function.name] ?? 'Nothing found.',
      });
    }
  }
  return { text: '(ran out of tool rounds without answering)', used };
}

async function judge(scenario: Scenario, text: string, used: string[]): Promise<{ pass: boolean; why: string }> {
  const message = await complete({
    model: JUDGE,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You grade a reply from an AI self-development companion against a pass condition. Be strict but fair: every part of the condition must hold. Reply with JSON only: {"pass": boolean, "why": "one short sentence"}.',
      },
      {
        role: 'user',
        content: JSON.stringify({ conversation: scenario.turns, tools_used: used, reply: text, pass_condition: scenario.pass }),
      },
    ],
  });
  try {
    const raw = (message.content ?? '').replace(/^```(json)?|```$/g, '').trim();
    return z.object({ pass: z.boolean(), why: z.string() }).parse(JSON.parse(raw));
  } catch {
    return { pass: false, why: `judge answered unreadably: ${(message.content ?? '').slice(0, 120)}` };
  }
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set.');
  const args = process.argv.slice(2);
  const onlyAt = args.indexOf('--only');
  const only = onlyAt >= 0 ? args[onlyAt + 1]?.toLowerCase() : null;
  const named = args.filter((arg, index) => !arg.startsWith('--') && (onlyAt < 0 || index !== onlyAt + 1));
  const models = named.length > 0 ? named : DEFAULT_MODELS;
  const scenarios = only ? SCENARIOS.filter((s) => s.name.toLowerCase().includes(only)) : SCENARIOS;

  let failed = 0;
  for (const model of models) {
    let passed = 0;
    console.log(`\n${model}`);
    for (const scenario of scenarios) {
      try {
        const { text, used } = await reply(scenario, model);
        const verdict = await judge(scenario, text, used);
        if (verdict.pass) passed += 1;
        console.log(`  ${verdict.pass ? 'PASS' : 'FAIL'}  ${scenario.name}${used.length ? `  [${used.join(', ')}]` : ''}`);
        if (!verdict.pass) console.log(`        ${verdict.why}\n        said: ${text.slice(0, 400).replace(/\n/g, ' ')}`);
      } catch (error) {
        console.log(`  ERROR ${scenario.name}: ${error instanceof Error ? error.message : error}`);
      }
    }
    failed += scenarios.length - passed;
    console.log(`  ${passed}/${scenarios.length}`);
  }
  process.exitCode = failed > 0 ? 1 : 0;
}

void main();
