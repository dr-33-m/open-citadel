# Samwell Cloud billing — plan and progress

> **This file is the working plan for the billing feature.** It is checked in so
> the work can be picked up mid-flight by anyone. The progress log below is the
> source of truth for *where things are*; everything after the divider is the
> approved plan and does not change as work lands.
>
> Start at **Start here** immediately below.

## Progress log

Last updated: 2026-09-09 (second session). Everything below is uncommitted in
the working tree.

### Start here

**State:** `pnpm exec tsc --noEmit` clean, `pnpm exec vitest run` 386 passing
(24 files), `pnpm exec eslint` clean on every changed path. The server-side
work through the credit metering was committed earlier on this branch
(`fd1e424`, `b60ef4b`, `3d16f25`); this file and the plan-section polish
round travel with the commit that follows it.

**Polish pass, 2026-09-09 (after the first device build):** the choose-plan
section, against the apple-design skill. The container card around the plan
run is gone - it sits on the section surface like text to speech does, the
slides being the only cards left because they are the things being compared.
Store prices are cleaned through `formatStorePrice`
(`src/features/billing/utils/price.ts`, 8 tests): the "US" qualifier and
exactly-zero cents come off ("US$20.00" → "$20"), real fractions and other
currencies survive. The benefit lines carry ticks, matching the onboarding
cards' treatment, with the tick taking the selected card's gold. The plan
name dropped its utility-label dress (`labelSm`, caps, tracked - which is
what pushed "GRAND MAESTER SAMWELL" past the card edge) for sentence-case
`bodySm`, constrained by a wrapper `View` with `flex-1` - the flex on the
text node itself proved not to constrain on device (seen in a screenshot,
one line over the border), and the wrapper is the structure with nothing
clever in it. The badges are now chess ranks: pawn, rook, crown. The fixed
slide height is the tallest card's content summed from the theme tokens
(242, written out in the file) - two rows wrap ("6 models to choose from",
the Grand Maester name) and the first measurement had been drawing past the
bottom border all along. RESTORE
PURCHASES is now the
quiet centred text row Apple's own subscription screens use instead of a
bordered chip competing with the commit; the gold button's disabled dim
settles over 120ms (Reanimated CSS transition, the house tool) rather than
snapping. The carousel and its depth slide are untouched on purpose - they
were already right.

**Done:** Stage 0 (bar the webhook), Stage 1, **all of Stage 2** (pricing,
ledger, webhook, routes, insiders), and **all of Stage 3** (guards 1-4 and the
credit metering in `/chat/http`). **Next:** the RevenueCat webhook integration
(see below), then Stages 4 to 8, the app side.

Work in this order:

1. **Deploy the server**, then create the RevenueCat webhook via MCP, pointed
   at the live route (Stage 0 - it was deferred on purpose so RevenueCat is
   not retrying against a 404). The URL is
   `${SAMWELL_CLOUD_URL}/billing/revenuecat/webhook`; `SAMWELL_CLOUD_URL` is
   in the gitignored root `.env`. The webhook secret the dashboard sends in
   the `Authorization` header must equal the server's
   `REVENUECAT_WEBHOOK_SECRET`, and the REST reconcile in `readEntitlement`
   plus the insider entitlement grant want
   `REVENUECAT_SECRET_API_KEY`. Both are new env rows; neither has a default.
   Send RevenueCat's own test event after creating the integration - the
   server answers it 200 and logs `Webhook event ignored: test`, which is the
   cheapest possible proof of the whole chain.
2. **Guard the deployment** (both easy to miss):
   - The live `cloud_models` table still needs the migration the plan
     describes below (`min_plan` defaults to the dearest tier, so an
     unmigrated catalogue leaves Maester and Grand Maester able to reach
     nothing). `GET /health` reports `modelsByPlan` and
     `modelsMissingPrices`.
   - **The metering change refuses turns for anybody without a plan.** Every
     app build older than Stage 4 gets a 402 where chat used to be. There are
     no subscribers yet and traffic is dev, so the cost is the founder's own
     daily build until the new app ships - but do not ship the server to
     production expecting the current TestFlight/dev build to keep talking.
3. **Stages 4 to 8**, the app side, in the order the plan gives. The server
   pieces the app work needs are all in place: `GET /billing/me` returns
   `{ balance, defaultModelId, models }` with `forecastCredits` and
   `multiplier` computed per model (server-side, per spec §19); the stream
   emits a `CUSTOM` chunk named `samwell-credits`
   (`{ balance, available, spentThisTurn }`) before `RUN_FINISHED`; the
   metered route's refusals are `402 { error: 'no_subscription' }`,
   `402 { error: 'insufficient_credits', required, available }` and
   `429 { error: 'credit_turn_ceiling', spent, ceiling, available }`, plus the
   existing `429 tool_loop_exhausted` - Stage 8's typed error handling reads
   exactly these shapes.
4. Insider codes are live server-side: `POST /admin/insider/invites`
   (`x-admin-key` header) mints a code; `POST /billing/insider/redeem`
   `{ code }` redeems it; a timer regrants monthly until the term ends. The
   app-side row ("Have a code?") is Stage 7's remaining work.

**Two things still need the founder, not an agent:**
- The Play Console and App Store Connect products, and the store credentials
  pasted into the RevenueCat dashboard (listed under Stage 0 below).
- A decision on `parallelToolCalls` (see Stage 3, Guard 2). It would make
  turns markedly cheaper and change how Samwell behaves. Left off.

**What this session decided, that the plan below did not predict:**
- The ledger is mutated only by single atomic statements, never explicit
  transactions - libsql throws SQLITE_BUSY on concurrent transactions
  instead of waiting (measured: 11 of 12 failed under load), while single
  statements serialize perfectly (200 concurrent atomic-gate updates: exactly
  the right number won). Every multi-statement operation therefore has a
  small crash window, and every window closes conservatively: undercharged
  rather than double-charged, understated rather than overspent. The
  event row's `status` transition is the single-winner gate that makes a
  retried settle, a release racing the sweep, or a late arrival after a crash
  unable to move money twice. `reconcileBalance` is the repair.
- `reconcileBalance` writes NO correcting ledger row. The ledger is the
  truth and the cache is a misreading of it; an adjustment row would change
  the very sum the balance is rebuilt from. `ADMIN_ADJUSTMENT` is reserved
  for a founder correcting a balance by hand.
- Charging assumes the forecast's cached-token share, because the adapter
  does not forward OpenRouter's cached-token detail (`CACHED_SHARE` in
  `index.ts`, one line to change when it does). Estimate and settle use the
  same basis on purpose.
- `usage_events.device_id` is now `account_id` (the rename the plan asked
  for), with a test that boots an old-shape database through the self-heal
  and proves both halves still work.
- `reserveUsageEvent` is now `recordUsageEvent` and refuses nothing: the
  message caps are dead, credits are the only thing that can refuse a turn.
  `GET /usage`, `getUsageState` and `limits.ts` are still alive because the
  shipped app still reads them; they die with the Stage 4 migration, as
  planned.
- Refused turns are marked `errored` on their event row - a refusal is a
  thing that happened, and a `'started'` row that never settles is a lie the
  sweep would ignore forever.
- The satellite routes (`/chat/title`, `/tags/suggest`, `/compass/takeaway`)
  record usage but do NOT charge credits yet. They were on the plan's
  "charged" table but outside this step's scope; they cost one small call on
  explicit reader action. Wiring them is a small follow-up, and they should
  take the same plan gate `/chat/http` has.

**Conventions this work has been following:** `CLAUDE.md` is the house style and
is not optional. Numbers that two sides both enforce live in `samwell-shared`,
never in two places. Anything with arithmetic in it gets a pure module and a
test before it gets a caller. Tick a box below only when the thing is done AND
`tsc --noEmit` still passes.

### Stage 0 — RevenueCat dashboard (project `proj612b72d1`)
- [x] Play Store app — `app863cb5af0d` (`com.dr33m.opencitadel`)
- [x] App Store app — `appefa2eecd44` (`com.dr33m.opencitadel`)
- [x] Entitlement `maester` — `entl74dba17e54`
- [x] Entitlement `grand_maester` — `entlc592476d79`
- [x] Entitlement `archmaester` — `entl20fdf70162`
- [x] Offering `default` — `ofrng567a26ebba` (is_current)
- [x] Packages x 3 — `pkge73c2e3ffa9` / `pkge7d502af3e6` / `pkged41ee92ccb`
- [x] Test Store products x 3 (`prod77fbf277c7` / `prodc78bddc34f` /
      `prod9f4c01eee2`), attached to entitlements and packages
- [x] Public SDK keys read for all three apps. **Not written down here** —
      this repo is public, and the same reasoning that keeps the Logto pair
      and the cloud URL out of git applies to them: they are not secrets, but
      naming infrastructure in a public repo is worth avoiding, and a key in
      git history cannot be un-published. Read them from the RevenueCat
      dashboard (Project settings → API keys), or from the gitignored root
      `.env`, into `REVENUECAT_IOS_KEY` / `REVENUECAT_ANDROID_KEY` /
      `REVENUECAT_TEST_KEY`.
- [ ] Webhook integration — **deliberately deferred** until the route exists in
      Stage 2, so RevenueCat is not retrying against a 404

