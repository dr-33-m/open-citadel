/**
 * Reading one string field out of JSON that has not finished arriving.
 *
 * A Compass turn is `{ reply, draft }` and the model writes it in schema
 * order, so `reply` is complete long before the JSON is. Streaming it means
 * decoding that field from a prefix of the document, over and over, as more
 * bytes land. `JSON.parse` cannot do that: a prefix is not JSON.
 *
 * Deliberately not a general partial-JSON parser. It answers one question,
 * "what does this string field say so far, and has it ended", which is all the
 * stream needs and all that can be got right in fifty lines. A tolerant parser
 * that guesses at a whole malformed object is the thing that quietly invents
 * a draft nobody proposed.
 *
 * TanStack AI ships one — `parsePartialJSON` from `@tanstack/ai/client` — and
 * it was checked rather than assumed away. It is correct here: over every
 * prefix of a real turn it returns the same reply this does, monotonically,
 * escapes and all. It is not used because it rebuilds the *whole* document on
 * every delta, so once the reply has closed it keeps re-parsing a nested draft
 * nobody is reading. Measured over a 1,743-character plan turn fed a character
 * at a time: 44.1ms against 3.3ms here, for the same string. The turn is also
 * the one place the app must not accept a guessed object, which is the other
 * half of why the narrow reader is the right shape.
 */

export interface PartialJsonString {
  /** What has been decoded so far, with escapes resolved. */
  value: string;
  /** True once the closing quote has arrived, so the field will not grow. */
  closed: boolean;
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

const isSpace = (ch: string) => ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t';

interface ScannedString {
  value: string;
  closed: boolean;
  /** Index just past the closing quote, or the end of the input. */
  end: number;
}

/** Decode the JSON string starting at `start`, which must be its opening quote. */
function scanString(raw: string, start: number): ScannedString {
  const n = raw.length;
  let out = '';
  let i = start + 1;

  while (i < n) {
    const ch = raw[i]!;

    if (ch === '\\') {
      /*
       * An escape that has not fully arrived is held back rather than guessed
       * at. Emitting the `u` of a half-received `—` would put a stray
       * letter in the reply, and nothing later in the stream ever goes back to
       * take it out again.
       */
      if (i + 1 >= n) return { value: out, closed: false, end: n };
      const esc = raw[i + 1]!;
      if (esc === 'u') {
        if (i + 6 > n) return { value: out, closed: false, end: n };
        out += String.fromCharCode(Number.parseInt(raw.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += ESCAPES[esc] ?? esc;
      i += 2;
      continue;
    }

    if (ch === '"') return { value: out, closed: true, end: i + 1 };

    out += ch;
    i += 1;
  }

  return { value: out, closed: false, end: n };
}

/**
 * The value of a top-level string field, as far as it has arrived.
 *
 * `null` means the field has not been reached yet, or it holds something other
 * than a string. Only top level: a `reply` key nested inside the draft is a
 * different field that happens to share a name, and returning its contents as
 * the message would be worse than returning nothing.
 */
export function readJsonStringField(raw: string, field: string): PartialJsonString | null {
  const n = raw.length;
  let depth = 0;
  let i = 0;

  while (i < n) {
    const ch = raw[i]!;

    if (ch === '{' || ch === '[') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth -= 1;
      i += 1;
      continue;
    }

    if (ch === '"') {
      const scanned = scanString(raw, i);
      // A key still arriving tells us nothing, and everything after it is
      // unread, so there is no field to report yet.
      if (!scanned.closed) return null;

      let j = scanned.end;
      while (j < n && isSpace(raw[j]!)) j += 1;

      if (depth === 1 && raw[j] === ':' && scanned.value === field) {
        j += 1;
        while (j < n && isSpace(raw[j]!)) j += 1;
        // The colon has landed but the value has not.
        if (j >= n) return { value: '', closed: false };
        if (raw[j] !== '"') return null;
        const value = scanString(raw, j);
        return { value: value.value, closed: value.closed };
      }

      // Not our key: skip the string whole, so braces and quotes inside it
      // never reach the depth counter.
      i = scanned.end;
      continue;
    }

    i += 1;
  }

  return null;
}
