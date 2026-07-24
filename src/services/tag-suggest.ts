import { eq } from 'drizzle-orm';
import {
  normalizeTags,
  SUGGEST_TAGS_LOCAL_FORMAT,
  SUGGEST_TAGS_PROMPT,
  SuggestTagsResponseSchema,
} from 'samwell-shared';

import { db } from '@/db/client';
import { compassGoals } from '@/db/schema';
import * as Inference from '@/services/inference';
import { useSettingsStore } from '@/stores/settings';

/**
 * AI tag suggestions for a saved passage. Works on both Samwell paths: cloud
 * calls the metered /tags/suggest endpoint; offline runs a one-shot prompt on
 * the loaded local model, bracketed by resetConversation() so it cannot bleed
 * into chat state (sessions re-prime their context on open anyway).
 */

export type SuggestTagsInput = {
  text: string;
  note?: string;
  surrounding?: string;
  bookTitle?: string;
  author?: string;
  existingTags: string[];
};

function clamp(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function suggestTags(input: SuggestTagsInput): Promise<string[]> {
  const goal = db
    .select({ title: compassGoals.title })
    .from(compassGoals)
    .where(eq(compassGoals.status, 'active'))
    .get()?.title;

  const payload = {
    text: clamp(input.text, 2000) ?? input.text.slice(0, 2000),
    note: clamp(input.note, 2000),
    surrounding: clamp(input.surrounding, 2000),
    bookTitle: clamp(input.bookTitle, 200),
    author: clamp(input.author, 200),
    existingTags: input.existingTags.slice(0, 60),
    goal: clamp(goal ?? undefined, 200),
  };

  const { samwellMode, cloudBaseUrl, cloudModelId, getCloudDeviceId } =
    useSettingsStore.getState();

  if (samwellMode === 'cloud') {
    if (!cloudBaseUrl) {
      throw new Error('Grand Maester Samwell is not set up in this build.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(`${cloudBaseUrl}/tags/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-samwell-device-id': await getCloudDeviceId(),
        },
        body: JSON.stringify({ ...payload, modelId: cloudModelId }),
        signal: controller.signal,
      });
    } catch {
      throw new Error('Cannot reach Grand Maester Samwell. Check your connection.');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      throw new Error('Grand Maester Samwell has reached the current usage limit.');
    }
    if (!res.ok) {
      throw new Error("Couldn't suggest tags. Try again.");
    }
    const parsed = SuggestTagsResponseSchema.safeParse(await res.json());
    const tags = parsed.success ? normalizeTags(parsed.data.tags) : [];
    if (tags.length === 0) {
      throw new Error("Couldn't suggest tags for this passage.");
    }
    return tags;
  }

  if (!Inference.isModelLoaded()) {
    throw new Error('Load a local model in Settings, or switch to Grand Maester Samwell, to suggest tags.');
  }

  Inference.resetConversation();
  try {
    let latest = '';
    await Inference.chat(
      `${SUGGEST_TAGS_PROMPT}\n\n${JSON.stringify(payload)}\n\n${SUGGEST_TAGS_LOCAL_FORMAT}`,
      (data) => {
        latest = data.content;
      },
    );
    const tags = normalizeTags(latest);
    if (tags.length === 0) {
      throw new Error("Couldn't suggest tags for this passage.");
    }
    return tags;
  } finally {
    Inference.resetConversation();
  }
}