**Blocked on the founder** (cannot be done from the agent side):
- [ ] Play Console subscriptions: `oc_maester:monthly`,
      `oc_grand_maester:monthly`, `oc_archmaester:monthly`
- [ ] App Store Connect: `oc_maester_monthly`, `oc_grand_maester_monthly`,
      `oc_archmaester_monthly` (Apple requires the first IAP to ship with an
      app version)
- [ ] Store credentials pasted into the RevenueCat dashboard

### Stage 1 — Shared vocabulary
- [x] `packages/samwell-shared/src/billing.ts` — plans, credit arithmetic,
      forecast workload, rollover
- [x] `models.ts`: `minPlan` + the three price fields, nine seeded models,
      `modelsForPlan`. Removed the dead `isCloudModelId` / `getCloudModel` /
      `getFallbackModelIds` exports (nothing used them, and the last one
      returned every model regardless of plan)
- [x] `packages/samwell-shared/src/__tests__/billing.test.ts` — 28 tests
      (was 23; the forecast estimate and within-band multipliers added five)
- [ ] `limits.ts` deleted — **held to the end on purpose.** Deleting it now
      breaks `db.ts`, `settings.ts` and `cloud-panel.tsx` before their
      replacements exist; it goes when the last consumer is migrated (the app
      side, Stage 4)

### Stage 2 — Server: pricing, plans, ledger
- [x] Forecast seeded into `server_settings` (`seedForecastDefaults` in
      `db.ts`, from `FORECAST_WORKLOAD`; `getForecastWorkload` reads it back
      with the seed as fallback). **The weekly recalibration job is NOT
      built** - it groups usage into turns by thread, and `usage_events` does
      not carry a thread id until the metering rewrite writes one; the seed
      is the measured p75 and the job should land with the app-side work.
- [ ] Anthropic cache check (one live turn each on Sonnet 5 / Opus 5)
- [x] `model-context.ts` pulls pricing from OpenRouter (`refreshModelContextWindows`
      is now `refreshModelMetadata`, one pass for window and prices)
- [x] `db.ts` catalogue columns: `min_plan`, the three prices,
      `pricing_fetched_at_ms`; `setCloudModelContextTokens` is now
      `setCloudModelFacts`
- [x] `/admin/models` takes a required `minPlan`; PATCH keeps the existing tier
      unless the body names a new one
- [x] `db.ts`: `account_credits`, `credit_ledger`, `insider_invites` (in
      `ensureBillingSchema`, exported so the tests build the identical shape;
      also does the `device_id` → `account_id` rename and the four
      `usage_events` credit columns)
- [x] `server/src/billing.ts` — `readEntitlement`, `grantMonthly`,
      `clearPlan`, `peekCredits`, `reserveCredits`, `settleCredits`,
      `releaseReservation`, `sweepStaleReservations`, `reconcileBalance`,
      `issueInsiderInvite`, `redeemInsiderInvite`, `sweepInsiderRegrants`,
      `readLedger`. 42 tests in `__tests__/billing.test.ts`, including the
      concurrency case the plan demanded: ten concurrent 300-credit holds
      against a balance of 1,000, exactly three succeed (probed first: a
      read-then-write implementation allowed ten of ten and drove the balance
      to -2,000)
- [x] `server/src/billing-webhook.ts` — `routeRevenueCatEvent` (testable
      dispatcher) + `createBillingWebhookRoutes` (constant-time
      `Authorization` compare, 200 on everything authenticated, 500 if
      `REVENUECAT_WEBHOOK_SECRET` is unset)
- [x] `server/src/billing-routes.ts` — `GET /billing/me` (balance + the
      plan's models with `forecastCredits`/`multiplier`, computed
      server-side), `GET /billing/ledger?limit=`,
      `POST /billing/insider/redeem`, `POST /admin/insider/invites`
      (mounted at `/admin/insider`, behind `requireAdminKey`, which moved to
      `http-helpers.ts` so both files share it)

### Stage 3 — Guards first, then metering
- [x] Guard 1 — tool-loop ceiling. `server/src/tool-loop.ts` (pure, 10 tests),
      enforced in `/chat/http` before anything is reserved or sent, returning
      `429 tool_loop_exhausted`. Mirrored in `cloud-chat.ts`'s settle loop so
      the app ends the turn on whatever Samwell has already said instead of on
      a refusal. `TOOL_LOOP_CEILING` lives in `samwell-shared/src/limits.ts`
      because both halves enforce it.
- [x] Guard 2 — investigated, and **left off on purpose** with the reasoning
      written onto the line (`server/src/index.ts`). Approvals turned out NOT
      to be the blocker: `cloud-chat.ts` drains its approvals queue serially,
      so the single pending slot per session in `stores/approval.ts` is never
      contended. The open risk is that client tools mutate the device database
      through `chat-tools.ts` with nothing written to be safe against a sibling
      call interleaving. **This is a live decision for the founder** — it would
      make turns markedly cheaper and change how Samwell behaves, so it wants
      its own change and its own testing.
- [x] Guard 3 — `ABSOLUTE_COMPACTION_CEILING = 60_000` in `server/src/index.ts`.
      The old `contextTokens * 0.66` alone allowed 660k on a 1M-window model.
- [x] Guard 4 — `server/src/credit-turn.ts` (pure, 9 tests), the sibling of
      `tool-loop.ts` with the same injectable-store shape. A turn may spend
      half of what is available right now (`TURN_CREDIT_SHARE = 0.5`, measured
      against a FRESH read, not the cached one); the settle that crosses
      carries the note in its `AI_USAGE` description, and every further
      request in that turn is refused with `429 credit_turn_ceiling`. Swept on
      the same timer as the loop store.
- [x] `agentLoopStrategy` — investigated and deliberately NOT set; the
      framework already defaults to `maxIterations(5)`. See the review pass.
- [x] Credit metering in `/chat/http`. The order is: Guard 1, onboarding
      claim, entitlement gate (`402 no_subscription`), plan-scoped model
      resolution, event row, then (for non-house turns) the estimate,
      Guard 4, the atomic credit reservation. `meterStream` settles on
      `RUN_FINISHED` (tokens × snapshot prices through the forecast's cached
      share), releases on `RUN_ERROR`/abort/close - a failed turn costs
      nothing - and emits the `samwell-credits` CUSTOM chunk before the
      terminal event. Fallbacks are built from the plan's models ONLY, so a
      Maester turn cannot be rerouted to an Archmaester model. House turns
      (onboarding, compaction) record usage and touch no balance.
      **`/usage` still answers** for old clients; it dies with Stage 4.

### Stages 4-8 — App
- [x] Stage 4 — `react-native-purchases@10.9.0`, `constants/revenuecat.ts`,
      `services/purchases.ts` (the only file that touches the SDK),
      `stores/subscription.ts`. Identity bridge in `stores/account.ts`:
      RevenueCat's `app_user_id` IS the Logto subject, configured WITH the
      account rather than anonymously so no throwaway customer can take a
      purchase before an alias catches up.
- [x] Stage 5b — the two vendored carousel fixes, both commented `LOCAL EDIT`:
      velocity handoff into the settle spring (it was starting from a
      standstill, so a flick and a nudge landed identically), and `progress` /
      `engaged` exposed on `useCarouselState` so a feature can give its slides
      depth without forking the component.
- [x] Stage 5 — `plan-carousel.tsx`, `plan-slide.tsx`, `plan-card.tsx`.
      `variant="default"`, gold tracks the centred card only, `haptics.select`
      on the snap and `haptics.commit` on CHOOSE, RESTORE PURCHASES beneath.
      `packageId` now lives on `CreditPlan` beside `entitlement`, because
      `$rc_monthly_maester` is a suffix of `$rc_monthly_grand_maester` and
      anything pattern-based hands the dearer plan's card to the cheaper one.
- [x] Stage 6 — `credit-meter.tsx` replaces both `UsageBar`s;
      `cloud-model-sheet.tsx` lifted out of the panel and given the multiplier
      and the per-message estimate; `cloud-panel.tsx` is now a four-way branch
      and nothing else.
- [x] Stage 8 — `CloudBlocker` gains `checkingPlan` and `needsPlan`, ordered
      after the account and before the mode. The type checker then named every
      surface that had to answer for them, which is the whole point of the one
      hook. `asCloudRefusal` in `cloud-chat.ts` reads the status back out of
      the transport's message once, replacing `stores/chat`'s hand-rolled
      `message.includes('429')`.
- [x] The old meter is gone end to end: `CLOUD_LIMITS`, `CloudUsageState`,
      `getUsageState`, the `/usage` route, `settings.cloudUsage*` and
      `loadCloudUsage`. The post-turn refresh now reads the balance.
- [ ] Stage 7 — insiders redeem UI (server side is done; no UI yet, by design)

### Test Store — ready to build against
- [x] Prices set on all three Test Store products (USD and ZAR), so the cards
      show the store's own localised string rather than the fallback
- [x] `REVENUECAT_TEST_KEY` added to the gitignored root `.env`, read from the
      dashboard rather than recorded here
- No `store` field is needed in `Purchases.configure`: the Test Store is
  selected by the `test_` key prefix, and `ConfigurationsByStore` only knows
  `PLAY_STORE` with `store` optional.

---

