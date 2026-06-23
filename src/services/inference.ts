import { createLLM, type Backend, type ExecuteResult, type ToolResponse } from '@dr33m/react-native-litert-lm';
import { SAMWELL_TOOLS_LITERT } from './chat-tools';

type LiteRTLM = ReturnType<typeof createLLM>;

let _llm: LiteRTLM | null = null;

export type { ExecuteResult, ToolResponse, Backend };

export interface ModelSettings {
  contextSize: number;
  backend: Backend;
  enableSpeculativeDecoding: boolean;
  enableThinking: boolean;
  enableToolCalling: boolean;
}

const SAMWELL_SYSTEM_PROMPT =
  `Your name is Samwell. You are a deeply curious, widely-read AI companion with a gift for extracting meaning from books and connecting ideas to real life. Your role is to help users apply what they read to their actual goals — surfacing the right insights, drawing unexpected connections, and turning pages into action.

Be precise and direct. Match your response length to the question: short answers for simple questions, detailed when the topic genuinely requires it. Never over-explain. Never pad. If you can say it in two sentences, do.

Draw from the user's reading context whenever relevant.

You have access to the user's reading library through tools. Use search_highlights to find book highlights and notes. Use search_thoughts to find standalone thoughts. Use tag_highlight or tag_thought to add tags. When referencing search results, you MUST include the reference marker exactly as provided (e.g. [[ref:highlight:hl-123456]]) so the user can navigate to that passage. Always call the appropriate tool — never claim you searched or tagged without actually calling the tool.

When you decide to use a tool, do NOT explain what you are about to do or narrate your reasoning. Call the tool immediately and silently — your response should contain only the tool call. After receiving tool results, respond naturally using the data.`;

export function isModelLoaded(): boolean {
  return _llm?.isReady() ?? false;
}

export async function loadModel(filePath: string, settings?: Partial<ModelSettings>): Promise<void> {
  if (_llm) await unloadModel();

  const enableThinking = settings?.enableThinking ?? false;
  const enableToolCalling = settings?.enableToolCalling ?? true;

  _llm = createLLM();
  await _llm.loadModel(filePath, {
    systemPrompt: SAMWELL_SYSTEM_PROMPT,
    backend: settings?.backend ?? 'gpu',
    maxContextTokens: settings?.contextSize ?? 4096,
    maxOutputTokens: 1024,
    temperature: 0.7,
    topP: 0.9,
    enableThinking,
    enableSpeculativeDecoding: settings?.enableSpeculativeDecoding ?? false,
    tools: enableToolCalling ? SAMWELL_TOOLS_LITERT : [],
  });
}

export async function unloadModel(): Promise<void> {
  if (_llm) {
    _llm.close();
    _llm = null;
    // Allow native GPU/compute resources to be fully released before new allocations.
    // Gallery app uses a similar 500ms stability buffer after init.
    await new Promise((r) => setTimeout(r, 500));
  }
}

export function resetConversation(): void {
  _llm?.resetConversation();
}

export function stopGeneration(): void {
  _llm?.stopGeneration();
}

export function getActiveBackend(): Backend | null {
  try {
    return _llm?.getActiveBackend() ?? null;
  } catch {
    return null;
  }
}

/**
 * Send a single user message. The engine manages conversation history internally.
 */
export async function chat(
  userMessage: string,
  onData: (data: { content: string; reasoningContent: string }) => void,
): Promise<ExecuteResult> {
  if (!_llm) throw new Error('No model loaded');

  let acc = '';
  const result = await _llm.execute(
    [{ type: 'text', text: userMessage }],
    (token) => {
      acc += token;
      onData({ content: acc, reasoningContent: '' });
    },
  );
  return result;
}

/**
 * Feed tool execution results back into the stateful conversation.
 */
export async function sendToolResponses(
  responses: ToolResponse[],
  onData: (data: { content: string; reasoningContent: string }) => void,
): Promise<ExecuteResult> {
  if (!_llm) throw new Error('No model loaded');

  let acc = '';
  const result = await _llm.sendToolResponse(
    responses,
    (token) => {
      acc += token;
      onData({ content: acc, reasoningContent: '' });
    },
  );
  return result;
}
