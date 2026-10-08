# Cloud reading voices: handover

Branch `t3code/cloud-reading-voices`, cut from `library-v2` at `79ef345`. No
pull request has been opened. Everything below was built and tested here
without a device and without an OpenRouter key, so section 5 matters: it says
what was not seen working and where to look first if it does not.

Order of work for you: deploy the server (2), register the voices and make the
samples (2), run the listening test with your key (2), then install the build
and walk the A33 script (3 and 4).

---

## 1. What was built

### Shared package (`packages/samwell-shared`)

- `src/voices.ts`: the cloud voice catalogue and its maths, in one place for
  the server and the app. `CloudVoiceModel`, the seed `CLOUD_VOICE_CATALOG`
  (Kokoro; Gemini 3.8 Flash Lite and Flash; ElevenLabs v4 Turbo and v4),
  `voicesForPlan`, `defaultVoiceModelId` (the voice that lasts, not the
  dearest), `ttsCostUsd`, `listeningHours`, `ttsCreditsEstimate`, the Gemini
  token to character conversion, `listedVoices` (Kokoro shown in English
  accents only, like Lite), the `cloud:<modelId>:<voice>` setting format, and
  the `VoiceFigures` shape the server sends the app.
- `src/__tests__/voices.test.ts`: every plan reaches a voice, access is
  cumulative, each plan's default voice clears its hours floor (Kokoro about
  60 on Maester, Flash Lite 14.6 on Grand Maester, Eleven v4 Turbo 22.2 on
  Archmaester), Grok and Fish are absent.

### Server (`server/src`)

- `voice-catalog.ts`: the `cloud_voice_models` table, seeded from the shared
  catalogue only when empty, with list, find, insert, update, remove.
- `voice-metadata.ts`: reads prices and voice lists from OpenRouter
  (`/api/v1/models?output_modalities=speech`, one call), on boot and on the
  chat refresh's 12 hour rhythm. Never blanks a known price or list.
- `voice-routes.ts`: `GET/POST/PATCH/DELETE /admin/voices` (mirrors
  `/admin/models`), `POST /admin/voices/samples` (starts the sample run in the
  background) and `GET /admin/voices/samples` (its progress), and the open
  `GET /tts/samples/<model>/<voice>.mp3` with long cache headers, no sign-in,
  no metering, capped per caller.
- `voice-samples.ts`: makes one short mp3 per listed voice and keeps it under
  `VOICE_SAMPLES_DIR` (`/data/voice-samples` in the container).
- `tts.ts`: `POST /tts/speak` `{ modelId, voice, text, speed? }`. Identity,
  validation, length limit (413), two in flight and a daily ceiling of 1.5
  million characters per reader (429), plan required (402
  `no_subscription`), plan reaches the voice (403 naming the plan), voice in
  the model's list (400), a usage event of kind `tts`, a one-credit hold (402
  `insufficient_credits` on an empty balance), then the maker's PCM streamed
  straight through with `X-Audio-Format`, `X-Audio-Sample-Rate` and
  `X-Audio-Channels`, and the charge settled after the stream ends.
- `tts-upstream.ts`: the OpenRouter speech call (`provider: { zdr: true }`,
  `response_format: pcm`), the content type parser, and the generation cost
  lookup (`X-Generation-Id`, then `GET /api/v1/generation`, four tries at 1, 2,
  4 and 8 seconds, off the audio path).
- `tts-billing.ts`: the running remainder. Each piece adds its real cost in
  nano-dollars to `tts_spend`; whole credits are claimed with a conditional
  update and debited through the ordinary `settleCredits`, so an account is
  always charged its real spend to within one Neuron and a sentence is never
  rounded up on its own.
- `tts-guards.ts`: the in-flight and daily character limits.
- `tts-production.ts`: the route wired to the real database and billing.
- `voice-figures.ts`: what `/billing/me` and `/billing/plans` now also answer
  (`voices`): each model with its maker, listed voices, Neurons a chapter,
  hours on each plan that reaches it, and per plan the makers and its default
  voice's hours. Never a price.
- `billing.ts`: one new option on `settleCredits`, `omitZeroLedgerRow`, so a
  sentence that debited nothing writes no ledger row; and `linkGuest` now
  carries a guest's remainder to the account. Chat is unchanged (tested).
- `db.ts`: the `tts_spend` table in `ensureBillingSchema`, and
  `deleteAccountData` removes it.