## History

What follows is a record of what was found and decided, not work
outstanding. Read it before changing any of the code it names.

### Final audit — expo-react-native-performance and expo-animation

Run once the skills were installed. **One regression I had introduced, caught
and fixed:**

- **Model self-healing was lost.** The old panel called
  `settings.loadCloudModels`, which quietly healed a stored `cloudModelId`
  that no longer existed. My rewrite stopped calling it, so a reader whose
  saved model was not in their plan would have seen "Choose a model" forever.
  Worse, healing there read `/models` - the whole catalogue, with no idea of
  plans - so it could have settled on a model they had not paid for. The rule
  moved to `subscription.refresh`, where the plan-scoped list and
  `defaultModelId` already are, and `loadCloudModels` / `cloudModels` are gone
  with it.

Findings fixed:

- **No timeout on either billing request** (`mem-abort-fetch`). A hung read
  left `loading` true for the life of the process - the meter spins forever
  and REFRESH is unreachable, because the spinner stands where it used to be -
  and inside the purchase confirmation loop one hang stalls every attempt
  after it, telling somebody who just paid that nothing happened. Now
  `AbortController` + timer at 15s, matching `services/chat-title` and its
  siblings (Hermes has no `AbortSignal.timeout`).
- **A fixed 196pt card height against scalable text** (expo-animation:
  "any height you measured at default type size is wrong at 200%"). A carousel
  needs a fixed height, so it now scales with the live `fontScale` from
  `useWindowDimensions`, capped at 2x, and the card's own lines carry
  `numberOfLines`. Before this, large-text users lost the bottom line of every
  plan card.
- **Inline style objects rebuilt every render** (`mem-avoid-inline-objects`),
  hoisted across the card, meter and run.

Checked and deliberately left alone:

- **Eagerly importing `react-native-purchases` at startup.** Measured first:
  24 JS modules, ~480KB of source. Nothing like the 1,749-module lucide
  problem CLAUDE.md's rule was written about, and deferring it would risk the
  configure-with-the-account timing that stops RevenueCat minting a throwaway
  customer a purchase could land on.
- **`.value` rather than `.get()`/`.set()`** in `plan-slide`. The skill prefers
  the compiler-safe accessors, but every shared value in this codebase uses
  `.value`; one file disagreeing is worse than the whole codebase being
  consistently one version behind. Worth a sweep of its own some day.
- **`runOnJS` in the vendored carousel**, deprecated in Reanimated 4 in favour
  of `scheduleOnRN`. Same reason: it is upstream's code, used throughout that
  file, and changing one call site before a build buys nothing.
- **Haptic timing.** `haptics.select` is `Haptics.selectionAsync`, which is
  exactly what the skill prescribes for a value ticking past a step, and it
  fires from `onIndexChange` at the moment the decision commits rather than
  when the spring finishes.

### Audit pass — apple-design (UI) and business logic

**Design.** Verified against the `apple-design` skill. The carousel already
satisfies most of it (1:1 tracking, presentation-value interrupts,
rubber-banding, 10px hysteresis, reduced motion), and the Stage 5b velocity
handoff closed the one real gap. Confirmed `onIndexChange` fires only on a
real change, so the snap haptic cannot fire on mount - feedback with no cause.

Three findings, all fixed:

1. **The CHOOSE button was remounting on every snap.** Each card carried its
   own, swapping between `GoldButton` and `ActionButton` as the run moved.
   Those are different components, so a snap unmounted one and mounted the
   other and the button visibly popped. Worse, gold only caught up on release,
   so the card growing toward the middle was not yet the highlighted one -
   the in-between frames were saying the opposite of where the gesture was
   going. And three buttons all reading "CHOOSE" is three identical
   announcements to a screen reader. The run now selects, one `GoldButton`
   below commits and names the plan, and gold lives in exactly one place and
   never moves - which is what the house rule wanted anyway. `CARD_HEIGHT`
   came down to 196 to match.
2. **`modelCounts` hardcoded three per tier** in the app. True today, a lie
   the first time `/admin/models` adds one. `/billing/me` now returns
   `modelsByPlan`, computed from the catalogue the same way `/health` does.
3. **The app made an HTTP round trip after every message to fetch a number
   the server had already sent it.** The metered route yields a
   `samwell-credits` chunk before it finishes; `cloud-chat` now reads it and
   `applyCreditsFromTurn` patches the balance locally. One authenticated
   request saved per turn.

**Business logic.** `vercel-react-native-skills` is NOT installed on this
machine (nor `expo-react-native-performance` / `animate-expo`, both named in
CLAUDE.md), so this was audited against CLAUDE.md's own encoded rules and the
code itself. Checked and sound:

- Every store read in the new code is a narrow selector; `stores/chat` uses
  `getState()` rather than subscribing.
- One animated node per slide, transform and opacity only, off the shared
  value the run already drives.
- `readEntitlement`'s cache never stores "no plan", so the post-purchase poll
  is not defeated by it - which was the first thing worth checking, since a
  60s cache over a 7s poll would have stranded every new subscriber on
  "payment went through, credits shortly".
- All four background sweeps are scheduled and `.unref()`ed.

One conditional risk, not a bug today: the metered path makes roughly eight
database round trips per turn. On the local sqlite file the Dockerfile
configures that is free. If `DATABASE_URL` ever moves to a remote Turso, it
becomes ~400-800ms of added latency per message and wants batching first.

### Second review pass — the server-side billing work

Verified the credit ledger, webhook, routes and metering. `tsc` clean,
`eslint` clean, tests green. The concurrency design is sound and was probed
rather than assumed: libsql throws SQLITE_BUSY on concurrent explicit
transactions, so every decision is one atomic statement, and the
`usage_events.status` single-winner gate correctly makes a retried settle, a
release racing the sweep, and a late crash arrival unable to move money twice.
The webhook auth is right too (HMAC both sides before `timingSafeEqual`, which
avoids both the length oracle and the throw).

**One real bug, and it was costing readers money.**

The settle assumed a fixed 82.8% cache ratio for every turn, on the stated
grounds that `@tanstack/ai-openrouter` "forwards only prompt / completion /
total". That is not true. `buildOpenRouterUsage` copies `promptTokensDetails`
through verbatim, and OpenRouter's `ChatUsagePromptTokensDetails` carries
`cachedTokens` — so the real split does arrive on `RUN_FINISHED`.

It matters because the assumption was pessimistic and the direction is not
symmetric. Real traffic caches ~95% of the median call, and a cached token is
a tenth the price of a fresh one. Assuming 82.8% bills the reader for ~12% of
their prompt at ten times its true cost: roughly a **20% systematic overcharge
on every cached turn**, against a system whose whole promise is "actual token
usage x actual pricing".

Fixed:
- `extractUsage` reads `usage.promptTokensDetails.cachedTokens`.
- `resolveCachedTokens` in `samwell-shared/src/billing.ts` — pure, six tests.
  Prefers the reported number, falls back to the share only when nothing was
  reported, treats a reported `0` as a report (not a missing value, which
  would undercharge an uncached provider), and clamps to the prompt.
- `usage_events.cached_prompt_tokens` records it, which is also the column the
  weekly forecast recalibration needs to stop guessing.
- The `CACHED_SHARE` docblock now says what is actually true: it is the
  ESTIMATE's ratio, where erring low is safe, and only the settle's fallback.

**Not bugs, checked and left alone:** `costToCredits` floors at 1, so a
reservation can never be zero; settle debiting below zero is correct (the
actual is authoritative) and bounded by Guard 4; `refuseEvent` marks the event
errored so no phantom hold is left for the sweep.

### Review pass — five bugs found and fixed

Found by reviewing the checkpoint before continuing. Recorded because two of
them defeated the guard entirely and would not have shown up until an invoice.

1. **The loop ceiling did nothing on slow models.** `admitRequest` measured
   staleness from when a turn STARTED, so any turn slower than the two-minute
   window reset its own count while still running. A test firing 40
   continuations ten seconds apart allowed all 40. Now measured from
   `lastSeenMs` (idle, not old), so it allows exactly 12. This was worst
   precisely where it matters most: slow means frontier means expensive.
2. **The client counted tool calls two or three times over.** `readToolName`
   answers for three different chunks of the SAME call (`TOOL_CALL_START`,
   `tool-input-available`, `approval-requested`), so an ordinary turn would
   have been cut off at around four. Now counts `RUN_FINISHED` carrying
   `tool_calls`, which is exactly one round trip and the same unit the server
   counts.
3. **A refused request still spent an onboarding turn.** The loop check ran
   after `claimHouseOnboardingTurn`, so the house paid for requests it was
   about to refuse. The check now runs first, which is what its comment
   already claimed.
4. **The metadata refresh blanked known prices and windows.** A partial
   OpenRouter payload wrote nulls straight through, which takes a model out of
   service (a null price cannot be charged) or drops its window to the 32k
   floor. `mergeModelFacts` now never trades a value we have for one we do
   not, which is what the module's own docblock always promised. Four tests.
5. **`agentLoopStrategy` was a no-op dressed as a safeguard, and removed.**
   `@tanstack/ai` already defaults to `maxIterations(5)`, so there was no hole
   to close; `shouldContinue` is in a do/while so it cannot block a first
   iteration either. The `messages.length < 200` clause I had paired with it
   was a latent trap - a long thread silently losing a server-side
   continuation. The reasoning is now a comment where the code was.

