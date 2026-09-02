# Compass — AI Execution Telemetry (build)

## Done: lucide barrel imports

Every icon came in through the package root - `import { Compass } from
'lucide-react-native'` - across 52 files. Metro does not tree-shake, so the
barrel put the whole icon set in the bundle. Fixed by `src/components/icons.ts`,
which deep-imports each icon one file at a time (`lucide-react-native/icons/
compass`) and re-exports it under the same name, so call sites only changed
their import path.

Measured with `pnpm exec expo export --platform android --source-maps`, and on
the Galaxy A33 by timing the two module graphs in the dev bundle.

| | before | after |
| --- | --- | --- |
| Android bundle (Hermes) | 10,983,455 B | 7,600,992 B (**-3.23 MiB, -30.8%**) |
| modules in the bundle | 5,066 | 3,387 (**-1,679, -33.1%**) |
| lucide icon modules | 1,749 | 70 |
| icon graph evaluation, A33 | 2.9s / 5.8s / 5.7s | 223ms / 575ms / 527ms |

The A33 row is a dev bundle, so the absolute numbers overstate what a release
build pays; the ratio (about 10x, stable across three runs) is the real read.
The bundle rows are production Hermes output and are exact.

Also retired four deprecated lucide alias names while passing through, since
they no longer have files of their own: `CheckCircle` and `CircleCheckBig` were
the same glyph under two names (now `CircleCheckBig`), `CheckCircle2` ->
`CircleCheck`, `MinusCircle` -> `CircleMinus`, `XCircle` -> `CircleX`.

- [x] a. Measure first.
- [x] b. Deep imports behind one app-level icon module. Metro has
      `unstable_enablePackageExports` on by default in SDK 57, so the package's
      own `./icons/*` subpath resolves; no `dist/` paths, no Metro experiments,
      no babel transform.
- [x] c. Applied and re-measured, numbers above.
- [x] d. Rule added to CLAUDE.md under "Performance is designed in".

## Extension 2: reading intelligence (read boundary, highlight context, AI tags, tag ranking)
- [x] a. `book-context.ts`: shared `loadChapterText` + `extractSurroundingText` (before/after around locator)
- [x] b. Schema: `highlights.context` column + hand-written migration 0011
- [x] c. Shared: `tags.ts` (SuggestTags schemas + prompt + normalizeTags) + index export
- [x] d. Server: `runCompassAnalysis` → exported `runStructuredAnalysis`; new `POST /tags/suggest` (kind tag_suggest, metered, maxCompletionTokens 100)
- [x] e. Reader store: fire-and-forget `extractSurroundingText` capture on `addHighlight`
- [x] f. Chat: read-boundary system line in `createSession` (both branches) + book-level chats grounded in read-text excerpt via progress locator
- [x] g. Timeline: highlight chats include stored surrounding context (before/[Highlighted]/after)
- [x] h. Client: `tag-suggest.ts` (cloud /tags/suggest, or local one-shot bracketed by resetConversation)
- [x] i. UI: SUGGEST TAGS action + AI chips in highlight-menu, wired in reader/[id].tsx (passes note + surrounding context)
- [x] j. Compass ranking: tag match weight 2 > text 1 > title 0.5 (+ tests)
- [x] k. Verify: tsc app+server clean, 34 vitest pass, lint clean (only pre-existing settings.tsx error), server boots + routes 401/400

## Extension 3: journey partner (search_reading, suggest_next_book, local journey memory, counterweight)
- [x] a. Pure `epub-spine.ts` (parseSpine + resolveReadCutoff, unit-tested) + `book-context.extractReadText` (spoiler-bounded whole-book, unzip-once)
- [x] b. search_reading tool: declare (tools.ts) → bind (cloud-chat.ts) → execute (chat-tools.ts, reading bounded + archived full) → offline parity (SAMWELL_TOOLS)
- [x] c. suggest_next_book tool: declare → bind → execute (library query, grouped formatter) → offline parity
- [x] d. journey_notes table + migration 0012 (hand-written paired sql/js, journal + migrations.js)
- [x] e. src/services/journey.ts: buildJourneySnapshot (finished/reading/tags/goal/focus-trend/completed-variance) + recallJourney (reuse extractKeywords) + saveJourneyReflection + saveBookFinishedNote
- [x] f. CompassNightAnalysisSchema += journeyNote; night prompt asks for it; submitNight persists reflection; updateBookStatus→archived writes deterministic note
- [x] g. Injection: chat createSession journeyBlock() (general + book-level, not passage chats); compass morning/night payload `journey?` via buildJourneySnapshot
- [x] h. Persona (persona.ts: honest not agreeable) + compass-prompts (counterweight/brainstorm, journey-aware direction, journeyNote instruction)
- [x] i. Verify: tsc app+server clean, 44 vitest pass (+10 epub-spine), lint clean (only pre-existing settings.tsx error), server smoke (tools load, journey validates, 400/502 paths)

