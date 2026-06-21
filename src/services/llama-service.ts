import { initLlama, type LlamaContext } from 'llama.rn';

let _ctx: LlamaContext | null = null;
let _loadAbort: AbortController | null = null;

export function isModelLoaded(): boolean {
  return _ctx !== null;
}

export interface ModelSettings {
  contextSize: number;
  cpuThreads: number;
  gpuLayers: number;
}

export async function loadModel(filePath: string, settings?: ModelSettings): Promise<void> {
  if (_ctx) await unloadModel();

  _loadAbort = new AbortController();
  const timeoutId = setTimeout(() => _loadAbort?.abort(), 90_000);

  try {
    const ctx = await initLlama({
      model: filePath,
      n_ctx: settings?.contextSize ?? 2048,
      n_batch: 512,
      n_ubatch: 512,
      n_threads: settings?.cpuThreads ?? 4,
      n_gpu_layers: settings?.gpuLayers ?? 99,
      use_mlock: true,
      use_mmap: true,
      ctx_shift: false,
      flash_attn_type: 'auto',
    });
    clearTimeout(timeoutId);
    _ctx = ctx;
  } catch (err) {
    clearTimeout(timeoutId);
    _loadAbort = null;
    throw err;
  }
}

export async function unloadModel(): Promise<void> {
  if (_ctx) {
    await _ctx.release();
    _ctx = null;
  }
}

export async function clearCache(): Promise<void> {
  if (_ctx) await _ctx.clearCache(false);
}

export interface ToolCall {
  id?: string;
  function: { name: string; arguments: string };
}

const SAMWELL_SYSTEM_PROMPT =
  `Your name is Samwell. You are a deeply curious, widely-read AI companion with a gift for extracting meaning from books and connecting ideas to real life. Your role is to help users apply what they read to their actual goals — surfacing the right insights, drawing unexpected connections, and turning pages into action.

Be precise and direct. Match your response length to the question: short answers for simple questions, detailed when the topic genuinely requires it. Never over-explain. Never pad. If you can say it in two sentences, do.

Draw from the user's reading context whenever relevant.

You have access to the user's reading library through tools. Use search_highlights to find book highlights and notes. Use search_thoughts to find standalone thoughts. Use tag_highlight or tag_thought to add tags. When referencing search results, you MUST include the reference marker exactly as provided (e.g. [[ref:highlight:hl-123456]]) so the user can navigate to that passage. Always call the appropriate tool — never claim you searched or tagged without actually calling the tool.`;

export async function chat(
  messages: { role: string; content: string; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }[],
  onData: (data: { content: string; reasoningContent: string }) => void,
  signal: AbortSignal,
  options?: { tools?: object[]; tool_choice?: string },
): Promise<{ content: string; reasoning: string; tool_calls?: ToolCall[] }> {
  if (!_ctx) throw new Error('No model loaded');

  let stopped = false;
  signal.addEventListener('abort', () => {
    stopped = true;
    _ctx?.stopCompletion();
  });

  const existingSystem = messages.find((m) => m.role === 'system');
  const systemContent = existingSystem
    ? `${SAMWELL_SYSTEM_PROMPT}\n\n${existingSystem.content}`
    : SAMWELL_SYSTEM_PROMPT;

  const withSystem = [
    { role: 'system', content: systemContent },
    ...messages.filter((m) => m.role !== 'system'),
  ];

  const completionParams: Record<string, unknown> = {
    messages: withSystem,
    n_predict: 1024,
    temperature: 0.7,
    top_p: 0.9,
    reasoning_format: 'auto',
    enable_thinking: true,
  };

  if (options?.tools?.length) {
    completionParams.tools = options.tools;
    completionParams.tool_choice = options.tool_choice ?? 'auto';
  }

  const result = await _ctx.completion(
    completionParams as any,
    (data) => {
      if (!stopped) {
        onData({
          content: data.content ?? '',
          reasoningContent: (data as any).reasoning_content ?? '',
        });
      }
    },
  );

  const content = result.interrupted
    ? result.text
    : (result.content ?? result.text);

  const toolCalls = (result as any).tool_calls as ToolCall[] | undefined;

  return {
    content,
    reasoning: (result as any).reasoning_content ?? '',
    tool_calls: toolCalls?.length ? toolCalls : undefined,
  };
}