Also added: `/health` reports `modelsByPlan` and `modelsMissingPrices`.
**This matters for deployment.** `min_plan` defaults to the dearest tier, so
the live catalogue (three models from before plans existed) leaves Maester and
Grand Maester with nothing to talk to. That is a silent failure - a paying
reader opens an empty picker and no log says why - so one curl now says whether
the catalogue has been set up for plans.

**Required migration step before billing goes live:** add the nine models via
`POST /admin/models` with their `minPlan`, or clear `cloud_models` and let
`initDb` reseed from the catalogue.

Incidental fixes made along the way, both worth keeping:
- `vitest.config.ts` added. Vitest was discovering `server/dist/**` alongside
  the TypeScript it was built from, so every server test ran twice and the
  stale compiled copy could fail on a change the source had already absorbed.
- `resolveModelId`'s test named the default model id as a literal, which is how
  it started disagreeing with the catalogue. It reads `DEFAULT_CLOUD_MODEL_ID`
  now.

---

## Context

Samwell Cloud is metered today by **message count**: `CLOUD_LIMITS` in
`packages/samwell-shared/src/limits.ts` gives every signed-in account 60
messages per 5 hours and 300 per week, enforced by `reserveUsageEvent` in
`server/src/db.ts`. That meter has three problems. It is free — nobody pays for
any of it. It is dishonest — one message on a flash model and one on Opus cost
the house 100× different amounts and are counted the same. And it is uniform —
there is no way to sell more.

This replaces it with a credit system. A subscription buys a monthly grant of
**AI Credits**; a turn spends credits proportional to its **real token cost at
the model's real price**. Three plans, each adding three models to what the
reader can reach. `server/src/db.ts:340` already anticipates this in a comment
on `getUsageState` — *"The credit redesign that follows this is where the name
gets put right."* This is that redesign.

The prize is that Open Citadel stops paying for its own inference.

---

## Decisions locked

| | |
|---|---|
| Plans | **Maester** $6 · **Grand Maester** $20 · **Archmaester** $50, monthly |
| Grants | 2,500 · 10,000 · 30,000 credits |
| AI budget | $2 · $8 · $24 |
| Credit value | `$0.0008` everywhere — one credit means one thing on every plan |
| Model access | Cumulative. Archmaester sees all nine, Maester sees three |
| Renewal | Roll over, capped at half a grant (1,250 / 5,000 / 15,000) |
| Old caps | `CLOUD_LIMITS` deleted. Credits are the only thing that can refuse a turn |
| Purchase | `Purchases.purchasePackage()` → the native store sheet. No RevenueCat paywall UI |
| Insiders | Founder-issued redeem code granting Maester for a set term, up to a year |

**One call I made for you.** You did not pick a multiplier baseline. The `×`
badge is computed **within the plan band a model belongs to**, not against the
globally cheapest model — otherwise Archmaester's picker reads `1×` beside a
flash model and `125×` beside Opus, which is a warning label, not a nudge. The
absolute `≈ N credits a message` sits beside every `×` and carries the truth.
It is one function (`forecastMultiplier`) and is trivial to switch later.

---

## The economics, from your real OpenRouter traffic

Measured from `openrouter_activity_2026-09-08.csv` — 739 calls, 734 usable,
`app_name` Open Citadel. Dev traffic, but it is Samwell's actual prompts,
actual tools and actual tool loop, which is exactly what was needed.

**One user message is not one API call.** Grouping calls into turns by their
finish reason (`tool_calls` continues a turn, anything else ends it):
**201 user turns from 734 calls** — a mean of 3.7 calls per turn, median 1.
Any per-message estimate that ignores the tool loop is wrong by ~4×.

**Caching is already on and working.** Every row carries `tokens_cached` and a
negative `cost_cache`; the median call is **95.2% cached**. That question is
settled, and OpenRouter has already discounted $6.31 against $1.76 of spend.

| per user turn | p25 | **median** | p75 | p90 | mean |
|---|---|---|---|---|---|
| prompt tokens | 2,034 | **5,491** | 12,817 | 210,124 | 303,016 |
| of which cached | 0 | 0 | 10,611 | 198,720 | 261,386 |
| completion tokens | 93 | **192** | 458 | 1,655 | 2,161 |
| calls | 1 | **1** | 2 | 4 | 4 |

The typical turn is far cheaper than I modelled. The mean is not — and the gap
between them is the whole story.

### The typical turn, priced

Using the **p75** profile (12,817 in / 10,611 cached / 458 out) — slightly
conservative, so the number shown to a reader under-promises:

```
MAESTER          $6   →  2,500 credits   ($2 budget)
  qwen/qwen3.7-flash          0.030 / 0.130    <1 cr   1.0×
  z-ai/glm-5.3-flash          0.075 / 0.250     1 cr   1.9×
  deepseek/deepseek-v4-flash  0.084 / 0.168     1 cr   2.0×
                                            ~2,500 turns/month

GRAND MAESTER    $20  → 10,000 credits   ($8 budget)
  google/gemini-2.5-pro       1.250 / 10.000   11 cr   1.0×
  anthropic/claude-sonnet-5   2.000 / 10.000   14 cr   1.3×
  x-ai/grok-4.6               2.000 /  6.000   16 cr   1.4×
                                              ~715 turns/month  (~23/day)

ARCHMAESTER      $50  → 30,000 credits   ($24 budget)
  openai/gpt-5.6-sol-pro      2.000 / 10.000   14 cr   1.0×
  google/gemini-3.1-pro       2.000 / 12.000   15 cr   1.1×
  anthropic/claude-opus-5     5.000 / 25.000   35 cr   2.5×
                                              ~857 turns/month  (~28/day)
```

**Twenty-odd real conversations a day on Sonnet 5, or Opus daily for a month.**
The grants are generous, not tight. My earlier estimate of six a day was wrong
because I modelled the fixed floor and not the caching that removes most of it.

### The tail is the real risk, and it is not a pricing problem

> **23 turns — 11% of them — are 91% of everything you spent.**
> The worst single turn made **112 API calls** and accumulated **14.6 million**
> prompt tokens. One user message. $0.38 on a flash model; on Opus 5 that same
> turn is **over 600 credits**, a fiftieth of a month's grant.

That is a runaway tool loop, not a heavy reader, and billing turns it from an
invisible cost into a reader's balance vanishing in one message.

**Where the loop actually is.** Samwell's tools are *client* tools:
`SAMWELL_CLIENT_TOOL_DEFINITIONS` are passed as definitions, so the server's
`chat()` pauses and the run ends at every tool call, and the continuation is a
fresh `POST /chat/http` driven by `ChatClient` inside `cloud-chat.ts`. The turn
is therefore bounded by **wall clock and nothing else** —
`SETTLE_ABSOLUTE_MS = 600_000` and `SETTLE_INACTIVITY_MS = 120_000` at
`src/services/cloud-chat.ts:853`. Ten minutes at flash speed is 112 round trips.

> **`agentLoopStrategy: maxIterations(n)` is not the fix, though it looks like
> it.** `@tanstack/ai` does export it, and Open Citadel does not use it. But it
> bounds iterations *inside one server-side loop*, and with client tools every
> POST is already a single iteration. It would cap something that is always 1.
> Worth setting anyway as defence for any server tool added later — not as the
> answer to this.

The guards are Stage 3, and they come before the credit work.

### How the forecast stays honest

`forecast_input_tokens`, `forecast_cached_tokens` and `forecast_output_tokens`
live in `server_settings`, seeded from the p75 column above. A weekly job
recomputes them from real completed `usage_events` — **grouped into turns the
same way, so the tool loop is counted** — and logs when the change would move a
plan's turn count by more than 15%. Grants are one config row each, so
correcting them is a write, not a deploy, exactly as the model catalog works.

One honest caveat: the observed 5,491-token median is *below* the ~15,000-token
floor I measured from `SAMWELL_SYSTEM_PROMPT` plus the 33 serialized tool
schemas. Either your dev traffic skewed to onboarding and Compass, which carry
smaller tool sets, or `@tanstack/ai-openrouter` sends a leaner schema than the
source JSON. It does not change any decision here — the p75 seed comes from
observed traffic, not from my estimate — but the recalibration job will settle
which it was.

---

## Stage 0 — RevenueCat dashboard (MCP writes)

Project `proj612b72d1` is empty but for a `Test Store` app. Both store apps are
live without billing, so this stage has a part I can do and a part only you can.

**I do, via MCP:**
1. `create-app` × 2 — Play Store (`com.dr33m.opencitadel`), App Store
   (`com.dr33m.opencitadel`). Neither call needs credentials.
2. `create-entitlement` × 3 — `maester`, `grand_maester`, `archmaester`.
3. `create-offering` `default` → `create-packages` × 3 with lookup keys
   `$rc_monthly_maester` / `$rc_monthly_grand` / `$rc_monthly_arch`.
4. `create-product` × 3 against the **Test Store** app (`subscription`,
   `duration: P1M`) and attach them to the entitlements and packages. This makes
   the whole purchase flow work in a dev build today, with no store console.
