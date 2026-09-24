/**
 * A single prompt and its answer, on the device model, away from any chat.
 *
 * Chat titles and tag suggestions used to run inside the chat's own native
 * conversation, bracketed by resets: they carried Samwell's persona and tool
 * schemas into a prompt that needed neither, and wiped the open chat's context
 * on the way out. A throwaway conversation costs nothing now, so each one-shot
 * gets its own and the chat it interrupted rebuilds itself on its next turn.
 */

import { CHARS_PER_TOKEN, MESSAGE_OVERHEAD_TOKENS, usableTokens } from '@/services/context-budget';
import { ContextPressureError, createConversation } from '@/services/device-llm/conversation';
import { getEngine } from '@/services/device-llm/engine';

/**
 * How many characters of prompt the loaded model can take in one go, or 0 when
 * nothing is loaded. For callers that trim their input to fit.
 */
export function oneShotBudgetChars(): number {
  const engine = getEngine();
  if (!engine) return 0;
  const tokens = usableTokens(engine.contextTokens) - MESSAGE_OVERHEAD_TOKENS * 4;
  return Math.max(0, Math.floor(tokens * CHARS_PER_TOKEN));
}

/**
 * Longest one-shot answer, in tokens. Titles and tag lists are a line; the
 * reply reserve (512 to 768) is room for the model to wander off in, and every
 * token past the answer is a second or so of the reader waiting on nothing.
 */
const ONE_SHOT_MAX_TOKENS = 96;

export interface OneShotPrompt {
  /** The task: what to do and how to answer. */
  instructions: string;
  /** What to do it to. */
  input: string;
}

/**
 * The model's answer to one task, its reasoning left out.
 *
 * The task goes in the system turn and its input in the user turn, which is
 * how the prompts are written ("the user message is JSON…") and how the cloud
 * sends them. Sent together as one user message, Gemma 4 read the instructions
 * as something to reply to, and ended its turn at once without a word.
 */
export async function oneShot({ instructions, input }: OneShotPrompt): Promise<string> {
  const conversation = createConversation({
    systemPrompt: instructions,
    temperature: 0.3,
    maxNewTokens: ONE_SHOT_MAX_TOKENS,
    // Reasoning about a three-word title costs more than the title, and can
    // run past the cap before any answer at all.
    thinking: false,
  });
  try {
    const turn = await conversation.sendMessage(input);
    const last = turn.messages[turn.messages.length - 1];
    return last?.role === 'assistant' && typeof last.content === 'string' ? last.content : '';
  } catch (err) {
    if (err instanceof ContextPressureError) {
      throw new Error('That is too long for the brain on this device.');
    }
    throw err;
  } finally {
    conversation.dispose();
  }
}
