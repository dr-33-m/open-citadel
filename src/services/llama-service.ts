import { initLlama, type LlamaContext } from 'llama.rn';

let _ctx: LlamaContext | null = null;
let _loadAbort: AbortController | null = null;

export function isModelLoaded(): boolean {
  return _ctx !== null;
}

export async function loadModel(filePath: string): Promise<void> {
  if (_ctx) await unloadModel();

  _loadAbort = new AbortController();
  const timeoutId = setTimeout(() => _loadAbort?.abort(), 90_000);

  try {
    const ctx = await initLlama({
      model: filePath,
      n_ctx: 8192,
      n_batch: 512,
      n_ubatch: 512,
      n_gpu_layers: 99,
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

const SAMWELL_SYSTEM_PROMPT =
  `Your name is Samwell. You are a deeply curious, widely-read AI companion with a gift for extracting meaning from books and connecting ideas to real life. Your role is to help users apply what they read to their actual goals — surfacing the right insights, drawing unexpected connections, and turning pages into action.

Be precise and direct. Match your response length to the question: short answers for simple questions, detailed when the topic genuinely requires it. Never over-explain. Never pad. If you can say it in two sentences, do.

Draw from the user's reading context whenever relevant.`;

export async function chat(
  messages: { role: string; content: string }[],
  onData: (data: { content: string; reasoningContent: string }) => void,
  signal: AbortSignal,
): Promise<{ content: string; reasoning: string }> {
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

  const result = await _ctx.completion(
    {
      messages: withSystem,
      n_predict: 1024,
      temperature: 0.7,
      top_p: 0.9,
      reasoning_format: 'auto',
      enable_thinking: true,
    },
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

  return {
    content,
    reasoning: (result as any).reasoning_content ?? '',
  };
}
