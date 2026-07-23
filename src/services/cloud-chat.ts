import { ChatClient, clientTools, xhrHttpStream, type UIMessage } from '@tanstack/ai-client';
import type { StreamChunk } from '@tanstack/ai/client';
import {
  deleteHighlightTool,
  deleteThoughtTool,
  searchHighlightsTool,
  searchReadingTool,
  searchThoughtsTool,
  suggestNextBookTool,
  tagHighlightTool,
  tagThoughtTool,
} from 'samwell-shared';

import {
  executeToolCall,
  formatBookCandidatesForLLM,
  formatReadingForLLM,
  formatSearchResultsForLLM,
  type BookCandidate,
  type ReadingSnippet,
  type SearchResult,
} from '@/services/chat-tools';
import { useApprovalStore } from '@/stores/approval';

type StoredChatMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  createdAt: string;
};

type ApprovalRequest = {
  id: string;
  toolName: string;
  input: unknown;
};

export interface CloudChatTurnOptions {
  baseUrl: string;
  deviceId: string;
  modelId: string;
  sessionId: string;
  history: StoredChatMessage[];
  content: string;
  onStreamingContent: (content: string) => void;
  onToolStatus: (status: string | null) => void;
}

function toUIMessage(message: StoredChatMessage): UIMessage | null {
  if (message.role === 'tool' || message.content.startsWith('\0TOOL_CALL\0')) {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    createdAt: new Date(message.createdAt),
    parts: [{ type: 'text', content: message.content }],
  };
}

function textFromMessage(message: UIMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((part): part is { type: 'text'; content: string } => part.type === 'text')
    .map((part) => part.content)
    .join('');
}

function latestAssistantText(messages: UIMessage[]): string {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (i <= lastUserIndex) return '';
    const message = messages[i];
    if (message?.role !== 'assistant') continue;
    const text = textFromMessage(message);
    if (text.trim()) return text;
  }
  return '';
}

function statusForTool(toolName: string): string {
  if (toolName.startsWith('delete_')) return 'Waiting for delete approval…';
  if (toolName.startsWith('tag_')) return 'Waiting for tag approval…';
  if (toolName === 'search_thoughts') return 'Searching through your thoughts…';
  if (toolName === 'search_reading') return 'Checking your books…';
  if (toolName === 'suggest_next_book') return 'Looking over your library…';
  return 'Searching through your highlights…';
}

function createSamwellClientTools() {
  return clientTools(
    searchHighlightsTool.client(async (input) => {
      const { result } = await executeToolCall('search_highlights', input);
      const results = Array.isArray(result) ? (result as SearchResult[]) : [];
      return {
        results,
        formatted: formatSearchResultsForLLM(results),
      };
    }),
    searchThoughtsTool.client(async (input) => {
      const { result } = await executeToolCall('search_thoughts', input);
      const results = Array.isArray(result) ? (result as SearchResult[]) : [];
      return {
        results,
        formatted: formatSearchResultsForLLM(results),
      };
    }),
    searchReadingTool.client(async (input) => {
      const { result } = await executeToolCall('search_reading', input);
      const results = Array.isArray(result) ? (result as ReadingSnippet[]) : [];
      return {
        results,
        formatted: formatReadingForLLM(results),
      };
    }),
    suggestNextBookTool.client(async (input) => {
      const { result } = await executeToolCall('suggest_next_book', input);
      const candidates = Array.isArray(result) ? (result as BookCandidate[]) : [];
      return {
        candidates,
        formatted: formatBookCandidatesForLLM(candidates),
      };
    }),
    tagHighlightTool.client(async (input) => {
      const { result } = await executeToolCall('tag_highlight', input);
      const tagResult = result as { success?: boolean; tags?: string[] };
      return {
        ok: tagResult.success === true,
        id: input.id,
        type: 'highlight' as const,
        tags: tagResult.tags ?? [],
        ...(tagResult.success ? {} : { error: 'Highlight not found.' }),
      };
    }),
    tagThoughtTool.client(async (input) => {
      const { result } = await executeToolCall('tag_thought', input);
      const tagResult = result as { success?: boolean; tags?: string[] };
      return {
        ok: tagResult.success === true,
        id: input.id,
        type: 'thought' as const,
        tags: tagResult.tags ?? [],
        ...(tagResult.success ? {} : { error: 'Thought not found.' }),
      };
    }),
    deleteHighlightTool.client(async (input) => {
      const { result } = await executeToolCall('delete_highlight', input);
      const deleteResult = result as { success?: boolean };
      return {
        ok: deleteResult.success === true,
        id: input.id,
        type: 'highlight' as const,
        ...(deleteResult.success ? {} : { error: 'Highlight not found.' }),
      };
    }),
    deleteThoughtTool.client(async (input) => {
      const { result } = await executeToolCall('delete_thought', input);
      const deleteResult = result as { success?: boolean };
      return {
        ok: deleteResult.success === true,
        id: input.id,
        type: 'thought' as const,
        ...(deleteResult.success ? {} : { error: 'Thought not found.' }),
      };
    }),
  );
}

