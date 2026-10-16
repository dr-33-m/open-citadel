/**
 * Bytes to and from the strings the native file APIs speak, in plain
 * JavaScript: Hermes has no `Buffer`, and `atob`, `btoa` and `TextDecoder`
 * are not something to rely on across its versions.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DECODE = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) DECODE[ALPHABET.charCodeAt(i)] = i;

/** Base64 (as `readAsStringAsync` returns it) to bytes. Whitespace and padding are passed over. */
export function base64ToBytes(base64: string): Uint8Array {
  const out = new Uint8Array(Math.floor((base64.length * 3) / 4));
  let length = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const code = base64.charCodeAt(i);
    const value = code < 128 ? DECODE[code] : -1;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[length++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, length);
}

/** Bytes to base64, padded, for `writeAsStringAsync`. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    chunk +=
      ALPHABET[(triple >> 18) & 63] +
      ALPHABET[(triple >> 12) & 63] +
      (i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? ALPHABET[triple & 63] : '=');
    // Joined in pieces: one string grown a character at a time is quadratic on some engines.
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/** Characters made into a string at a time: well under any engine's limit on arguments. */
const CHUNK = 8192;

/** UTF-8 bytes to a string. A malformed sequence becomes U+FFFD rather than throwing. */
export function utf8Decode(bytes: Uint8Array): string {
  const parts: string[] = [];
  // One buffer written by index and reused, not an array grown a character
  // at a time: a chapter is hundreds of thousands of them, decoded on the
  // JavaScript thread. A plain array, since that is what every engine's
  // `apply` is sure to take.
  const codes: number[] = new Array<number>(CHUNK + 1).fill(0);
  let n = 0;
  const flush = () => {
    parts.push(String.fromCharCode.apply(null, n === codes.length ? codes : codes.slice(0, n)));
    n = 0;
  };
  let i = 0;
  // A byte-order mark says nothing worth keeping.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length) {
    const byte = bytes[i];
    let code = 0xfffd;
    let width = 1;
    if (byte < 0x80) {
      code = byte;
    } else if (byte >= 0xc2 && byte < 0xe0 && i + 1 < bytes.length) {
      code = ((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      width = 2;
    } else if (byte >= 0xe0 && byte < 0xf0 && i + 2 < bytes.length) {
      code = ((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      width = 3;
    } else if (byte >= 0xf0 && byte < 0xf5 && i + 3 < bytes.length) {
      const point = ((byte & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      width = 4;
      const offset = point - 0x10000;
      codes[n++] = 0xd800 + (offset >> 10);
      code = 0xdc00 + (offset & 0x3ff);
    }
    codes[n++] = code;
    i += width;
    if (n >= CHUNK) flush();
  }
  flush();
  return parts.join('');
}
