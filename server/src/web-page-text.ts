/**
 * The pure half of reading a web page: which addresses may be asked for, and
 * the words in what comes back. No I/O, so it can be tested without a network.
 */
import { isIP } from 'node:net';

/** Whether an address is one the public can reach, rather than this server's own network. */
export function isPublicAddress(address: string): boolean {
  const lower = address.toLowerCase().replace(/^\[|\]$/g, '');
  const kind = isIP(lower);
  if (kind === 4) return isPublicIpv4(lower);
  if (kind !== 6) return false;
  // An IPv4 address written as IPv6 reaches the same place as the IPv4 one.
  const mapped = readMappedIpv4(lower);
  if (mapped) return isPublicIpv4(mapped);
  if (lower === '::' || lower === '::1') return false;
  // Only global unicast is public, which also rules out link-local, unique
  // local, multicast, and the transition ranges that can embed a private address.
  if (!/^[23]/.test(lower)) return false;
  return !/^(2001:0?db8|2001:0?0?0?0?:|2002:)/.test(lower);
}

function readMappedIpv4(address: string): string | null {
  const dotted = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

/** http or https on the usual ports, with no password in it, or null. */
export function readablePageUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  return url;
}

/** The same page, whatever its fragment: a search result and the page it names. */
export function pageKey(url: URL): string {
  const copy = new URL(url);
  copy.hash = '';
  return copy.href;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] !== '#') return ENTITIES[body.toLowerCase()] ?? whole;
    const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  });
}

/** A page's title and its readable words, up to `maxChars`. */
export function pageText(html: string, maxChars: number): { title: string | null; text: string; cut: boolean } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const words = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|nav|footer|head|form|title)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)\s*>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\r\f]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return {
    title: title ? decodeEntities(title).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null,
    text: words.slice(0, maxChars),
    cut: words.length > maxChars,
  };
}
