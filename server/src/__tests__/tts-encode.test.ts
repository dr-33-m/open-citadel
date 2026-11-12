import { describe, expect, it } from 'vitest';

import { canEncodeMp3, encoderArgs, pcmToMp3 } from '../tts-encode.js';

describe('encoderArgs', () => {
  it('reads raw 16-bit PCM of the maker’s shape and writes mono MP3 with no Xing header', () => {
    const args = encoderArgs({ sampleRate: 24_000, channels: 1 });
    expect(args.join(' ')).toContain('-f s16le -ar 24000 -ac 1 -i pipe:0');
    expect(args.join(' ')).toContain('-b:a 64k -write_xing 0');
    expect(args.at(-1)).toBe('pipe:1');
  });
});

describe.runIf(canEncodeMp3())('pcmToMp3, with ffmpeg', () => {
  it('turns a second of PCM into MP3 frames as it streams, and counts what came in', async () => {
    const rate = 24_000;
    const pcm = new Uint8Array(rate * 2);
    const view = new DataView(pcm.buffer);
    for (let i = 0; i < rate; i++) view.setInt16(i * 2, Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000), true);
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(pcm.slice(0, rate));
        controller.enqueue(pcm.slice(rate));
        controller.close();
      },
    });
    let counted = 0;
    const out = pcmToMp3(source, { sampleRate: rate, channels: 1 }, { onSourceBytes: (n) => (counted += n) });
    const bytes = new Uint8Array(await new Response(out).arrayBuffer());
    expect(counted).toBe(pcm.length);
    expect(bytes.length).toBeGreaterThan(1000);
    // The first frame header: no ID3 tag, no Xing frame in front of the audio.
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1] & 0xe0).toBe(0xe0);
  });
});
