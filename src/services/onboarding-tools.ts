/**
 * What Samwell can actually do while setting somebody up.
 *
 * The definitions live in `samwell-shared/onboarding-tools`, because the server
 * has to send the same schemas it will be called back with. The work lives
 * here, because every one of these touches the device: a folder, the reader's
 * own files, a download, and the flag that ends the first run.
 *
 * Each executor returns the tool's output schema verbatim, including its
 * failures. A tool that throws takes the whole turn down with it and leaves
 * Samwell mid-sentence; a tool that returns `{ ok: false, error }` lets him say
 * what went wrong, which is the difference between an app that broke and a
 * person who told you something did not work.
 */
import { type FreeBookSchema } from 'samwell-shared';
import type { z } from 'zod';

import { cloudHeaders } from '@/services/cloud-identity';
import {
  downloadBooksIntoLibrary,
  setUpLibrary,
  type LibrarySetupResult,
} from '@/services/library-setup';
// Imported for the store's actions only, never read at module scope. The
// chat store reaches back here through `cloud-chat`, so this is a cycle, and
// touching it during evaluation rather than at call time is what would break
// it.
import { useOnboardingChatStore } from '@/stores/onboarding-chat';
import { useSettingsStore } from '@/stores/settings';

type FreeBook = z.infer<typeof FreeBookSchema>;

/** The shortlist from the last `find_free_books`, so ids can be resolved. */
let lastCandidates: (FreeBook & { epubUrl: string })[] = [];

/**
 * What Samwell reads back after the library is made.
 *
 * Prose rather than the raw counts, because the two platforms did different
 * things and he has to describe the right one. The word MOVED is deliberate:
 * he is told to say so before the call, and the result says so again, since
 * that is the sentence the reader needs to have heard.
 */
function describeSetup(result: LibrarySetupResult): string {
  if (result.error === 'cancelled') {
    return 'The user closed the picker without choosing anything. Nothing was changed. Treat this as their decision, not a failure, and do not call this tool again unless they ask.';
  }
  if (!result.ok) {
    return result.error ?? 'The library could not be set up.';
  }

  const noun = result.imported === 1 ? 'book' : 'books';
  const verb = result.platform === 'android' ? 'moved' : 'copied';
  const skipped =
    result.skipped > 0
      ? ` ${result.skipped} would not open and were left where they were.`
      : '';

  if (result.imported === 0) {
    return `The "${result.folderName}" folder was created, but no EPUB books were found in the folder they picked. Their library is empty for now. Offer to find them some free books instead.${skipped}`;
  }

  return `Done. ${result.imported} ${noun} ${verb} into their "${result.folderName}" folder, and that folder is now their library.${skipped}`;
}

export async function runSetUpLibrary(): Promise<{
  ok: boolean;
  folder: { platform: 'android' | 'ios'; folderName: string } | null;
  imported: number;
  skipped: number;
  summary: string;
  error?: string;
}> {
  try {
    const result = await setUpLibrary();
    const summary = describeSetup(result);
    /*
     * Books, not just a folder.
     *
     * A pick that found nothing leaves an empty Open Citadel folder and a
     * conversation that carries on to free books, so marking readiness there
     * would swap the reader's text field for a GO TO MY LIBRARY button in the
     * middle of Samwell asking them a question.
     */
    if (result.ok && result.imported > 0) {
      useOnboardingChatStore.getState().markLibraryReady();
    }
    return {
      ok: result.ok,
      folder: result.folderName
        ? { platform: result.platform, folderName: result.folderName }
        : null,
      imported: result.imported,
      skipped: result.skipped,
      summary,
      // `error` only when it did not work. The prose lives in `summary` either
      // way; a success message in a field called `error` is how a model ends
      // up apologising for something that went fine.
      ...(result.ok ? {} : { error: summary }),
    };
  } catch (error) {
    console.warn('[onboarding] set_up_library failed:', error);
    const summary =
      error instanceof Error
        ? `Setting up the library failed: ${error.message}`
        : 'Setting up the library failed.';
    return { ok: false, folder: null, imported: 0, skipped: 0, summary, error: summary };
  }
}

type SearchResponse = {
  results?: { id: number; title: string; author: string; subjects: string[]; epubUrl: string }[];
};

