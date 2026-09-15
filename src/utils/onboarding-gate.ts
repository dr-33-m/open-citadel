/**
 * Whether somebody opening the app still has their first run ahead of them.
 *
 * Pure, and in `utils` rather than inside the settings store, for one reason:
 * the store cannot be imported without a database, and this decision is the
 * kind that is wrong for months before anybody notices. It is only ever
 * exercised on a device that has been used before, which is precisely the
 * device no developer is testing on.
 */
export function decideOnboarding(input: {
  /** `onboarding.state` as stored, or undefined when it was never written. */
  stored: string | undefined;
  /** `booksDirectoryUri` as stored. The scan root, if there is one. */
  booksDirectoryUri: string | undefined;
}): {
  state: 'pending' | 'done';
  /**
   * Whether the answer should be written down.
   *
   * True only when it was derived rather than read. Undecided-and-derived is
   * a fact about a folder, and a fact about a folder can change: remove it
   * later and the welcome screen would come back, offering to introduce an app
   * they have been using for a year.
   */
  record: boolean;
} {
  if (input.stored !== undefined) {
    // Nothing writes 'pending' today, but reading it as such costs nothing and
    // keeps the door open for a first run that can be resumed across launches.
    return { state: input.stored === 'pending' ? 'pending' : 'done', record: false };
  }

  /*
   * Never recorded, so it has to be inferred, and a scan folder is the honest
   * thing to infer from. It is the one thing nobody arrives with and nobody
   * has by accident: on Android they picked it, on iOS the app made it the
   * first time they imported something. Either way there are books behind it.
   */
  const hasLibraryFolder = Boolean(input.booksDirectoryUri?.trim());
  return { state: hasLibraryFolder ? 'done' : 'pending', record: hasLibraryFolder };
}