- `index.ts`: mounts `/tts`, `/admin/voices`, seeds the voice table, starts
  the voice refresh, and `/health` reports `voicesByPlan` and
  `voicesMissingPrices`.
- `Dockerfile`: `VOICE_SAMPLES_DIR=/data/voice-samples`.
- Tests: `tts-billing.test.ts` (remainder, two settles racing, a chapter
  within one Neuron of its cost, guest link carry, chat unchanged),
  `tts-route.test.ts` (the whole route against a fake maker),
  `tts-parts.test.ts` (content types, cost lookup retries, guards, metadata,
  figures, sample paths), and `account-delete.test.ts` now covers `tts_spend`.

### Scripts

- `scripts/register-cloud-voices.sh`: registers the five voice models in their
  tiers, in the style of `register-cloud-models.sh`.
- `scripts/generate-voice-samples.sh`: starts the sample run on the server and
  waits for it.
- `scripts/voice-listening-test.sh`: the listening test with your own key,
  and a probe of what each maker really sends (see section 5).

### App (`src`)

- `services/cloud-tts/`: the cloud voice behind Readium's own synthesis
  bridge, so highlighting, pause, skip, page turns and the lock screen stay
  Readium's.
  - `request.ts`: `POST /tts/speak` streamed with `expo/fetch`, failures
    turned into four kinds (`out_of_credits`, `plan_lapsed`, `offline`,
    `maker_failed`).
  - `pcm.ts`: 16-bit PCM to Float32, carrying a half sample across network
    chunks, stereo folded to mono.
  - `pieces.ts`: cuts a sentence over 1,500 characters at clause ends.
  - `sentences.ts`, `lookahead.ts`: guesses the next one or two sentences from
    the rest of the paragraph Readium hands over, and stops guessing for the
    session when fewer than half are asked for.
  - `cache-key.ts`, `audio-cache.ts`: raw PCM kept on the phone by book, text,
    model and voice (and speed where the maker applies it), 300 MB, oldest out.
  - `piece-queue.ts`, `session.ts`: two fetches at a time, the awaited
    sentence first, audio handed on as it arrives, one silent retry for a
    failing maker, and a failed sentence held open rather than failed back to
    Readium.
- `features/reader/hooks/use-read-aloud-bridge.ts`: the one answerer Readium
  talks to; reads the setting at each request and hands it to the cloud
  session or the on-device synthesizer.
- `features/reader/hooks/use-cloud-voice-bridge.ts`: one cloud session per
  book; pauses the book about 1.2 s after a failure on Android (so the
  sentence playing finishes) and holds the failure.
- `features/reader/hooks/use-cloud-voice-failure.ts` with
  `features/tts/components/cloud-voice-failure-sheet.tsx` and
  `features/tts/utils/cloud-failure.ts`: the four drawn states and their ways
  out. Continue on-device resumes at the same sentence (see section 5.6).
- `features/reader/hooks/use-kokoro-tts-bridge.ts`: now trusts the saved
  Enhanced voice over the native side's idea of it, so coming back from the
  cloud reads in the chosen Kokoro voice rather than Kokoro's default.
- `app/reader/[id].tsx`: wiring only (the bridge, the lookahead feed, the
  working spinner, the failure and plans sheets).
- `components/reader/tts-controls.tsx`: the play button shows a spinner until
  a cloud voice's first audio arrives.
- `features/tts/components/tts-settings-panel.tsx`: the Cloud card is live.
  The on-device controls and the cloud pane trade places under the cards
  (the same `VoiceKindPanes`).
- `features/tts/components/cloud-voice-pane.tsx`, `cloud-voice-picker.tsx`,
  `features/tts/hooks/use-cloud-voice-pane.ts`, `use-voice-source.ts`,
  `use-cloud-sample-preview.ts`: makers as chips (locked with their plan's
  name), the model where a maker has two, the voice row and list with free
  samples, Neurons a chapter and hours a month, speed where the maker takes
  it, and the trust line. Choosing Cloud without a plan raises `PlansSheet`
  over the panel; a locked maker raises it with only the plans that open it.
- `features/tts/utils/cloud-voices.ts`, `cloud-voice-names.ts`: which voice a
  setting means, chip labels, cost lines; Kokoro cloud voices carry the same
  names as on the phone (`af_heart` is Yennefer).
- `features/tts/utils/enhanced-fit.ts` and `enhanced-fit-sheet.tsx`: the
  strained-phone sheet now offers USE CLOUD beside USE LITE VOICES, with the
  line "the same Kokoro voices, read from the cloud so the phone does not
  strain".