## Review (extension 3)
- Journey memory is fully local-first: `@tanstack/ai-memory` rejected (server-side/off-device). Store + history on-device (journey_notes + existing tables); only the compact recalled slice rides with cloud requests already being made (chat system message / Compass payload), exactly like reading-context.
- Spoiler safety for search_reading is enforced at the DATA layer (resolveReadCutoff never includes chapters past the locator), stronger than a prompt instruction. Reading books bounded to locator; reading-with-no-progress skipped; archived = whole book.
- Reflections cost zero extra calls (piggyback night check-in journeyNote); book-finish notes are deterministic.
- Counterweight scoped to execution: sharp in Compass prompts, mild honesty trait in base persona (casual book chat stays warm).
- Not locally verifiable: real LLM tool-calling / reflection quality (no OPENROUTER_API_KEY); offline tool path needs a loaded local model; extractReadText end-to-end needs a real EPUB on device (pure spine/cutoff logic is unit-tested).

## Review (extension 2)
- Spoiler boundary now enforced: every book-linked chat session gets a system line stating read %/page and forbidding content beyond it (book text AND model's own knowledge). Book-level chats additionally grounded in the actual read text (sliced to the progress locator) instead of the model's memory.
- Highlight meaning-correlation fixed: surrounding chapter text captured at highlight time into `highlights.context`; timeline highlight-chats and AI tagging both consume it.
- AI tags work on both paths (cloud endpoint / local one-shot) as tap-to-accept chips; never gate the highlight flow. Existing tag vocabulary + active goal fed in to curb sprawl and bias toward the journey.
- Tags feed back into Compass: a tagged passage matching the goal outranks one that merely mentions the word.
- Not locally verifiable: real LLM tag quality (no OPENROUTER_API_KEY here); on-device one-shot path needs a loaded local model.

## Extension: reading context (core to Open Citadel)
- [x] `CompassReadingRefSchema` + optional `readingContext` (max 12) on all three request schemas — flows to the LLM automatically (server spreads parsed body)
- [x] Prompts: engineer persona + per-endpoint guidance — cite the driver's own saved passages only when they change the action; most days zero or one
- [x] `compass-reading-rank.ts` (pure keyword ranking, 8 vitest tests) + `compass-reading.ts` (on-device selection over highlights/notes/thoughts, best-effort)
- [x] Store wiring: setup/morning/night all send reading context selected against goal + milestone + report text

Plan: /home/thamsanqaj/.claude/plans/i-have-a-feature-dreamy-blum.md

- [x] 1. Shared contract: `packages/samwell-shared/src/compass.ts` + `compass-prompts.ts` + index exports; tsc both workspaces
- [x] 2a. Server: `http-helpers.ts` extraction, `kind` column on usage_events, `server/src/compass.ts` routes, mount in index.ts (fork: runtime-verified 401/400/502 + kind rows)
- [x] 2b. App DB: 4 compass tables in `src/db/schema.ts` + hand-written migration 0010 (drizzle-kit output was unusable — see lessons.md)
- [x] 2c. Math: `src/services/compass-math.ts` + vitest (19 tests pass)
- [x] 3. Settings: compass times in `src/stores/settings.ts`; `expo-notifications@~55.0.25` + `src/services/compass-notifications.ts`
- [x] 4. Client: `src/services/compass-api.ts` + `src/stores/compass.ts`
- [x] 5. UI: dashboard/setup/checkin screens, compass components, time-picker-sheet, settings COMPASS section, tab trigger
- [x] 6. Verify: vitest (19 pass), tsc clean (app + server), lint clean on all compass files, server runtime-verified (401/400/429-shape/502 + kind metering rows), expo typed routes regenerated

## Review

- Architecture landed per plan: stateless server analyzers (`chat({ outputSchema })` structured output), all math client-side in `compass-math.ts`, local-first drizzle storage, `kind`-tagged metering.
- Deviation from plan: drizzle-kit generate was unusable (stale meta snapshots since 0005) — migration 0010 hand-written in the house paired sql/js format; see lessons.md.
- Pre-existing (not ours): `expo lint` fails with one `react/no-unescaped-entities` error in settings.tsx line ~639 ("isn't") that exists on a clean tree.
- Not verifiable locally: a real LLM round-trip (no OPENROUTER_API_KEY on this machine) and on-device reminder firing.
- Reminder caveat: expo-notifications is a native module — the dev client / APK must be rebuilt before notifications work on device.
