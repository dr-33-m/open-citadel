import { describe, expect, it } from 'vitest';

import { decideOnboarding } from '../onboarding-gate';

/**
 * The case this exists for is the upgrade.
 *
 * Nothing has ever written `onboarding.state = 'pending'`; the key is absent
 * or it is 'done'. So "absent" was carrying the whole decision, and it meant
 * "fresh install" only because onboarding did not exist when this build's
 * users installed the app. Everyone already reading was one update away from
 * being offered a welcome screen that would set up the library they had spent
 * months filling.
 */
describe('decideOnboarding', () => {
  it('sends a genuinely fresh install through onboarding', () => {
    expect(decideOnboarding({ stored: undefined, booksDirectoryUri: undefined })).toEqual({
      state: 'pending',
      record: false,
    });
  });

  it('lets an existing reader straight into their library', () => {
    expect(
      decideOnboarding({ stored: undefined, booksDirectoryUri: 'content://tree/primary%3ABooks' }),
    ).toEqual({ state: 'done', record: true });
  });

  it('writes that answer down rather than deriving it every launch', () => {
    // Without the record, "onboarding is behind them" stays a fact about a
    // folder: delete the folder and the welcome screen returns.
    const first = decideOnboarding({ stored: undefined, booksDirectoryUri: 'file:///books' });
    expect(first.record).toBe(true);
    const afterWriting = decideOnboarding({ stored: 'done', booksDirectoryUri: undefined });
    expect(afterWriting).toEqual({ state: 'done', record: false });
  });

  it('does not mistake an empty folder setting for a library', () => {
    // A row created and left blank is the shape a config UI produces, and it
    // is not a scan root.
    for (const blank of ['', '   ']) {
      expect(decideOnboarding({ stored: undefined, booksDirectoryUri: blank })).toEqual({
        state: 'pending',
        record: false,
      });
    }
  });

  it('never re-derives once an answer is stored', () => {
    expect(decideOnboarding({ stored: 'done', booksDirectoryUri: 'file:///books' }).record).toBe(
      false,
    );
    expect(decideOnboarding({ stored: 'pending', booksDirectoryUri: 'file:///books' })).toEqual({
      state: 'pending',
      record: false,
    });
  });
});
