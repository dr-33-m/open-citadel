import { describe, expect, it, vi } from 'vitest';

/*
 * The free voice samples, asked for the way each phone asks. iOS opens a WAV
 * clip with a two-byte range request and plays nothing unless it gets a 206.
 */

const CLIP = new Uint8Array(Array.from({ length: 64 }, (_, i) => i)).buffer;

vi.mock('../voice-catalog.js', () => ({
  voiceCatalog: { find: async (id: string) => (id === 'google/gemini-3.8-flash-tts' ? { id } : null) },
}));
vi.mock('../voice-samples.js', () => ({
  generateSamples: vi.fn(),
  readSample: async (_model: unknown, voice: string) =>
    voice === 'Kore' ? { audio: CLIP, contentType: 'audio/wav' } : null,
}));

const { voiceSampleRoutes } = await import('../voice-routes.js');

const KORE = 'http://test/samples/google/gemini-3.8-flash-tts/Kore';

describe('GET /tts/samples', () => {
  it('sends the whole clip, and says ranges are welcome', async () => {
    const res = await voiceSampleRoutes.request(KORE);
    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect((await res.arrayBuffer()).byteLength).toBe(64);
  });

  it("answers AVPlayer's two-byte probe with a 206 and those two bytes", async () => {
    const res = await voiceSampleRoutes.request(KORE, { headers: { Range: 'bytes=0-1' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/64');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1]);
  });

  it('sends the rest of the clip from where it is asked', async () => {
    const res = await voiceSampleRoutes.request(KORE, { headers: { Range: 'bytes=60-' } });
    expect(res.status).toBe(206);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([60, 61, 62, 63]);
  });

  it('says 416 for a range past the end', async () => {
    const res = await voiceSampleRoutes.request(KORE, { headers: { Range: 'bytes=64-' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */64');
  });

  it('still says 404 for a voice with no clip', async () => {
    const res = await voiceSampleRoutes.request('http://test/samples/google/gemini-3.8-flash-tts/Nobody');
    expect(res.status).toBe(404);
  });
});
