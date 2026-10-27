import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///docs/' }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({ podcastEpisodes: {}, podcasts: {} }));
vi.mock('@/services/podcasts/records', () => ({ nowIso: () => '' }));
vi.mock('@/query-manager/podcasts/invalidate', () => ({ invalidatePodcastLibrary: () => undefined }));
vi.mock('@/services/podcasts/episodes', () => ({ getEpisodeItem: async () => null }));
vi.mock('@/stores/player', () => ({ usePlayer: { getState: () => ({ current: null }) }, selectEpisode: () => null }));

const { coverNameFor } = await import('@/services/podcasts/download-covers');

describe('coverNameFor', () => {
  it('gives one address one name, so a show\'s episodes share its cover', () => {
    const url = 'https://a.test/art/show.png?size=1400';
    expect(coverNameFor(url)).toBe(coverNameFor(url));
    expect(coverNameFor(url)).toMatch(/^cover-[0-9a-f]{16}\.png$/);
  });

  it('gives different addresses different names', () => {
    expect(coverNameFor('https://a.test/1.jpg')).not.toBe(coverNameFor('https://a.test/2.jpg'));
  });

  it('falls back to jpg when the address does not end in a picture type', () => {
    expect(coverNameFor('https://a.test/image/abc123')).toMatch(/\.jpg$/);
    expect(coverNameFor('https://a.test/cover.php?id=4')).toMatch(/\.jpg$/);
  });
});