- `services/device-tts/catalogue.ts`: `voiceMode` gains `'cloud'`;
  `readerVoiceId` sends no voice for a cloud voice, so the native side uses
  the JS engine.
- `stores/settings.ts`: remembers `ttsCloudVoice` and `ttsDeviceVoice` (the
  on-device voice to go back to).
- `query-manager/cloud-voices/`: the voice figures, selected from the plan
  preview query (one request for the cards and the pane).
- `components/choice-chips.tsx`: a chip can be drawn locked with a line.
- `features/billing/`: plan cards add "N hours of cloud reading" (card height
  270, worked out in `plan-carousel.tsx`), and `PlanInfoSheet` gains a
  Reading voices section.
- `features/settings/`: the Settings summary reads "Cloud · Kore".

---

## 2. Server steps

### Environment

Nothing new is required. `OPENROUTER_API_KEY` and `ADMIN_API_KEY` must be set
as they already are. `VOICE_SAMPLES_DIR` defaults to `/data/voice-samples` in
the Dockerfile, on the same `/data` volume as the database, so the samples
survive deploys.

### Deploy

Merge or deploy the branch the way you deploy the server today (Coolify,
`Dockerfile` at the root). On boot the server creates `cloud_voice_models`
and `tts_spend` and seeds the five voices.

### Confirm

```bash
curl -s https://api.open-citadel.online/health | jq '{voicesByPlan, voicesMissingPrices, chatReady}'
```

Expect `voicesByPlan` to be `{"maester":1,"grand_maester":3,"archmaester":5}`
and `voicesMissingPrices` to be `[]`.

### Register the voices (idempotent; re-pulls prices and voices from OpenRouter)

```bash
 ADMIN_API_KEY='...' ./scripts/register-cloud-voices.sh
```

It prints `ok` per model and the `/health` counts at the end.

### Make the free samples

```bash
 ADMIN_API_KEY='...' ./scripts/generate-voice-samples.sh
```

About 140 short reads, a few minutes, a few cents. It prints how many were
made and any that failed (a failed voice is simply tried again on the next
run). Check one:

```bash
curl -s -o /tmp/sample.mp3 -w '%{http_code} %{content_type}\n' \
  https://api.open-citadel.online/tts/samples/hexgrad/kokoro-82m/af_heart.mp3
```

Expect `200 audio/mpeg`.

### Listening test, with your own key

```bash
 OPENROUTER_API_KEY='sk-or-...' ./scripts/voice-listening-test.sh
```

Writes one mp3 per model of the same two paragraphs to
`listening-test/<date>/`, and for each model prints the PCM content type, the
generation id, the cost OpenRouter reports for one sentence, and whether
`speed: 1.25` is accepted. Read section 5 against its output.

---

## 3. The dev build

No native code changed. The cloud voice answers the same JS synthesis bridge
the Enhanced voices already use, and `expo/fetch`, `expo-audio` and
`expo-file-system` are all already in the binary. **Your existing development
client is enough**: start Metro against it and the new JS loads.

```bash
SAMWELL_CLOUD_URL=https://api.open-citadel.online pnpm start
```

(Or however you normally start Metro; the server URL must point at the
deployed server, as `.env.example` describes.) If you prefer a fresh client, the repo's command is unchanged:

```bash
eas build --local --platform android --profile development
```

It could also go out over the air with `scripts/publish-update.sh` once tested
(write `release-notes.json` first), since nothing native moved. Not done here.

---

## 4. Test script for the Galaxy A33

Have a test account on no plan, and one each on Maester, Grand Maester and
Archmaester (insider codes are the quickest way). Use an EPUB with long
paragraphs and one you can find a run-on sentence in.

1. **Cloud with no plan, in Settings.** Settings, Reading voice. The Cloud card
   says WITH A PLAN. Tap it: the plans sheet rises over the panel with "Cloud
   voices come with every plan." Dismiss it: On-device is still chosen. Buy
   (test store): the sheet closes, Cloud is chosen, the Kokoro pane shows.
2. **Cloud with no plan, in the reader.** Open a book, long-press the
   read-aloud button, tap Cloud. The plans sheet rises over the voice sheet,
   not instead of it. Buy: it closes, Cloud is chosen, the reader is still open.
3. **Plans and makers.** On each plan, open the Cloud pane. Maester: KOKORO
   open, GOOGLE locked "GRAND MAESTER", ELEVENLABS locked "ARCHMAESTER". Grand
   Maester: Google open, with FLASH LITE and FLASH. Archmaester: all open.
   Tap a locked maker: the plans sheet offers only the plans that open it.