function collectApproval(chunk: StreamChunk): ApprovalRequest | null {
  if (chunk.type !== 'CUSTOM' || chunk.name !== 'approval-requested') return null;
  const value = chunk.value as
    | {
        toolName?: unknown;
        input?: unknown;
        approval?: { id?: unknown };
      }
    | undefined;

  const id = value?.approval?.id;
  const toolName = value?.toolName;
  if (typeof id !== 'string' || typeof toolName !== 'string') return null;
  return { id, toolName, input: value?.input };
}

function readToolName(chunk: StreamChunk): string | null {
  if (chunk.type === 'TOOL_CALL_START') {
    const toolChunk = chunk as StreamChunk & { toolName?: string; toolCallName?: string };
    return toolChunk.toolName ?? toolChunk.toolCallName ?? null;
  }

  if (chunk.type === 'CUSTOM' && chunk.name === 'tool-input-available') {
    const value = chunk.value as { toolName?: unknown } | undefined;
    return typeof value?.toolName === 'string' ? value.toolName : null;
  }

  if (chunk.type === 'CUSTOM' && chunk.name === 'approval-requested') {
    const value = chunk.value as { toolName?: unknown } | undefined;
    return typeof value?.toolName === 'string' ? value.toolName : null;
  }

  return null;
}

// Verified once per app run. A plain fetch to /health isolates the failing hop:
// if this fails while the phone browser reaches the same URL, the app process
// itself cannot use the endpoint (wrong baked-in URL or blocked plain HTTP).
let preflightPassed = false;

export async function preflightCloudServer(baseUrl: string): Promise<void> {
  if (preflightPassed) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Samwell Cloud health check returned HTTP ${res.status} at ${baseUrl}/health`);
    }
    preflightPassed = true;
    console.log(`[Samwell Cloud] Preflight OK: ${baseUrl}/health`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('health check returned')) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach Samwell Cloud at ${baseUrl} from the app (${detail}). ` +
        'If this exact URL loads in the phone browser, the app cannot use plain HTTP — serve the backend over HTTPS (e.g. cloudflared tunnel) or use adb reverse.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function sendCloudChatTurn({
  baseUrl,
  deviceId,
  modelId,
  sessionId,
  history,
  content,
  onStreamingContent,
  onToolStatus,
}: CloudChatTurnOptions): Promise<string> {
  await preflightCloudServer(baseUrl);

  const approvals: ApprovalRequest[] = [];
  const initialMessages = history
    .map(toUIMessage)
    .filter((message): message is UIMessage => message !== null);

  const client = new ChatClient({
    id: `samwell-cloud-${sessionId}`,
    threadId: sessionId,
    initialMessages,
    connection: xhrHttpStream(`${baseUrl}/chat/http`, {
      headers: { 'x-samwell-device-id': deviceId },
    }),
    forwardedProps: { modelId },
    tools: createSamwellClientTools(),
    onChunk: (chunk) => {
      const approval = collectApproval(chunk);
      if (approval) approvals.push(approval);

      const toolName = readToolName(chunk);
      if (toolName) onToolStatus(statusForTool(toolName));
      if (chunk.type === 'TOOL_CALL_RESULT') onToolStatus(null);
    },
    onMessagesChange: (messages) => {
      const text = latestAssistantText(messages);
      if (text) {
        onToolStatus(null);
        onStreamingContent(text);
      }
    },
  });

  try {
    console.log(`[Samwell Cloud] Sending chat request to ${baseUrl}/chat/http`);
    try {
      await client.sendMessage(content);
    } catch (err) {
      console.error('[Samwell Cloud] sendMessage failed:', err, (err as { cause?: unknown })?.cause);
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`${detail} (POST ${baseUrl}/chat/http)`);
    }

    // The server emits client-tool (`tool-input-available`) and approval
    // (`approval-requested`) events AFTER `RUN_FINISHED`. The ChatClient
    // resolves `sendMessage` on `RUN_FINISHED` and processes those follow-on
    // events asynchronously through its subscription loop, which then triggers
    // client-side tool execution and the continuation request. Disposing the
    // client here would tear the subscription down before any of that happens,
    // so the tool never runs and the turn stalls. Keep the client alive until
    // the conversation has fully settled: drain approval requests as they
    // arrive and wait for a final assistant text answer with nothing loading.
    const settleDeadline = Date.now() + 120_000;
    while (Date.now() < settleDeadline) {
      while (approvals.length > 0) {
        const approval = approvals.shift();
        if (!approval) continue;
        const approved = await useApprovalStore
          .getState()
          .requestApproval({ toolName: approval.toolName, input: approval.input });
        await client.addToolApprovalResponse({ id: approval.id, approved });
      }

      if (!client.getIsLoading() && !hasUnresolvedToolCalls(client.getMessages())) {
        const text = latestAssistantText(client.getMessages()).trim();
        if (text) return text;
      }

      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    console.warn('[Samwell Cloud] Turn did not settle before timeout; returning partial content.');
    return latestAssistantText(client.getMessages()).trim();
  } finally {
    client.dispose();
  }
}

function hasUnresolvedToolCalls(messages: UIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (part.type === 'tool-call' && (part as { output?: unknown }).output === undefined) {
        return true;
      }
    }
  }
  return false;
}