5. `create-webhook-integration` → `https://<cloud>/billing/revenuecat/webhook`
   with an `authorization_header` shared secret.
6. `list-app-public-api-keys` for each app → the SDK keys for `app.config.js`.

**You do, in the store consoles** (I cannot create store products; RevenueCat
only registers them):
- Play Console: three subscriptions with base plans —
  `oc_maester:monthly`, `oc_grand_maester:monthly`, `oc_archmaester:monthly`.
- App Store Connect: three auto-renewable subscriptions in one group —
  `oc_maester_monthly`, `oc_grand_maester_monthly`, `oc_archmaester_monthly`.
  Apple requires the **first** IAP to be submitted with an app version.
- Paste the Play service-account JSON and the App Store Connect + In-App
  Purchase keys into the RevenueCat dashboard. Do not paste them into this chat.

Then I run `create-product` × 6 more and attach them to the same three
entitlements and packages. One package, three store products, one entitlement.

---

## Stage 1 — Shared vocabulary

**`packages/samwell-shared/src/billing.ts`** (new) — the plan table and the
credit arithmetic, so the server and the app can never disagree about what a
credit is.

```ts
export type PlanId = 'maester' | 'grand_maester' | 'archmaester';
export const PLAN_ORDER: PlanId[] = ['maester','grand_maester','archmaester'];

export interface CreditPlan {
  id: PlanId;
  label: string;            // "Grand Maester Samwell"
  entitlement: string;      // RevenueCat lookup_key
  priceUsd: number;
  monthlyCredits: number;
  aiBudgetUsd: number;
  rolloverCap: number;
}
export const CREDIT_PLANS: Record<PlanId, CreditPlan>;

/** ai_budget_usd / monthly_credits. Never write 0.0008 anywhere else. */
export function creditValueUsd(plan: CreditPlan): number;

export const FORECAST_INPUT_TOKENS: number;   // set from measurement, Stage 2
export const FORECAST_OUTPUT_TOKENS: number;

export function modelCostUsd(m: ModelPricing, inTok: number, outTok: number): number;
export function costToCredits(usd: number, creditValueUsd: number): number; // Math.ceil
export function forecastCostUsd(m: ModelPricing): number;
export function planRank(p: PlanId): number;
export function planIncludes(held: PlanId, needed: PlanId): boolean;

export interface CreditBalance {
  plan: PlanId | null;
  balance: number;
  reserved: number;
  available: number;        // balance - reserved
  grant: number;
  periodEndsAt: string | null;
  source: 'subscription' | 'insider' | null;
}
```

**`packages/samwell-shared/src/models.ts`** — extend `CloudModelOption` with
`minPlan: PlanId`, `inputPricePerMillion`, `outputPricePerMillion`, and the
derived `forecastCredits` / `multiplier` the server computes per reader.

**`packages/samwell-shared/src/limits.ts`** — **deleted.** `CLOUD_LIMITS`,
`CloudUsageWindow`, `CloudUsageState` all go. Drop the re-export from
`index.ts`. This is the DRY rule from CLAUDE.md: leaving the old meter behind
is the whole problem.

---

## Stage 2 — Server: pricing, plans, the ledger

**First: seed the forecast** from the p75 column of the activity export into
`server_settings`, and ship the weekly recalibration job with it so the seed
starts correcting itself as soon as there is real traffic. Caching needs no
investigation — the export proves it is already running at a 95% hit rate.

Confirm one thing only: that Anthropic models cache too. Every cached row in
the export is OpenAI, Google or Z.ai, and Anthropic needs explicit
`cache_control` breakpoints that `@tanstack/ai-openrouter` may not forward.
Sonnet 5 and Opus 5 are two of the six paid-tier models, so send one real turn
to each and read `tokens_cached` back. If they do not cache, they cost roughly
3× the table and belong lower in their bands.

**`server/src/model-context.ts`** — `toCloudModelOption` already derives every
field from OpenRouter's payload. Add pricing the same way: OpenRouter publishes
`pricing.prompt` / `pricing.completion` as `$/token` strings, so
`inputPricePerMillion = Number(pricing.prompt) * 1e6`. `refreshModelContextWindows`
becomes `refreshModelMetadata` and writes pricing on the same 12-hour timer.
Prices are never in application code — that is spec §18, and this module is
already the one place that answers "what is true about this model".

**`server/src/db.ts`** — extend `cloud_models` with `min_plan`,
`input_price_per_million`, `output_price_per_million`, `pricing_fetched_at_ms`,
using the existing `PRAGMA table_info` + `ALTER TABLE ADD` self-heal pattern
already in `initDb`. Three new tables:

```sql
CREATE TABLE account_credits (          -- the cached balance; hot path
  account_id      TEXT PRIMARY KEY,
  plan            TEXT,
  source          TEXT,                 -- 'subscription' | 'insider'
  balance         INTEGER NOT NULL DEFAULT 0,
  reserved        INTEGER NOT NULL DEFAULT 0,
  period_start_ms INTEGER,
  period_end_ms   INTEGER,
  updated_at_ms   INTEGER NOT NULL
);

CREATE TABLE credit_ledger (            -- authoritative; balance rebuilds from here
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  type           TEXT NOT NULL,         -- MONTHLY_GRANT | AI_USAGE | REFUND
                                        -- | ADMIN_ADJUSTMENT | EXPIRATION
  credits        INTEGER NOT NULL,      -- signed
  balance_after  INTEGER NOT NULL,
  model_id       TEXT,
  request_id     TEXT,
  description    TEXT,
  created_at_ms  INTEGER NOT NULL
);
CREATE INDEX credit_ledger_account_time_idx ON credit_ledger (account_id, created_at_ms);

CREATE TABLE insider_invites (
  code            TEXT PRIMARY KEY,
  plan            TEXT NOT NULL,
  duration_days   INTEGER NOT NULL,
  note            TEXT,
  created_at_ms   INTEGER NOT NULL,
  redeemed_by     TEXT,
  redeemed_at_ms  INTEGER,
  expires_at_ms   INTEGER
);
```

`usage_events` gains `credits_reserved`, `credits_charged`,
`input_price_snapshot`, `output_price_snapshot`. Spec §18: a historical row
stays accurate after a price change because the price it was charged at is
written into it. Rename `device_id` → `account_id` here — the comment at
`getUsageState` asked for exactly this, and this is the change that earns it.

**`server/src/billing.ts`** (new) — entitlement truth and the ledger.

- `readEntitlement(accountId)` — the plan an account holds. Reads
  `account_credits`; when the row is missing or stale, falls back to a
  RevenueCat REST `GET /v1/subscribers/{sub}` reconcile. Cached.
- `grantMonthly(accountId, plan, periodEnd)` — capped rollover, one
  `MONTHLY_GRANT` row, updates the cached balance. Idempotent on
  `(account, period_start)` so a redelivered webhook cannot double-grant.
- `reserveCredits(accountId, credits)` — **atomic**, the same trick
  `reserveUsageEvent` already uses to close its TOCTOU window:
  ```sql
  UPDATE account_credits SET reserved = reserved + ?
   WHERE account_id = ? AND balance - reserved >= ?
  ```
  `rowsAffected === 0` is "not enough credits". Two concurrent turns cannot both
  see the same balance (spec §14).
- `settleCredits(accountId, reserved, actual, …)` — releases the reservation,
  debits the actual, writes one `AI_USAGE` row. The actual is authoritative;
  the estimate is never charged (spec §13).
- `releaseReservation(...)` — for an errored or abandoned run.
- `sweepStaleReservations()` — a timer releasing reservations on `usage_events`
  still `'started'` after 15 minutes, for the crash case `meterStream`'s
  `finally` cannot cover.
- `reconcileBalance(accountId)` — rebuild `account_credits.balance` from the
  ledger. The ledger is the source of truth; the cache is a cache.

**`server/src/billing-webhook.ts`** (new) — `POST /billing/revenuecat/webhook`,
constant-time compare on the `Authorization` header.

