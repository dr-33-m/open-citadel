import { toolDefinition } from '@tanstack/ai/client';
import { z } from 'zod';

import { explainAppTool } from './tools';

/**
 * The four things Samwell can do while setting somebody up.
 *
 * All four execute on the device, because all four touch the device: a folder,
 * the reader's own files, a download, and the flag that says onboarding is
 * over. The server only defines the shapes and never sees a filename.
 *
 * This is a deliberately tiny catalogue. Onboarding is the one conversation
 * where the model has never met the person and cannot be steered by anything
 * it already knows about them, so every extra tool is another way for the
 * first five minutes to go somewhere strange. The library tools, the Compass
 * tools and the journey are all absent, and they are absent by construction:
 * `ONBOARDING_TOOL_DEFINITIONS` is what the route sends, and there is no path
 * from here to the others.
 */

/** Where the books ended up, in the words the reader would use for it. */
const LibraryFolderSchema = z.object({
  /**
   * How the folder was made, since the two platforms mean different things by
   * it and Samwell must not describe the wrong one. On Android the reader
   * picked a folder and one was created inside it; on iOS the app already owns
   * the folder and the reader picked files.
   */
  platform: z.enum(['android', 'ios']),
  /** What to call the folder when speaking about it. Never a raw URI. */
  folderName: z.string(),
});

export const SetUpLibraryInputSchema = z.object({});

export const SetUpLibraryOutputSchema = z.object({
  ok: z.boolean(),
  folder: LibraryFolderSchema.nullable(),
  /** How many EPUBs are now in the folder. */
  imported: z.number(),
  /** Files found but left behind, because they would not open. */
  skipped: z.number(),
  /**
   * What happened, in prose, whether it worked or not.
   *
   * Separate from `error` on purpose. Both outcomes need describing — the two
   * platforms did different things to the reader's files and Samwell has to
   * say the right one — and putting a success message in a field called
   * `error` is how a model ends up apologising for something that worked.
   */
  summary: z.string(),
  /**
   * Set only when it did NOT work, including when the reader backed out of the
   * system picker. Backing out is a decision and Samwell should treat it as
   * one rather than apologising or trying again unprompted.
   */
  error: z.string().optional(),
});

export const FindFreeBooksInputSchema = z.object({
  interests: z
    .string()
    .min(1)
    .describe(
      "What the user said they care about or are working toward, in their own words. Whole phrases work better than keywords: 'starting a business while working full time' finds more than 'business'.",
    ),
});

export const FreeBookSchema = z.object({
  /** Project Gutenberg's own id. What `download_free_books` takes. */
  id: z.number(),
  title: z.string(),
  author: z.string(),
  subjects: z.array(z.string()),
});

export const FindFreeBooksOutputSchema = z.object({
  candidates: z.array(FreeBookSchema),
  formatted: z.string(),
  error: z.string().optional(),
});

export const DownloadFreeBooksInputSchema = z.object({
  gutenberg_ids: z
    .array(z.number())
    .min(1)
    .max(3)
    .describe('The ids of the books to download, from find_free_books. At most three.'),
});

export const DownloadFreeBooksOutputSchema = z.object({
  ok: z.boolean(),
  downloaded: z.array(z.string()),
  failed: z.array(z.object({ id: z.number(), error: z.string() })),
  error: z.string().optional(),
});

export const FinishOnboardingInputSchema = z.object({});

export const FinishOnboardingOutputSchema = z.object({
  ok: z.boolean(),
});

export const setUpLibraryTool = toolDefinition({
  name: 'set_up_library',
  description:
    "Make the user's Open Citadel library folder and bring the EPUB books already on their device into it. On Android this opens the system folder picker, asks them which folder their books are in, creates an 'Open Citadel' folder inside it, and MOVES every EPUB it finds there. On iOS it opens the file picker and copies whatever they choose into the folder the app owns. Call this only after they have said they have books on the device. It needs their approval before it runs, and they may decline or back out of the picker, which is not an error. Requires user approval.",
  inputSchema: SetUpLibraryInputSchema,
  outputSchema: SetUpLibraryOutputSchema,
  needsApproval: true,
});

export const findFreeBooksTool = toolDefinition({
  name: 'find_free_books',
  description:
    "Search Project Gutenberg, which holds tens of thousands of free public-domain books, for titles matching what the user says they are interested in or working toward. Returns candidates only; it downloads nothing. Call this when they have no books on the device, after they have told you what they care about. Read the results and choose the three that genuinely fit what they said, rather than the first three back.",
  inputSchema: FindFreeBooksInputSchema,
  outputSchema: FindFreeBooksOutputSchema,
});

export const downloadFreeBooksTool = toolDefinition({
  name: 'download_free_books',
  description:
    "Download up to three books found by find_free_books into the user's Open Citadel folder, creating that folder first if it does not exist yet. Tell them which three you picked and why before calling this. Requires user approval.",
  inputSchema: DownloadFreeBooksInputSchema,
  outputSchema: DownloadFreeBooksOutputSchema,
  needsApproval: true,
});

export const finishOnboardingTool = toolDefinition({
  name: 'finish_onboarding',
  description:
    "End onboarding. Call this once, as the last thing you do, after the library is ready and you have said your goodbye. It gives the user a button through to their library, and it closes this free conversation, so never call it before you have finished speaking.",
  inputSchema: FinishOnboardingInputSchema,
  outputSchema: FinishOnboardingOutputSchema,
});

export const ONBOARDING_TOOL_DEFINITIONS = [
  setUpLibraryTool,
  findFreeBooksTool,
  downloadFreeBooksTool,
  finishOnboardingTool,
  /*
   * The same tool reading chat carries, and the same guide behind it.
   *
   * Onboarding is where the app gets explained, so this is the one place it
   * would be tempting to paste the guide into the system prompt instead. That
   * would be a second copy of it, charged against every turn of a
   * conversation the house is paying for, to save one tool call.
   */
  explainAppTool,
] as const;

export const ONBOARDING_CLIENT_TOOL_DEFINITIONS = ONBOARDING_TOOL_DEFINITIONS.map((tool) =>
  tool.client(),
);

/**
 * The two that touch the reader's files, and so must be confirmed first.
 *
 * `set_up_library` deletes EPUBs from their storage on Android once it has
 * copied them, and `download_free_books` writes new files into a folder of
 * theirs. Neither is undoable from a conversation, and both are being asked
 * for by a model that has known the person for about ninety seconds.
 *
 * Read by the client to pick the right waiting message; the gate itself is the
 * `needsApproval` flag on the definitions above.
 */
export const ONBOARDING_APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'set_up_library',
  'download_free_books',
]);

export const ONBOARDING_TOOL_NAMES: ReadonlySet<string> = new Set(
  ONBOARDING_TOOL_DEFINITIONS.map((tool) => tool.name),
);
