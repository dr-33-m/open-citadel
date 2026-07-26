import { z } from 'zod';

/**
 * AI-generated titles for bookless chat sessions. `conversation` is either
 * just the opening exchange (quick title right after the first message) or
 * the whole transcript so far (re-title when the user leaves the chat).
 */

export const SuggestChatTitleRequestSchema = z.object({
  conversation: z.string().min(1).max(6000),
  modelId: z.string().optional(),
});
export type SuggestChatTitleRequest = z.infer<typeof SuggestChatTitleRequestSchema>;

export const SuggestChatTitleResponseSchema = z.object({
  title: z.string().min(1).max(60),
});
export type SuggestChatTitleResponse = z.infer<typeof SuggestChatTitleResponseSchema>;

export const SUGGEST_CHAT_TITLE_PROMPT =
  `Task: write a short title for a chat conversation with Samwell, an AI reading companion. The user message is JSON: { conversation }, a transcript of the conversation so far (sometimes just its opening message).

- 3-6 words, plain English, no surrounding quotes, no trailing punctuation.
- Describe what the conversation is actually about. Never use generic phrases like "Chat with Samwell" or "New conversation".
- Write it the way a person would title a note, not as a formal heading.`;

export const SUGGEST_CHAT_TITLE_LOCAL_FORMAT =
  'Reply with ONLY the title, nothing else. Example: Sunday long run recovery tips';

/** Trims stray quotes/punctuation a model sometimes wraps a title in, and
 * enforces the same length cap as the schema. */
export function normalizeChatTitle(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 60 ? cleaned.slice(0, 60).trim() : cleaned;
}
