import {
  normalizeChatTitle,
  SUGGEST_CHAT_TITLE_LOCAL_FORMAT,
  SUGGEST_CHAT_TITLE_PROMPT,
  SuggestChatTitleResponseSchema,
} from 'samwell-shared';

import { cloudJsonHeaders } from '@/services/cloud-identity';
import * as Inference from '@/services/inference';
import { useSettingsStore } from '@/stores/settings';

/**
 * AI-generated titles for bookless chat sessions. Works on both Samwell
 * paths: cloud calls the metered /chat/title endpoint; offline runs a
 * one-shot prompt on the loaded local model, bracketed by
 * resetConversation() so it cannot bleed into chat state.
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

  if (!Inference.isModelLoaded()) {
    throw new Error('No local model loaded to title this chat.');
  }

  Inference.resetConversation();
  try {
    let latest = '';
    await Inference.chat(
      `${SUGGEST_CHAT_TITLE_PROMPT}\n\n${JSON.stringify(payload)}\n\n${SUGGEST_CHAT_TITLE_LOCAL_FORMAT}`,
      (data) => {
        latest = data.content;
      },
    );
    const title = normalizeChatTitle(latest);
    if (!title) throw new Error("Couldn't title this chat.");
    return title;
  } finally {
    Inference.resetConversation();
  }
}
