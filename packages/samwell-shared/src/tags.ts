import { z } from 'zod';

/**
 * AI tag suggestion for highlights and thoughts. Works on both Samwell paths:
 * cloud uses structured output against SuggestTagsResponseSchema; the local
 * on-device model gets the same prompt plus SUGGEST_TAGS_LOCAL_FORMAT and its
 * plain-text reply is cleaned up by normalizeTags.
 */

export const SuggestTagsRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  note: z.string().max(2000).optional(),
  surrounding: z.string().max(2000).optional(),
  bookTitle: z.string().optional(),
  author: z.string().optional(),
  existingTags: z.array(z.string()).max(60).default([]),
  goal: z.string().optional(),
  modelId: z.string().optional(),
});
export type SuggestTagsRequest = z.infer<typeof SuggestTagsRequestSchema>;

export const SuggestTagsResponseSchema = z.object({
  tags: z.array(z.string().min(1)).min(1).max(3),
});
export type SuggestTagsResponse = z.infer<typeof SuggestTagsResponseSchema>;

export const SUGGEST_TAGS_PROMPT =
  `Task: suggest 1-3 tags for a passage the user saved from their reading. The user message is JSON: { text, note?, surrounding?, bookTitle?, author?, existingTags, goal? }.

- Tags capture WHY this passage matters, the theme, principle, or application, not what it literally mentions.
- Prefer reusing a tag from existingTags whenever one fits the meaning; a small consistent vocabulary beats many one-off tags.
- When note is present it explains what caught the user, weight it heavily. When goal is present, prefer tags that connect the passage to that goal.
- Format: lowercase, 1-2 words each, no # symbol.
- Quality over quantity: one great tag beats three mediocre ones.`;

export const SUGGEST_TAGS_LOCAL_FORMAT =
  'Reply with ONLY the tags, comma-separated, nothing else. Example: resilience, founder mindset';

/** Cleans model-produced tags: trims, strips '#', dedupes case-insensitively, caps at 3. */
export function normalizeTags(raw: string[] | string): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,\n;]+/);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const tag = part
      .replace(/^[\s#'"•*-]+|[\s'".]+$/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (tag.length < 2 || tag.length > 24 || tag.split(' ').length > 3) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length === 3) break;
  }
  return tags;
}
