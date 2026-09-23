/**
 * How one model family writes a tool call, and how to read it back.
 *
 * ExecuTorch renders the tool schemas into the prompt through the model's own
 * chat template, but it leaves reading the model's answer to the app: every
 * family emits calls in its own syntax. A family without a format here is not
 * offered tools at all, which is the honest answer for a model we cannot parse.
 */

import type { llm } from 'react-native-executorch';

export interface ToolFormat {
  /** Reads the calls out of a finished generation, or undefined when it made none. */
  parse: llm.ToolParser;
  /** Stops generation once a call is complete, so the model does not run on past it. */
  stopRegex: RegExp;
  /**
   * The part of a generation still streaming that is safe to show. A call is
   * streamed token by token like prose, and its markup must never reach the
   * chat bubble on its way to being parsed.
   */
  visible(text: string): string;
}

// ── Gemma 4 ─────────────────────────────────────────────────────────────────

const GEMMA_CALL_OPEN = '<|tool_call>';
/** Gemma's string delimiter. Its argument syntax has no escaped quotes. */
const GEMMA_QUOTE = '<|"|>';

const GEMMA_CALL = /<\|tool_call>call:([A-Za-z0-9_.-]+)\{([\s\S]*?)\}(?:<tool_call\|>|$)/g;

/**
 * Reads Gemma 4's argument syntax, which its chat template writes as
 * `key:value` pairs with bare keys and strings wrapped in `<|"|>`.
 *
 * Parsed rather than rewritten into JSON with a regex. Rewriting every `word:`
 * into `"word":` also rewrites it inside a string, so a search for
 * "note: grief" arrived as broken JSON and the call was silently dropped.
 */
class GemmaArgsReader {
  private i = 0;

  constructor(private readonly src: string) {}

  /** The body between the call's braces. */
  readObjectBody(close: string | null): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.skipSpace();
    while (this.i < this.src.length && !this.at(close)) {
      const key = this.readKey();
      this.skipSpace();
      this.expect(':');
      out[key] = this.readValue();
      this.skipSpace();
      if (this.at(',')) this.i += 1;
      this.skipSpace();
    }
    if (close) this.expect(close);
    return out;
  }

  private readValue(): unknown {
    this.skipSpace();
    if (this.src.startsWith(GEMMA_QUOTE, this.i)) return this.readString();
    if (this.at('{')) {
      this.i += 1;
      return this.readObjectBody('}');
    }
    if (this.at('[')) {
      this.i += 1;
      const items: unknown[] = [];
      this.skipSpace();
      while (this.i < this.src.length && !this.at(']')) {
        items.push(this.readValue());
        this.skipSpace();
        if (this.at(',')) this.i += 1;
        this.skipSpace();
      }
      this.expect(']');
      return items;
    }
    return this.readLiteral();
  }

  private readKey(): string {
    if (this.src.startsWith(GEMMA_QUOTE, this.i)) return this.readString();
    const start = this.i;
    while (this.i < this.src.length && /[A-Za-z0-9_.-]/.test(this.src[this.i])) this.i += 1;
    if (this.i === start) throw new Error(`Expected a key at ${start}`);
    return this.src.slice(start, this.i);
  }

  private readString(): string {
    this.i += GEMMA_QUOTE.length;
    const end = this.src.indexOf(GEMMA_QUOTE, this.i);
    if (end === -1) throw new Error('Unterminated string');
    const value = this.src.slice(this.i, end);
    this.i = end + GEMMA_QUOTE.length;
    return value;
  }

  private readLiteral(): unknown {
    const start = this.i;
    while (this.i < this.src.length && !/[,}\]]/.test(this.src[this.i])) this.i += 1;
    const raw = this.src.slice(start, this.i).trim();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null' || raw === 'none' || raw === 'None') return null;
    const n = Number(raw);
    // A bare word that is not a number is still the model's meaning; keep it.
    return raw !== '' && Number.isFinite(n) ? n : raw;
  }

  private at(token: string | null): boolean {
    return token !== null && this.src.startsWith(token, this.i);
  }

  private expect(token: string): void {
    if (!this.at(token)) throw new Error(`Expected "${token}" at ${this.i}`);
    this.i += token.length;
  }

  private skipSpace(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i += 1;
  }
}

/** Gemma 4's arguments as an object, or null when they cannot be read. */
export function parseGemmaArguments(body: string): Record<string, unknown> | null {
  try {
    return new GemmaArgsReader(body).readObjectBody(null);
  } catch {
    return null;
  }
}

export const GEMMA_TOOL_FORMAT: ToolFormat = {
  parse(text) {
    const toolCalls: llm.ToolCall[] = [];
    for (const match of text.matchAll(GEMMA_CALL)) {
      const args = parseGemmaArguments(match[2] ?? '');
      // An unreadable call is dropped rather than run with empty arguments,
      // which for a delete or a tag would do something the model never asked.
      if (!args) continue;
      toolCalls.push({ type: 'function', function: { name: match[1], arguments: args } });
    }
    if (toolCalls.length === 0) return undefined;

    const textContent = text
      .replace(GEMMA_CALL, '')
      .replace(/<\|?tool_call\|?>/g, '')
      .trim();
    return { toolCalls, textContent: textContent || undefined };
  },

  stopRegex: /<tool_call\|>/,

  visible(text) {
    const cut = text.indexOf(GEMMA_CALL_OPEN);
    const shown = cut === -1 ? text : text.slice(0, cut);
    // Hold back a marker that is still arriving, so `<|tool_c` never flashes.
    for (let n = Math.min(GEMMA_CALL_OPEN.length - 1, shown.length); n > 0; n--) {
      if (GEMMA_CALL_OPEN.startsWith(shown.slice(-n))) return shown.slice(0, -n);
    }
    return shown;
  },
};