| Event | Action |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION` | set plan, `grantMonthly` |
| `TEMPORARY_ENTITLEMENT_GRANT` | set plan for the grace window |
| `EXPIRATION`, `BILLING_ISSUE` | clear the plan; the balance stays for the record |
| `TRANSFER` | move the balance to the new `app_user_id` |

`app_user_id` is the Logto `sub`, because the app calls `Purchases.logIn(sub)`.
Always answer 200 on a duplicate — RevenueCat retries.

**`server/src/index.ts`** — new routes:
- `GET /billing/me` → `CreditBalance` + the plan's models
- `GET /billing/ledger?limit=` → recent rows, for a history sheet later
- `POST /billing/insider/redeem` `{ code }`
- `POST /admin/insider/invites` `{ plan, durationDays, note }` → a code
- `PATCH /admin/models/:id` gains `minPlan`

`GET /usage` is **replaced** by `GET /billing/me`. `getUsageState`,
`CLOUD_LIMITS` and the window arithmetic are deleted, not left beside it.

---

## Stage 3 — Server: the three guards, then metering in credits

**The guards land first, and they are the highest-value work in this plan.**
11% of turns were 91% of spend; without these, one runaway turn empties a
month's grant and the reader watches it happen.

**Guard 1 — a tool-loop ceiling per user turn.** Only wall clock bounds it
today. Count continuations per `(accountId, threadId)` in a short window and
refuse past `TOOL_LOOP_CEILING = 12` with a terminal `RUN_ERROR` the transcript
can show. Enforced **server-side**, so a stale `cloud-chat.ts` cannot opt out,
and mirrored in the settle loop at `cloud-chat.ts:1017` so the app stops
cleanly and says why rather than being refused mid-conversation. It sits beside
`src/services/tool-limits.ts`, which already owns the sibling decision — how
much *one* result may return (`TOOL_RESULT_TOKEN_BUDGET.cloud = 8_000`) — and
has the docblock explaining why that decision lives in data. Same treatment.

Twelve is generous. 112 is a bug wearing a conversation's clothes, and no
reader wanted the 112th call.

**Guard 2 — reconsider `parallelToolCalls: false`.** At
`server/src/index.ts:587`, inside a `modelOptions` block where every other line
carries a paragraph of reasoning, this one has **no comment at all**. In this
codebase that is a tell.

It forces the model to fetch one thing per round trip. A turn needing five
pieces of the library costs five continuations, and each one re-sends the whole
conversation *plus every tool result so far* — which is precisely how a turn
reaches 14.6M cumulative prompt tokens. Parallel calls collapse those five into
one continuation and one re-send. TanStack AI supports it, and the framework
docs name it as the efficiency path.

Check it against `useApprovalStore.requestApproval`, which drains approvals
serially at `cloud-chat.ts:1038` and may be the unstated reason it was turned
off. If approvals are the blocker, allow parallel calls for the read-only tools
and keep approval-gated ones serial. Structurally this is probably the largest
single win available, and it is one line plus a compatibility check.

**Guard 3 — an absolute compaction ceiling.** One line, in the
`compactionBudget` calculation at `server/src/index.ts:~518`:

```ts
const contextTokens = Math.min(...[primary, ...fallbackModels].map(resolveContextTokens));
const compactionBudget = Math.min(
  Math.floor(contextTokens * CONTEXT_BUDGET_RATIO),
  ABSOLUTE_COMPACTION_CEILING,   // 60_000
);
```

`CONTEXT_BUDGET_RATIO` alone was written when the catalog topped out at 200k. On
today's million-token models it permits a 660,000-token conversation to be
re-sent on every turn. The ratio still governs small-window models; the ceiling
governs the rest.

**Guard 4 — a per-turn credit ceiling**, the backstop the first three should
make unreachable. A single turn may not spend more than a set share of the
remaining balance without a note in the ledger saying it did.

**Also set `agentLoopStrategy`** on the server's `chat()` —
`combineStrategies([maxIterations(4), ({ messages }) => messages.length < 200])`.
It cannot bound a client-tool turn (see above), but it costs nothing and closes
the hole the day a server tool is added.

Then the metering itself, in `POST /chat/http` around lines 380–500.

1. `readIdentity` → `readEntitlement`. No plan and not onboarding →
   `402 { error: 'no_subscription' }`.
2. Resolve the model **within the plan** — `resolveModelId` gets the plan's
   visible list, so a stale client asking for an Archmaester model on a Maester
   plan lands on the plan's default instead of being served something it did
   not pay for.
3. Estimate the reservation. Reuse **`estimateMessageTokens`** from
   `server/src/compaction.ts:109` — it already exists and already accounts for
   this app's markers. Reserve `ceil(estimate × safety) ` credits.
   Insufficient → `402 { error: 'insufficient_credits', required, available }`.
4. Build the fallback chain from the plan's models only, capability-filtered as
   today. **This matters for correctness:** a Maester turn must not be rerouted
   to an Archmaester model, or the house pays the difference.
5. `meterStream` settles: on `RUN_FINISHED`, take `promptTokens` /
   `completionTokens` off the chunk, multiply by the **snapshot prices**, divide
   by `creditValueUsd`, `Math.ceil`, `settleCredits`. On `RUN_ERROR` or a
   dropped stream, `releaseReservation` — a failed turn costs nothing.
6. Emit a final `X-Samwell-Credits` trailer, or a synthetic chunk, so the app
   can show the new balance without a second round trip (spec §13.9).

> **`usage.cost` is always null today.** `extractUsage` at
> `server/src/index.ts:145` reads `usage?.cost`, but
> `@tanstack/ai-openrouter`'s `buildOpenRouterUsage` only forwards
> `promptTokens` / `completionTokens` / `totalTokens`. `cost_usd` has never been
> populated. Computing from tokens × snapshot price is therefore the only
> option, and it is also the one spec §6 asks for.

**What is charged and what is not** — keep the existing `counts_toward_limit`
judgement exactly, it is already right:

| kind | charged |
|---|---|
| `chat`, `compass_chat`, `chat_title`, `tag_suggest`, `goal_takeaway` | yes — the reader asked for it |
| `compaction_summary` | no — machinery they did not ask for |
| `onboarding_chat` on the house | no — an introduction is Open Citadel's cost |

The free onboarding conversation in `server/src/onboarding.ts` **must keep
working without a subscription.** It is how somebody meets Samwell before
deciding to pay for him.

---

## Stage 4 — App: SDK, identity, store

`pnpm add react-native-purchases` (v9, Expo config plugin included). CNG
workflow — `android/` and `ios/` are untracked — so this is a dependency plus a
native rebuild, no manual native edits. `app.config.js` gains
`extra.revenueCatIosKey` / `extra.revenueCatAndroidKey` from env, beside the
Logto pair and for the same stated reason.

**`src/constants/revenuecat.ts`** — keys and `PURCHASES_ENABLED`, mirroring
`src/constants/logto.ts`.

**`src/services/purchases.ts`** — the only file that talks to the SDK, mirroring
how `src/services/account.ts` is the only file that talks to Logto.
`configurePurchases()`, `identify(sub)`, `forget()`, `getOfferings()`,
`purchase(pkg)`, `restore()`, `PurchaseCancelled`.

**Identity bridge — the part that must not drift.** `src/stores/account.ts`
already owns sign-in and sign-out. It calls `identify(profile.sub)` on
`signIn` and `restore`, and `forget()` on `signOut`. RevenueCat's
`app_user_id` **is** the Logto `sub`, which is what makes the webhook's
`app_user_id` line up with the server's `account:<sub>` with no mapping table.

**`src/stores/subscription.ts`** (new) — the app-side truth:
`status: 'unknown' | 'none' | 'active'`, `plan`, `balance: CreditBalance | null`,
`offerings`, `busy`, `error`; `refresh()` (GET `/billing/me`), `purchase(planId)`,
`restore()`, `redeemInsider(code)`. Per-field selectors and a `useHasPlan()`
hook, matching `useSignedIn()`.

The **server** is authoritative on entitlement, not `CustomerInfo`. The client's
copy is for drawing. A purchase optimistically refreshes, then polls
`/billing/me` a few times — the webhook usually lands within a second, and the
REST reconcile in `readEntitlement` covers it when it does not.

**Remove from `src/stores/settings.ts`:** `cloudUsage`, `cloudUsageError`,
`cloudUsageLoading`, `loadCloudUsage`. Credits live in the new store. Update the
`void loadCloudUsage()` call after a turn in `src/stores/chat.ts:~539` to
`refreshBalance()`.

---

## Stage 5 — App: the plan carousel

Designed with the `apple-design` skill, read **through** the Citadel Frame
rather than over it. The two agree more than they disagree: DESIGN.md's motion
section already draws Apple's exact distinction — *"Gesture-tracked motion keeps
its physics; declarative motion keeps the house curve… if the user's thumb is
driving, the motion answers to the thumb."* Three places where apple-design
found a real gap are in **Stage 5b**.

**`src/features/billing/components/plan-carousel.tsx`** — replaces the model
card in `CloudPanel` when signed in with no plan.

```tsx
<Carousel
  variant="default"
  align="center"
  itemSize={CARD_W}          // < panel width, so the neighbours peek
  defaultIndex={1}
  onIndexChange={onSettle}   // haptics.select — see 5b(3)
>
  <Carousel.Content style={{ height: CARD_H }}>
    {plans.map((plan) => (
      <PlanSlide key={plan.id} index={i}>
        <PlanCard plan={plan} busy={busy === plan.id} onChoose={onChoose} />
      </PlanSlide>
    ))}
  </Carousel.Content>
  <Carousel.Dots className="mt-4 self-center" />
