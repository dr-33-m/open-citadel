import { describe, expect, it } from 'vitest';

import { podcastSummary, profileSummary, samwellSummary, voiceSummary } from '@/features/settings/utils/summaries';

describe('profileSummary', () => {
  const base = { accountsEnabled: true, signedIn: false, email: null, guestPlan: null };

  it('says who is signed in', () => {
    expect(profileSummary({ ...base, signedIn: true, email: 'sam@citadel.org' })).toBe('sam@citadel.org');
    expect(profileSummary({ ...base, signedIn: true })).toBe('Signed in');
  });

  it('says nobody is', () => {
    expect(profileSummary(base)).toBe('Not signed in');
  });

  it('names a plan bought without an account', () => {
    expect(profileSummary({ ...base, guestPlan: 'Maester' })).toBe('Maester on this phone · Not signed in');
  });

  it('never mentions signing in where there are no accounts', () => {
    expect(profileSummary({ ...base, accountsEnabled: false })).toBe('What Samwell calls you');
  });
});

describe('samwellSummary', () => {
  const base = { mode: 'offline' as const, brain: null, cloudBrain: null, plan: null };

  it('names the on-device brain', () => {
    expect(samwellSummary({ ...base, brain: 'Qwen 3 1.7B' })).toBe('On-device · Qwen 3 1.7B');
  });

  it('says when no brain is chosen', () => {
    expect(samwellSummary(base)).toBe('On-device · No brain chosen');
  });

  it('names the cloud brain, then the plan, then neither', () => {
    const cloud = { ...base, mode: 'cloud' as const, brain: 'Qwen 3 1.7B' };
    expect(samwellSummary({ ...cloud, cloudBrain: 'Sonnet', plan: 'Maester' })).toBe('Cloud · Sonnet');
    expect(samwellSummary({ ...cloud, plan: 'Maester' })).toBe('Cloud · Maester');
    expect(samwellSummary(cloud)).toBe('Cloud · No plan yet');
  });
});

describe('voiceSummary', () => {
  it('names the voice under its kind', () => {
    expect(voiceSummary({ mode: 'ai', name: 'Yennefer' })).toBe('Enhanced · Yennefer');
    expect(voiceSummary({ mode: 'native', name: 'English (UK)' })).toBe('Lite · English (UK)');
  });

  it('falls back to the kind alone', () => {
    expect(voiceSummary({ mode: 'native', name: null })).toBe('Lite voice');
  });

  it('names a cloud voice as Cloud and the voice', () => {
    expect(voiceSummary({ mode: 'cloud', name: 'Kore' })).toBe('Cloud · Kore');
    expect(voiceSummary({ mode: 'cloud', name: null })).toBe('Cloud voice');
  });
});

describe('podcastSummary', () => {
  it('gives both skips', () => {
    expect(podcastSummary({ skipBackSec: 10, skipForwardSec: 30 })).toBe('Back 10 sec · Forward 30 sec');
  });
});
