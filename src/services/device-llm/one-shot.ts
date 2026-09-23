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

/**
 * Qwen 3's switch for answering without reasoning first. ExecuTorch's template
 * rendering never passes `enable_thinking`, so the in-message switch the model
 * was trained on is the only way to ask. Reasoning about a three-word title
 * costs more than the title, and it can run past the cap before any answer.
 */
const NO_THINK = '\n/no_think';

/** The model's whole answer to `prompt`, reasoning included. */
export async function oneShot(prompt: string): Promise<string> {
  const reasons = getEngine()?.entry.reasons ?? false;
  const conversation = createConversation({ temperature: 0.3, maxNewTokens: ONE_SHOT_MAX_TOKENS });
  try {
    const turn = await conversation.sendMessage(reasons ? prompt + NO_THINK : prompt);
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