4. **Figures.** Each model shows "About N Neurons a chapter" and "About N hours
   a month on your plan". Plan cards show "60 hours of cloud reading" (Maester),
   "15" (Grand Maester), "22" (Archmaester), and the plan info sheet has a
   Reading voices section.
5. **Samples are free.** Note the balance. Open the voice list, play six
   samples. The balance has not moved (pull to refresh in Settings).
6. **Listening.** Choose a cloud voice, start read-aloud. The play button
   spins, then audio starts within about a second on wifi. Highlighting moves
   sentence by sentence as before. Listen across a paragraph for gaps between
   sentences (see 5.5 on paragraph starts).
7. **Charged once.** Note the balance, read a chapter, note it again. Go back
   to the start of the chapter and read it again. The second reading must not
   move the balance (it plays from the phone).
8. **Charged right.** Compare the Neurons spent on a chapter with OpenRouter's
   activity page for the same minutes: they should agree to within one Neuron
   ($0.0008).
9. **Out of Neurons.** On a test account with very few Neurons, read until
   they run out. The sentence playing finishes, the book pauses, "Out of
   Neurons" rises with CONTINUE ON-DEVICE and UPGRADE. Continue on-device: the
   book carries on at the next sentence on the on-device voice (try once with
   an Enhanced voice last used, once with a Lite voice).
10. **No connection.** Mid-chapter, turn on airplane mode. When the cached and
    prefetched sentences run out, "Cloud voices need a connection." with
    CONTINUE ON-DEVICE and TRY AGAIN. Turn wifi back on, TRY AGAIN: it carries
    on at the same sentence.
11. **Failing maker.** Hard to force; one way is to deregister the voice in
    use with `DELETE /admin/voices/<id>` mid-read and re-register it after.
    Expect "That voice is not answering." with TRY AGAIN and CONTINUE
    ON-DEVICE.
12. **Plan lapsed.** Expire a test subscription. The Cloud card returns to WITH
    A PLAN and the voice goes back to the last on-device one.
13. **Lock screen, notification, podcasts.** With a cloud voice reading, lock
    the phone: the lock screen card and its controls work. Start a podcast:
    read-aloud gives way as before. Podcasts and on-device read-aloud behave
    exactly as before this branch.
14. **Enhanced fit.** On the A33, Enhanced pane, tap "Needs a more powerful
    phone": the sheet offers USE LITE VOICES and USE CLOUD.
15. **Jank.** For the plans sheet rising and the switch flips:

    ```bash
    adb shell dumpsys gfxinfo com.dr33m.opencitadel.dev reset
    # open the voice sheet in the reader, tap Cloud with no plan so the plans sheet rises; close; repeat 3 times
    adb shell dumpsys gfxinfo com.dr33m.opencitadel.dev | grep -E "Total frames|Janky|Number Frame deadline missed|99th"
    ```

    Then reset again and flip On-device / Cloud and Lite / Enhanced six times.
    Target: no frame over 32 ms while the plans sheet rises (99th percentile
    under 32 ms), and about 5% janky frames over six flips. The development
    variant's package is `com.dr33m.opencitadel.dev` (`app.config.js` adds
    `.dev`); drop the suffix for a production build.

---

## 5. Not verified, and where to look first

Nothing here has played a real cloud voice: there was no OpenRouter key and no
device. The server was tested against a fake maker shaped from OpenRouter's
documentation; the app's session was tested against a fake server. What that
leaves:

### 5.1 The generation cost lookup

The charge is OpenRouter's own `total_cost` from `GET /api/v1/generation?id=`
read with the `X-Generation-Id` from the speech reply. Never seen on speech
traffic. If the listening test prints `total_cost=NOT REPORTED` or no
generation id, every piece is charged at the listed price instead (still
correct for Kokoro on DeepInfra and for Gemini; possibly 2x high for
ElevenLabs if the listed price is before the 0.5 discount). Look at
`lookupGenerationCost` in `server/src/tts-upstream.ts`.

### 5.2 `speed` per maker

Only Kokoro is marked as taking `speed` (seed and `register-cloud-voices.sh`);
the server sends it only then, and only when it is not 1. The listening test
prints the HTTP status for `speed: 1.25` per model, and writes
`<model>.speed.mp3` to listen to. A 400 for Kokoro means turning it off:
`PATCH /admin/voices/hexgrad/kokoro-82m` with `{"speedSupported": false}`. A
200 for another maker that audibly speeds up means it can be turned on the
same way.

