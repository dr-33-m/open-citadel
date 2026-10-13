import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///docs/' }));

const { episodeArtwork, localCoverUri, localFileUri } = await import('@/services/podcasts/download-paths');

describe('localFileUri', () => {
  it('is the file in the podcasts folder once downloaded, and null before', () => {
    expect(localFileUri({ downloadStatus: 'downloaded', downloadFile: 'e1.mp3' })).toBe('file:///docs/podcasts/e1.mp3');
    expect(localFileUri({ downloadStatus: 'downloading', downloadFile: 'e1.mp3' })).toBeNull();
    expect(localFileUri({ downloadStatus: 'downloaded', downloadFile: null })).toBeNull();
  });
});

describe('localCoverUri', () => {
  it('is the saved cover of a downloaded episode, and null for any other', () => {
    expect(localCoverUri({ downloadStatus: 'downloaded', downloadCover: 'cover-1.jpg' })).toBe(
      'file:///docs/podcasts/cover-1.jpg',
    );
    expect(localCoverUri({ downloadStatus: 'none', downloadCover: 'cover-1.jpg' })).toBeNull();
    expect(localCoverUri({ downloadStatus: 'downloaded', downloadCover: null })).toBeNull();
  });
});

describe('episodeArtwork', () => {
  const remote = { imageUrl: 'https://a.test/e.jpg', showImageUrl: 'https://a.test/s.jpg' };

  it('is the copy saved with the download when there is one', () => {
    expect(episodeArtwork({ ...remote, downloadStatus: 'downloaded', downloadCover: 'cover-1.jpg' })).toBe(
      'file:///docs/podcasts/cover-1.jpg',
    );
  });

  it("is the episode's own picture, then its show's, when nothing is saved", () => {
    expect(episodeArtwork({ ...remote, downloadStatus: 'downloaded', downloadCover: null })).toBe(remote.imageUrl);
    expect(episodeArtwork({ ...remote, downloadStatus: 'none', downloadCover: 'cover-1.jpg' })).toBe(remote.imageUrl);
    expect(episodeArtwork({ ...remote, imageUrl: null, downloadStatus: 'none', downloadCover: null })).toBe(
      remote.showImageUrl,
    );
  });
});