export async function runFindFreeBooks(input: { interests: string }): Promise<{
  candidates: FreeBook[];
  formatted: string;
  error?: string;
}> {
  const baseUrl = useSettingsStore.getState().cloudBaseUrl;
  if (!baseUrl) {
    return { candidates: [], formatted: '', error: 'Samwell Cloud is not configured.' };
  }

  try {
    const headers = await cloudHeaders();
    const url = `${baseUrl}/library/gutenberg/search?q=${encodeURIComponent(input.interests)}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Search returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as SearchResponse;
    const results = body.results ?? [];
    // Held so `download_free_books` can turn an id back into a URL. The model
    // is only ever given ids, so nothing it invents can become a download.
    lastCandidates = results;

    if (results.length === 0) {
      return {
        candidates: [],
        formatted:
          'Project Gutenberg had nothing matching that. Say so honestly and offer to try a different angle, in their words rather than yours.',
        error: undefined,
      };
    }

    const formatted = results
      .map((book) => {
        const subjects = book.subjects.length > 0 ? ` [${book.subjects.join('; ')}]` : '';
        return `${book.id}: "${book.title}" by ${book.author}${subjects}`;
      })
      .join('\n');

    return {
      candidates: results.map(({ id, title, author, subjects }) => ({
        id,
        title,
        author,
        subjects,
      })),
      formatted: `Free books on Project Gutenberg matching "${input.interests}". Pick the three that genuinely fit what they told you, not the first three:\n${formatted}`,
    };
  } catch (error) {
    console.warn('[onboarding] find_free_books failed:', error);
    return {
      candidates: [],
      formatted: '',
      error:
        'Could not reach Project Gutenberg. Tell them their library is empty for now and that they can add books from the Library screen whenever they like.',
    };
  }
}

export async function runDownloadFreeBooks(input: { gutenberg_ids: number[] }): Promise<{
  ok: boolean;
  downloaded: string[];
  failed: { id: number; error: string }[];
  error?: string;
}> {
  /*
   * Resolved against the last search rather than trusted from the model.
   *
   * An id is the only thing it is given, and an id it made up resolves to
   * nothing rather than to a URL this app then fetches. That is the whole
   * reason the shortlist is held above.
   */
  const chosen = input.gutenberg_ids
    .map((id) => lastCandidates.find((book) => book.id === id))
    .filter((book): book is FreeBook & { epubUrl: string } => book !== undefined);

  if (chosen.length === 0) {
    return {
      ok: false,
      downloaded: [],
      failed: [],
      error:
        'None of those ids came from the search results. Call find_free_books first and choose from what it returns.',
    };
  }

  try {
    const { downloaded, failed, cancelled } = await downloadBooksIntoLibrary(chosen);
    if (cancelled) {
      return {
        ok: false,
        downloaded: [],
        failed: [],
        error:
          'The user closed the folder picker, so there is nowhere to put the books. That is their decision. Do not try again unless they ask.',
      };
    }
    if (downloaded.length > 0) useOnboardingChatStore.getState().markLibraryReady();
    return { ok: downloaded.length > 0, downloaded, failed };
  } catch (error) {
    console.warn('[onboarding] download_free_books failed:', error);
    return {
      ok: false,
      downloaded: [],
      failed: [],
      error: error instanceof Error ? error.message : 'The downloads failed.',
    };
  }
}

/**
 * End the free conversation.
 *
 * Two side effects and no local flag of its own, which is the point. The
 * composer's `done` state is derived from `settings.onboarding`, so there is
 * one answer to "is onboarding over" rather than a store field that can
 * disagree with the thing the router reads.
 *
 * The server report is fire and forget. It closes the grant so the free route
 * is not open forever, and a failed report is not worth taking a goodbye down
 * over: the turn ceiling closes an abandoned grant on its own.
 *
 * Split from the tool because the tool is not the only way out. Tapping GO TO
 * MY LIBRARY has to do exactly this too, and on the run that prompted the
 * split it was the only thing that did: Samwell said his goodbye and then did
 * not call anything, three times running.
 */
export async function completeOnboarding(): Promise<void> {
  const baseUrl = useSettingsStore.getState().cloudBaseUrl;
  if (baseUrl) {
    void (async () => {
      try {
        await fetch(`${baseUrl}/onboarding/complete`, {
          method: 'POST',
          headers: await cloudHeaders(),
        });
      } catch (error) {
        if (__DEV__) console.warn('[onboarding] Could not close the grant:', error);
      }
    })();
  }

  await useSettingsStore.getState().finishOnboarding();
}

export async function runFinishOnboarding(): Promise<{ ok: boolean }> {
  await completeOnboarding();
  return { ok: true };
}