### 5.3 PCM content type and sample rate per maker

The server reads the rate from the content type (`rate=`, `sample_rate=`,
`samplerate=`), assumes 24 kHz mono if none is given, and tells the app in
`X-Audio-Sample-Rate`. The listening test prints each maker's real content
type. If a voice plays at the wrong pitch (chipmunk or slowed), the rate is
being misread: look at `parseAudioFormat` in `server/src/tts-upstream.ts`.
If a maker answers `audio/mpeg` despite asking for PCM, the app refuses it as
"That voice is not answering." (it cannot decode mp3 without a native module).

### 5.4 Cost of PCM

PCM is about 173 MB an hour at 24 kHz 16-bit, over the network and in the
cache. Decoding mp3 instead would need a native decoder and a new build; it is
listed as an open decision below.

### 5.5 Lookahead and gaps between sentences

The next one or two sentences are fetched from `locator.text.after`, which
Readium fills with the rest of the paragraph on both Android and iOS (checked
in the native converters, `readiumLocatorToNitro`). What cannot be guessed is
the first sentence of each paragraph, so expect a short gap there (one round
trip) and none inside a paragraph. If gaps appear inside paragraphs too, the
guesses are missing: Readium's tokenizer may cut differently from
`splitSentences` (`src/services/cloud-tts/sentences.ts`), and after eight
guesses under half right the session stops guessing altogether. The real fix
for paragraph starts is a native lookahead hint in the Readium patch (fire
`onTTSSynthesisRequest` for the next utterance early, or hand JS the next
utterance's text); it is the main follow-up.

### 5.6 Continue on-device at the same sentence

The failing sentence is held open and the book paused. Continue on-device then
either answers that same request with the Enhanced voice last used, or, for a
Lite voice, fails it back to Readium, which on Android restarts on the phone's
own voice from that sentence (`TTSManager.synthesisFailed`). Two things to
watch: the Lite restart uses the system default voice rather than a specific
phone voice if one was chosen; and iOS has no such fallback in the patch, so
on iOS `synthesisFailed` only fails that one utterance (`KokoroTTSEngine.swift`),
so a Lite continue there may skip the sentence or stop rather than resume
(iOS was out of scope for this test round).

### 5.7 Switching voice mid-read

Choosing a different voice in the reader's sheet while reading takes effect
at the next sentence between Enhanced and Cloud (both answered in JS). From a
Lite voice to Cloud it takes effect when read-aloud is next started, as
switching from Lite to Enhanced already did before this branch.

### 5.8 The upgrade sheet

The spec named the upgrade view of `SubscriptionManagementSheet` for a
subscriber pressing a locked maker. It is `PlansSheet` instead, limited to the
plans above theirs that open the maker: it sells the change in place, rises
over the voice sheet, and goes through the same purchase path, without
threading the management sheet's state into the voice panel. Easy to swap if
you prefer the management sheet's look.

### 5.9 Pre-existing type and lint errors

`pnpm exec tsc --noEmit` reports three errors that are on `library-v2`
already (`transitionProperty` in `color-swatch.tsx`, `gold-button.tsx`,
`cloud-model-sheet.tsx`), and `eslint` on `src/app/reader/[id].tsx` reports
the same 15 problems it does on `library-v2`. None are from this branch.

### 5.10 Build environment note

`pnpm install --frozen-lockfile` could not complete here because the sandbox
blocks `codeload.github.com` (the `thorium-locales` tarball); it was installed
from a git clone of the same commit, and the lockfile is unchanged.

---

## 6. Open decisions

1. **Cloud voices on Free Books.** Built as allowed: cloud voices read
   Project Gutenberg books too, on-device read-aloud stays free, and the copy
   says Neurons pay for the voice, never the book. Confirm.
2. **ElevenLabs' listed price.** Whether OpenRouter's listed $20 and $40 per
   million characters are before or after its 0.5 discount is unknown. Hours
   are worked out at the listed price (so they can only under-promise), and
   the charge is the real cost whenever the lookup works (5.1).
3. **PCM data use.** About 173 MB an hour. Worth a native mp3 decoder and a
   new build to cut it by about ten times?
4. **Fish Audio later.** Left out: on OpenRouter its voices are made from
   uploaded reference audio, and cloned voices are not in this version. The
   catalogue is data, so it can be registered with one admin call once a
   fixed voice list exists for it.