</Carousel>
```

`variant="default"` — the docs call it *"the honest choice for content that is
read rather than admired"*, and three prices are read. `interactive` and
`coverflow` rotate their slides, which tilts a price and a button off-axis; a
purchase decision is not a shelf of album art.

- **`Carousel.Content` needs an explicit height** — every slide is absolutely
  positioned. Same constraint `src/features/compass/components/log-deck.tsx`
  already documents.
- `defaultIndex={1}` opens on Grand Maester: the middle of a run of three, and
  the plan the app is named around.
- **No scroll fade.** CLAUDE.md: every scrollable gets one *except a carousel*.

**What the carousel already does right** (apple-design, verified in the source
rather than assumed) — do not "fix" any of it:

| Principle | Where |
|---|---|
| §2 1:1 tracking | `onUpdate` writes `progress` straight from `translationX` |
| §3 Interruptibility | `onBegin` reads the live `progress` into `dragFrom`, with a comment saying it must be read before the settling spring is cancelled. That is animating from the presentation value |
| §9 Rubber-banding | `RUBBER 0.35` / `OVERSCROLL 0.4` past either end |
| §10 Hysteresis | `activeOffsetX([-10, 10])` — Apple's ~10px, exactly |
| §10 Parallel recognition | cross-axis pass-through so a nested scroll is not fought over |
| §14 Reduced motion | `reducedMotion` assigns `progress` directly, no spring |
| §11 Compositor-only | transform and opacity, Reanimated, UI thread |

Its spring is `{ damping: 22, stiffness: 190, mass: 0.55 }` — a damping **ratio
of 1.08** and a **response of 0.34s**. Critically damped, no overshoot, which is
both apple-design's default and DESIGN.md's "never overshooting". Leave it.

**`src/features/billing/components/plan-slide.tsx`** — depth, so the card being
decided on is the obvious one (apple-design §12 *material weight encodes
hierarchy*, §16.6 *hierarchy makes the important thing the obvious thing*). The
`default` variant is a plain translate; it gives every slide equal weight, which
is right for photographs and wrong for a choice.

```tsx
const d = distanceFromActive();          // fractional, on the UI thread
scale   = interpolate(|d|, [0, 1], [1, 0.94], CLAMP)
opacity = interpolate(|d|, [0, 1], [1, 0.55], CLAMP)
```

The active slide rests at **exactly 1** and the others shrink — never scale the
active one above 1. The carousel's own `interactive` branch carries the reason
in a comment: text is rasterised at its layout size and then scaled by the
compositor, so a price held at 1.05 is drawn at the wrong raster size for the
entire time it is readable. Three animated nodes, one per slide, is well inside
the budget CLAUDE.md's twenty-one-skeleton-bars rule was written about.

**`src/features/billing/components/plan-card.tsx`** — presentational, props
`{ plan, selected, busy, onChoose }`. Nothing from a store (CLAUDE.md).

```
┌────────────────────────────────┐
│ ◇  GRAND MAESTER               │  PrefixIcon 36 + labelSm
│                                │
│ $20  a month                   │  headlineLg + bodySm muted, baseline-aligned
│                                │
│ 10,000 AI Credits              │  bodyMd, tabular-nums
│ Six models, Sonnet 5 and up    │  bodySm muted
│ Unused credits roll over       │
│                                │
│ [        CHOOSE        ]       │  GoldButton size="compact"
└────────────────────────────────┘
```

- **Gold appears once per screen.** The three cards are not all gold. The
  *centred* card takes `border-primary`, a gold `PrefixIcon` and the one
  `GoldButton` — the `ModeCard` treatment already at
  `samwell-section.tsx:112`. Off-centre cards carry a bordered `ActionButton`.
  Gold tracks the carousel and never doubles.
- **§16.6 Simplicity, not minimalism.** Three lines of substance per card:
  credits, models, rollover. Not a feature matrix — every plan has every tool,
  so a tick grid would be three identical columns arguing they are different.
- **§16.8 Direct labels.** "CHOOSE", not "Get started". Buttons are verbs.
- **§1 Response.** `Touchable`'s press feedback is already scale + 0.6 opacity
  on press-down, not on release.
- **§13 Utility.** `haptics.commit` on CHOOSE only. The snap gets
  `haptics.select`. Nothing else buzzes.
- Square corners. 8 / 16 / 32. No em dashes. Samwell is "he".
- Copy stays plain: "10,000 AI Credits", never "$8 of inference", never a
  "most popular" flag or a countdown.

**§7 Spatial consistency.** The card that was centred when CHOOSE was pressed
is the card the panel settles onto afterwards, and a failed purchase returns to
that same card rather than resetting to index 1. Where it came from is where it
goes back.

**States.** Purchasing → that card's button goes `loading`, and the carousel
**keeps its gesture** (§3: never lock out input during a transition). Cancelled
→ nothing said, closing a store sheet is a decision, exactly as
`AccountCancelled` is treated in `src/stores/account.ts`. Failed →
`showToast({ message, key: 'billing' })`. Succeeded →
`showToast({ message: 'Grand Maester Samwell is yours.', tone: 'success',
key: 'billing' })`, then the panel swaps to the model card.

**A RESTORE PURCHASES row** sits under the carousel. Apple requires it, and
somebody reinstalling needs it.

---

## Stage 5b — Three house design-system fixes

apple-design found three genuine gaps. All three outlive this feature, so they
are their own commits, landed before Stage 5 uses them.

**1. Velocity handoff — the carousel drops the flick's momentum.**
`src/components/ui/carousel.tsx`

`onEnd` reads `event.velocityX` and uses it only to decide *whether* to step.
It then calls `settle(from + step)` → `animateTo` → `withSpring(target, SPRING)`
**with no `velocity` in the config**, so the spring restarts from a standstill.
This is precisely apple-design §5 — the visible seam between dragging and
animating, the detail that most separates "fluid" from "fine". Reanimated's
`withSpring` takes `velocity` directly; thread the release velocity (converted
from px/s to progress-units/s by `/ itemSize`) through `settle` into the spring.

A vendored edit, so it carries a `LOCAL EDIT (Open Citadel)` comment with the
reason and a re-apply note, exactly as the `stack` step values at
`carousel.tsx:~600` already do. **It fixes Compass's log deck too** — every
flicked card in the app currently loses its momentum at the same seam.

**2. `useCarouselState` cannot see the run.** Same file.

It returns `{ index, count, scrollTo, next, previous }` — no `progress`, no
`engaged`. So a feature cannot give its slides depth without either adding a
variant to the vendored component or forking it. `PlanSlide` needs exactly that.
Add `progress` and `engaged` to the hook's return. Purely additive, so a
`panelui-cli update carousel` will not conflict.

**3. No haptic when the run snaps.** `plan-carousel.tsx`, not vendored.

apple-design §13: feedback fires on the causal event, on the same frame.
`haptics.select` on `onIndexChange` — the house already reserves `select` for
"moving a selection", which is what a snap is. Kept out of the vendored file so
every carousel does not inherit an opinion about buzzing.

**Optional, and genuinely app-wide: display tracking.** apple-design §15 —
*"tracking is size-specific; a fixed letter-spacing is wrong somewhere."*
`src/constants/theme.ts` sets `letterSpacing` on `labelLg/Md/Sm` and on nothing
else, so `displayLg` (48px) and `displayMd` (36px) run at 0 and read loose at
size. `-0.5` / `-0.4` / `-0.2` on `displayLg` / `displayMd` / `headlineLg` is
the fix. **This touches every screen**, so it is a separate commit with an
adb screenshot diff before and after, and it is not a prerequisite for billing —
the plan card's price sits at `headlineLg`, which barely moves.

---

## Stage 6 — App: credits in the cloud panel

`src/features/settings/components/cloud-panel.tsx` is 318 lines with three
components in it. It splits:

| File | Contents |
|---|---|
| `cloud-panel.tsx` | the branch only: not-configured / signed-out / no-plan / active |
| `billing/components/plan-carousel.tsx` | the three cards |
| `billing/components/credit-meter.tsx` | replaces both `UsageBar`s |
| `settings/components/cloud-model-sheet.tsx` | `CloudModelSheet` + `ModelRow`, lifted out |

**`CreditMeter`** replaces the 5 HOURS / WEEKLY pair:

```
CREDITS                          REFRESH
████████████████░░░░░░░░
7,423 of 10,000 · renews 8 Oct
```

One `Progress`, `tabular-nums`, the same `REFRESH` / `Spinner` swap the usage
row already does. Under ~10% of the grant the number turns
`--color-warning-foreground` and a line appears offering the next plan up.

**The model sheet** gains the multiplier and the estimate (spec §11):

```
Claude Sonnet 5                        1.3×
Anthropic · text, vision, tools
Typical message ≈ 50 credits              ✓
```

The `×` and `≈ N credits` are computed **server-side** in `GET /billing/me` and
`GET /models`, so the app never sees a price — spec §19, and it keeps OpenRouter
an implementation detail. Models above the reader's plan are not listed at all.

**Where it lives.** Everything stays inside the existing Samwell section of
`src/app/settings.tsx`, under the Cloud mode card. Not a new route and not a new
settings section: a plan is a fact about cloud Samwell, and putting it anywhere
else splits one decision across two screens.

---

## Stage 7 — Insiders

**The server side is built** (this plan's step 3 of the second session):
`POST /admin/insider/invites` mints a grouped, uppercase code behind the
admin key; `POST /billing/insider/redeem` claims it with a single-winner
conditional UPDATE (two devices racing one code: exactly one wins), grants
the first period through the same `grantMonthly` with `source: 'insider'`,
and asks RevenueCat's **`grant-customer-entitlement`** to hold the
entitlement for the whole term, so `readEntitlement` keeps exactly one shape
to reason about. A timer (`sweepInsiderRegrants`, hourly in `index.ts`)
extends the term one period at a time and clears the plan when the term has
run out - a late sweep clears rather than granting credits for time that is
over. Redemption refuses while a live paid subscription stands (the code
stays intact, giftable), and is refused as `409`.

Remaining here:
- [ ] The app side: `redeemInsider(code)` on the subscription store, no UI
      yet. A "Have a code?" row under the carousel is one line when you want
      it.

---

## Stage 8 — Gating, and not letting it drift

`src/features/chat/hooks/use-samwell-readiness.ts` is the one place that decides
whether cloud Samwell can answer, and its docblock says why. `CloudBlocker`
gains two ordered cases:

```ts
export type CloudBlocker =
  | 'offlineMode'
  | 'notConfigured'
  | 'needsAccount'
  | 'checkingAccount'
  | 'checkingPlan'      // /billing/me has not answered — say nothing, block anyway
  | 'needsPlan';        // signed in, no subscription
