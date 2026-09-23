import { Template } from '@huggingface/jinja';
import { describe, expect, it, vi } from 'vitest';

import gemma from './__fixtures__/gemma-4-e2b.tokenizer_config.json';
import qwen3 from './__fixtures__/qwen-3.tokenizer_config.json';

vi.mock('react-native-blob-util', () => ({ default: {} }));
vi.mock('@/lib/executorch', () => ({ getExecuTorch: () => null }));

const { specialTokensOf, withSpecialTokens } = await import('../engine');
const { asThinkMarkers, GEMMA_THOUGHT_MARKERS, THINK_MARKERS, withoutReasoning } = await import('../reply-format');

/*
 * The real templates, as ExecuTorch's registry ships them, rendered the way
 * its chat preprocessor renders them: messages, tools and the generation
 * prompt, and nothing else.
 */
function render(template: string, messages: { role: string; content: string }[], addGenPrompt: boolean) {
  return new Template(template).render({ messages, add_generation_prompt: addGenPrompt });
}

const SYSTEM = { role: 'system', content: 'You are Samwell.' };
const USER = { role: 'user', content: 'Hi' };

describe('withSpecialTokens', () => {
  it('gives Gemma 4 the BOS its template starts with', () => {
    // The bug it fixes: rendered as ExecuTorch renders it, there is no BOS.
    expect(render(gemma.chat_template, [SYSTEM, USER], true).startsWith('<bos>')).toBe(false);

    const text = render(withSpecialTokens(gemma.chat_template, gemma), [SYSTEM, USER], true);
    expect(text.startsWith('<bos><|turn>system\nYou are Samwell.')).toBe(true);
    expect(text.endsWith('<|turn>model\n')).toBe(true);
  });

  it('puts the BOS in the first render only, so the preprocessor can still diff turns', () => {
    const template = withSpecialTokens(gemma.chat_template, gemma);
    const system = render(template, [SYSTEM], false);
    const withUser = render(template, [SYSTEM, USER], false);
    expect(withUser.startsWith(system)).toBe(true);
    expect(withUser.slice(system.length)).not.toContain('<bos>');
  });

  it('leaves a template that never mentions a special token rendering as before', () => {
    const before = render(qwen3.chat_template, [SYSTEM, USER], true);
    expect(render(withSpecialTokens(qwen3.chat_template, qwen3), [SYSTEM, USER], true)).toBe(before);
  });
});

describe("Gemma 4's thinking switch", () => {
  it('writes its think token only when the conversation turns thinking on', () => {
    const template = withSpecialTokens(gemma.chat_template, gemma);
    const on = `{% set enable_thinking = true %}${template}`;
    expect(render(template, [SYSTEM, USER], true)).not.toContain('<|think|>');
    const thinking = render(on, [SYSTEM, USER], true);
    expect(thinking.startsWith('<bos><|turn>system\n<|think|>')).toBe(true);
    // Still renders turn by turn, which the preprocessor's diffing needs.
    expect(render(on, [SYSTEM, USER], false).startsWith(render(on, [SYSTEM], false))).toBe(true);
  });
});

describe('specialTokensOf', () => {
  it("names every token Gemma 4 can stop on, and its markup", () => {
    const tokens = specialTokensOf(gemma);
    for (const t of ['<turn|>', '<eos>', '<|tool_response>', '<bos>', '<|channel>', '<|tool_call>']) {
      expect(tokens).toContain(t);
    }
  });
});

describe('reasoning', () => {
  it("reads Gemma 4's thought channel as a think block", () => {
    expect(asThinkMarkers('<|channel>thought\nhmm<channel|>Hello', GEMMA_THOUGHT_MARKERS)).toBe(
      '<think>hmm</think>Hello',
    );
  });

  it('leaves the history only the answer', () => {
    expect(withoutReasoning('<think>\nweighing it\n</think>\n\nHello.', THINK_MARKERS)).toBe('Hello.');
    expect(withoutReasoning('<|channel>thought\n<channel|>Hello.', GEMMA_THOUGHT_MARKERS)).toBe('Hello.');
  });

  it('drops reasoning the model never finished', () => {
    expect(withoutReasoning('Sure. <think>and then', THINK_MARKERS)).toBe('Sure.');
  });
});
