import { createLLM, isNativeAvailable, type Backend, type ExecuteResult, type ToolResponse } from '@dr33m/react-native-litert-lm';
import { SAMWELL_SYSTEM_PROMPT } from 'samwell-shared';
import { SAMWELL_TOOLS_LITERT } from './chat-tools';

type LiteRTLM = ReturnType<typeof createLLM>;

let _llm: LiteRTLM | null = null;

export type { ExecuteResult, ToolResponse, Backend };

export { isNativeAvailable };

export interface ModelSettings {
  contextSize: number;
  backend: Backend;
  enableSpeculativeDecoding: boolean;
  enableThinking: boolean;
  enableToolCalling: boolean;
}

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
