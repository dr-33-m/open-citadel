import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///docs/' }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({ podcastEpisodes: {} }));
vi.mock('@/services/podcasts/records', () => ({ nowIso: () => '' }));

const { fileNameFor } = await import('@/services/podcasts/download-files');

describe('fileNameFor', () => {
  it('takes the extension from the type, then the address, then mp3', () => {
    expect(fileNameFor({ id: 'e1', audioUrl: 'https://a.test/x', mimeType: 'audio/mp4' })).toBe('e1.m4a');
    expect(fileNameFor({ id: 'e1', audioUrl: 'https://a.test/x.OGG?token=1', mimeType: null })).toBe('e1.ogg');
    expect(fileNameFor({ id: 'e1', audioUrl: 'https://a.test/stream', mimeType: null })).toBe('e1.mp3');
  });
});