```

Ordered after `needsAccount` and before `offlineMode`, for the reason the
existing comment gives about `offlineMode` once being first: an account is the
deeper prerequisite, and telling somebody to subscribe before they have signed
in is a dead end reachable only through another dead end. `checkingPlan` says
nothing out loud and still blocks, exactly as `checkingAccount` does.

Every surface reading `cloudBlocker` picks the new cases up for free:
`src/features/chat/components/samwell-banner.tsx`,
`src/features/compass/components/compass-body.tsx`'s `COMPASS_BLOCKED` map, and
`CloudPanel` itself. **No surface gets its own subscription check.**

**Client-side error handling, which is missing today.**
`src/services/cloud-chat.ts` has no `!res.ok` branch except the `/health` probe
at line ~713, so the current 429 surfaces as a generic stream error. Add one
place that reads `402 insufficient_credits` / `402 no_subscription` and throws
a typed error, so chat, Compass and onboarding all report it the same way:

> **Not enough AI Credits.** This message needs about 120 and you have 74 left.

---

## Files

**New (server, all built and tested):**
`packages/samwell-shared/src/billing.ts` (plans + arithmetic) ·
`server/src/billing.ts` (the ledger service) ·
`server/src/billing-webhook.ts` · `server/src/billing-routes.ts` ·
`server/src/credit-turn.ts` (Guard 4) · tests:
`packages/samwell-shared/src/__tests__/billing.test.ts`,
`server/src/__tests__/{billing,billing-webhook,credit-turn}.test.ts`

**New (app, still to come):**
`src/constants/revenuecat.ts` · `src/services/purchases.ts` ·
`src/stores/subscription.ts` ·
`src/features/billing/components/{plan-carousel,plan-slide,plan-card,credit-meter}.tsx` ·
`src/features/settings/components/cloud-model-sheet.tsx`

**Changed:** `packages/samwell-shared/src/{models,index}.ts` ·
`server/src/{index,db,http-helpers,compaction}.ts` (compaction gained
`estimateTextTokens`, the string sibling of `estimateMessageTokens`) ·
`src/stores/{settings,account,chat}.ts` · `src/services/cloud-chat.ts` ·
`src/features/settings/components/cloud-panel.tsx` ·
`src/features/chat/hooks/use-samwell-readiness.ts` · `app.config.js` ·
`package.json`

**Vendored, with `LOCAL EDIT` comments (Stage 5b):**
`src/components/ui/carousel.tsx` — velocity handoff, and `progress`/`engaged`
on `useCarouselState`. Optional, separate commit: `src/constants/theme.ts`.

**Deleted (when Stage 4's migration lands):** `limits.ts`, the `/usage`
route, `getUsageState`, and both `UsageBar`s.

---

## Verification

**Arithmetic first, before any UI.** Vitest against
`packages/samwell-shared/src/billing.ts`, following the existing
`server/src/__tests__/` pattern:
- the spec's own worked example — 10,000 in / 2,000 out at $1.40 / $4.40 is
  $0.0228, is 29 credits after `ceil`
- `creditValueUsd` derives 0.0008 from every plan; the literal appears nowhere
- capped rollover at, under and over the cap
- `planIncludes` for all nine ordered pairs
- **the multiplier never multiplies a charge** — a fixed token count charges
  identically whatever the `×` says (spec §10)

**The guards, replayed against your own worst turn.** Feed the 112-call,
14.6M-token turn from `openrouter_activity_2026-09-08.csv` through the loop
ceiling and the compaction ceiling and assert it is bounded — the loop stops at
12 continuations, and no single request is sized past 60,000 tokens. This is the
one test whose failure costs real money.

**Reservation, which is the part that can lose money.** A test firing N
concurrent `reserveCredits` at a balance that fits N−1: exactly N−1 succeed.
Then a settle-below-estimate leaves `reserved` at 0 and the balance debited by
the actual, and an errored run leaves the balance untouched.

**Webhook.** Replay a `RENEWAL` payload twice and assert one `MONTHLY_GRANT`.
Then `reconcileBalance` against the ledger and assert the cache agreed.

**End to end, on a device** — not the simulator, per CLAUDE.md:
1. `eas build --local --platform android --profile development`
2. Signed out, cloud selected → the existing sign-in card, unchanged.
3. Signed in, no plan → three cards, Grand Maester centred, one gold button.
4. Choose Maester → Play's sheet → back to a model card showing 2,500 credits
   and three models.
5. Send a turn. Balance drops by the real amount. `credit_ledger` has one
   `AI_USAGE` row whose `credits` matches what the meter moved by.
6. Ask for an Archmaester model id from a Maester build → served the plan
   default, not the frontier model.
7. `ADMIN_ADJUSTMENT` the balance to 5 → the composer refuses with the credit
   message, not a generic stream error.
8. Kill the app mid-stream → the reservation is released within 15 minutes.
9. Reinstall → RESTORE PURCHASES brings the plan back.
10. Redeem an insider code → Maester, with `source: 'insider'`.

**Motion, on the Galaxy A33, by measurement rather than by eye:**
- Flick a plan card and grab it mid-flight — it must follow the finger from
  where it is, with no jump and no wait (§3).
- Flick hard and let go: after the Stage 5b velocity fix the card should carry
  through the snap, not restart from a standstill. Record both and compare
  frame by frame; the seam is invisible at full speed, which is why it survived
  this long.
- Drag past the last card — resistance, not a wall (§9).
- Turn on system reduce-motion: the run steps with no spring and no stagger.
- Confirm the Compass log deck still behaves after the shared carousel edit.

**Then:** `pnpm exec tsc --noEmit` and `pnpm exec eslint <paths>`.

---

## Open risks

1. **The tail, not the price.** 11% of turns were 91% of spend, and the worst
   was 112 calls and 14.6M prompt tokens in one message. Stage 3's guards are
   the mitigation, and they are worth more than every pricing decision here. If
   only one thing in this plan ships, make it those.
2. **`parallelToolCalls: false` may have a reason nobody wrote down.** It is
   the only uncommented line in a heavily commented config block, and the
   approval flow drains serially, which may be it. If it cannot be turned on,
   the loop ceiling and compaction ceiling still bound the damage — the turn
   just stays chattier than it needs to be.
3. **Anthropic caching is unconfirmed.** Every cached row in your export is
   OpenAI, Google or Z.ai. If Sonnet 5 and Opus 5 do not cache through
   `@tanstack/ai-openrouter`, they cost roughly 3× the table and want moving
   down their bands. One test request each settles it.
4. **The forecast is a p75 seed from dev traffic**, which skewed toward
   onboarding and Compass. The weekly recalibration job is what makes that
   safe, and every grant is a config row rather than a deploy.
5. **Apple's first-IAP rule.** The first subscription must ship with an app
   version. The Test Store path means none of the code waits on that.
6. **Play's `productId:basePlanId`.** RevenueCat wants the base plan in the
   store identifier. A subscription without one registers and never purchases.
7. **Webhook reachability.** The Coolify host must accept RevenueCat's IPs. The
   REST reconcile in `readEntitlement` is the safety net, not the mechanism.
8. **Maester looks very generous** — $6 buys ~2,500 flash turns against $20's
   ~715 Sonnet turns. Honest arithmetic rather than a bug, since flash inference
   really is that cheap, but worth knowing before you price against it. People
   pay for intelligence, not volume, which is what makes it safe.
9. **The metering change is a hard cut for old clients.** From the deploy of
   this server onward, any app build without the subscription store gets 402 on
   every metered turn. No subscribers exist yet, so the blast radius is dev
   devices - but the server must not go to production alongside an app build
   that predates Stage 4 and is expected to keep working.
10. **The charge assumes the forecast's cached-token share.** OpenRouter
    reports the real split; the adapter does not forward it. If a provider's
    actual cache behaviour differs wildly from the 83% assumption, charges and
    true cost drift apart. The weekly recalibration - and, better, forwarding
    the real cached tokens from the adapter - is the fix.
11. **The satellite routes are recorded but not charged** (`/chat/title`,
    `/tags/suggest`, `/compass/takeaway`). The plan's own table says the
    reader pays for them; until they are wired, they ride on the house. Small,
    explicit, reader-initiated calls, but it is a gap versus the plan, and it
    should be closed with the same plan gate `/chat/http` now has.
12. **A stale subscription keeps its spendable balance if both the webhook and
    the REST reconcile are missing** (no `REVENUECAT_SECRET_API_KEY`
    configured, webhook unreachable). The balance bounds it - at most the
    capped rollover plus one grant - and `readEntitlement` never destroys, by
    design: a paying reader is never logged out on a transient blip. With the
    key configured and the webhook live, this window is nil.
