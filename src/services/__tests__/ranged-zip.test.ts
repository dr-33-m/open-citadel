import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { openRangedZip } from '@/services/ranged-zip';

/** A reader over bytes in memory that counts what it is asked for. */
function reader(bytes: Uint8Array) {
  const stats = { reads: 0, bytes: 0 };
  const read = async (position: number, length: number) => {
    stats.reads += 1;
    stats.bytes += length;
    return bytes.slice(position, position + length);
  };
  return { read, stats };
}

async function zipOf(files: Record<string, string | Uint8Array>, options: { compression?: 'STORE' | 'DEFLATE'; comment?: string } = {}) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'uint8array', compression: options.compression ?? 'DEFLATE', comment: options.comment });
}

describe('openRangedZip', () => {
  it('reads stored and deflated entries, as text and as bytes', async () => {
    for (const compression of ['STORE', 'DEFLATE'] as const) {
      const image = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
      const bytes = await zipOf({ 'META-INF/container.xml': '<container>é</container>', 'OEBPS/cover.jpg': image }, { compression });
      const zip = await openRangedZip(bytes.length, reader(bytes).read);
      expect(await zip.text('META-INF/container.xml')).toBe('<container>é</container>');
      expect(Array.from((await zip.bytes('OEBPS/cover.jpg')) ?? [])).toEqual(Array.from(image));
    }
  });

  it('answers null for an entry that is not there', async () => {
    const bytes = await zipOf({ 'a.txt': 'a' });
    const zip = await openRangedZip(bytes.length, reader(bytes).read);
    expect(zip.has('a.txt')).toBe(true);
    expect(zip.has('b.txt')).toBe(false);
    expect(await zip.text('b.txt')).toBeNull();
  });

  it('finds the directory behind an archive comment', async () => {
    const bytes = await zipOf({ 'a.txt': 'hello' }, { comment: 'x'.repeat(3000) });
    const zip = await openRangedZip(bytes.length, reader(bytes).read);
    expect(await zip.text('a.txt')).toBe('hello');
  });

  it('reads the entries asked for and not the rest of the file', async () => {
    // A chapter that does not compress, standing for the bulk of a book.
    const noise = new Uint8Array(2_000_000);
    let seed = 1;
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = seed & 0xff;
    }
    const bytes = await zipOf({ 'META-INF/container.xml': '<c/>', 'OEBPS/chapter.bin': noise });
    const { read, stats } = reader(bytes);
    const zip = await openRangedZip(bytes.length, read);
    expect(await zip.text('META-INF/container.xml')).toBe('<c/>');
    expect(stats.bytes).toBeLessThan(70_000);
  });

  it('refuses what is not a ZIP, so the caller can read the file whole', async () => {
    const bytes = new Uint8Array(100).fill(1);
    await expect(openRangedZip(bytes.length, reader(bytes).read)).rejects.toThrow(/Not a ZIP/);
  });
});
