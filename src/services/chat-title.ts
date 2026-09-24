import {
  normalizeChatTitle,
  SUGGEST_CHAT_TITLE_LOCAL_FORMAT,
  SUGGEST_CHAT_TITLE_PROMPT,
  SuggestChatTitleResponseSchema,
} from 'samwell-shared';

import { cloudJsonHeaders } from '@/services/cloud-identity';
import { isEngineLoaded } from '@/services/device-llm/engine';
import { oneShot, oneShotBudgetChars } from '@/services/device-llm/one-shot';
import { useSettingsStore } from '@/stores/settings';
import { splitThinking } from '@/utils/think-stream';
import { formatTranscript } from '@/utils/transcript';

/**
 * AI-generated titles for bookless chat sessions. Works on both Samwell
 * paths: cloud calls the metered /chat/title endpoint; offline runs a
 * one-shot prompt on the loaded local model, in a conversation of its own.
 */

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function suggestChatTitle(conversation: string): Promise<string> {
  const payload = { conversation: clamp(conversation, 6000) };

  const { samwellMode, cloudBaseUrl, cloudModelId } = useSettingsStore.getState();

  if (samwellMode === 'cloud') {
    if (!cloudBaseUrl) {
      throw new Error('Grand Maester Samwell is not set up in this build.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(`${cloudBaseUrl}/chat/title`, {
        method: 'POST',
        headers: await cloudJsonHeaders(),
        body: JSON.stringify({ ...payload, modelId: cloudModelId }),
        signal: controller.signal,
      });
    } catch {
      throw new Error('Cannot reach Grand Maester Samwell. Check your connection.');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[Samwell Cloud] chat title suggest failed', res.status, detail.slice(0, 300));
      throw new Error(`Couldn't title this chat (${res.status}).`);
    }
    const parsed = SuggestChatTitleResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("Couldn't title this chat.");
    return normalizeChatTitle(parsed.data.title);
  }

  if (!isEngineLoaded()) {
    throw new Error('No local model loaded to title this chat.');
  }

  const instructions = `${SUGGEST_CHAT_TITLE_PROMPT}\n\n${SUGGEST_CHAT_TITLE_LOCAL_FORMAT}`;
  // A small device window cannot take a long chat whole. The opening is what a
  // title is usually drawn from, so it is the end that is cut.
  const room = Math.max(0, oneShotBudgetChars() - instructions.length - 32);
  const input = JSON.stringify({ conversation: clamp(payload.conversation, room) });
  const answer = await oneShot({ instructions, input });
  // A reasoning model answers a one-shot prompt with its reasoning attached,
  // and naming a chat "<think>the user asked..." is the visible result.
  const title = normalizeChatTitle(splitThinking(answer).visible);
  if (!title) throw new Error("Couldn't title this chat.");
  return title;
}

/**
 * A rename that was refused before it started, carrying a sentence fit to show
 * the reader as it is. Anything else a rename throws (a network failure, a
 * native error) is not written for people, so the caller shows its own
 * wording for those instead.
 */
export class RetitleError extends Error {}

/**
 * A saved conversation as the text a title is suggested from.
 *
 * One definition for reading chat and Compass, which each built this string
 * themselves and could have drifted on the labels the prompt reads.
 */
export function conversationForTitle(messages: { role: string; content: string }[]): string {
  return formatTranscript(messages);
}
