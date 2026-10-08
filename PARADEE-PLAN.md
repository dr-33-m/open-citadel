# Paradee as a third Enhanced voice: research

> Written 2026-10-08. The question: can Paradee
> ([github.com/sahilmahendrakar/paradee](https://github.com/sahilmahendrakar/paradee),
> [Paradee-8M-v1.0 on Hugging Face](https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.0))
> run in our offline Enhanced voices, and what would it take? The goal is an AI voice for
> phones that cannot hold Kokoro or Supertonic today.

## Verdict

**Yes, and probably without touching `react-native-executorch` or shipping a new binary.**
Paradee is Kokoro's own architecture at a tenth of the size, and it uses Kokoro's phoneme
vocabulary and misaki's phoneme spelling. Our Kokoro pipeline already speaks both. The work
is a model export (Python, once, offline), hosting two `.pte` files, and app-side catalogue
wiring. ExecuTorch and Phonemis are already compiled in, so this can ship as an OTA update.

The one real unknown is speed on a small phone with ExecuTorch. It has to be measured on a
device (Galaxy A33, and a 2 to 3 GB phone), not estimated.

## What Paradee is

| | Paradee-8M v1.0 | Kokoro (ours today) | Supertonic (ours today) |
|---|---|---|---|
| Parameters | 8.07M | 82M | n/a |
| Download | ~37 MB fp32, 9 MB int8 (ONNX) | 350 MB | 400 MB |
| Voices | 1 (Kokoro's `af_heart`, US English) | 8, US and UK | 10 |
| Sample rate | 24 kHz | 24 kHz | 44.1 kHz |
| Quality (UTMOS / WER, author's numbers) | 4.41 / 5.7% | 4.52 / 5.7% | n/a |
| Speed (author, Apple M4 Pro, 1 thread) | 25x real time (PyTorch), 18x (int8 ONNX) | 7.6x | n/a |
| License | Apache 2.0 | Apache 2.0 | |

It is a distillation: a 4.23M "text side" (Kokoro's `CustomAlbert`, `ProsodyPredictor`,
`TextEncoder` at smaller widths) and a 3.85M decoder (Kokoro's iSTFTNet `Decoder`, narrower),
plus a parameter-free phase filter that removes a buzz between 2 and 8 kHz. The voice is not
an input: each half carries a learned constant style vector (32 wide on the text side, 16 on
the decoder).

It ships as **ONNX only**: one graph, `input_ids i64[1,T]` + `speed f32[1]` to
`waveform f32[1,S]`. PyTorch weights for both halves are also published (`pytorch/text_side.pt`,
`pytorch/decoder.pt`), which is what makes an ExecuTorch export possible.

## How our Enhanced voices run today

Everything on device goes through `react-native-executorch` 0.10.4 (`src/lib/executorch.ts`).
Kokoro uses its `createKokoroTextToSpeech` pipeline, which is TypeScript inside the library
(`src/extensions/speech/tasks/kokoroTextToSpeech.ts`) driving two `.pte` programs:

```
text --Phonemis (C++ misaki port)--> phonemes --Kokoro vocab--> token ids
  duration_predictor(tokens[1,T], mask[1,T], voiceRef[1,128], speed[1]) -> durations[T], features[1,T,640]
  (JS: repeat each token index by its duration -> indices[D])
  synthesizer(tokens[1,T], mask[1,T], indices[D], features[1,T,640], voiceRef[1,256]) -> audio[1,1,600*D]
```

The pipeline validates each program's schema at load, reads the token range and frame range
from it, and loads voices as `.bin` files of 256-float rows.

Phones under 3 GB (`LOW_MEMORY_ANDROID` in `catalogue.ts`) get no AI voice at all, because
Kokoro's FP32 weights exhausted a 2 GB emulator. That wall is what Paradee could lower.

## How well Paradee fits that pipeline

**Already matching:**

- **Vocabulary.** Paradee's `config.json` vocab is Kokoro's: 178 ids, same mapping. The
  library's `tokenize` works unchanged.
- **Phonemes.** Paradee only heard misaki spelling in training (eSpeak spelling raises its
  WER from ~2% to ~31%, per its README). Phonemis is a C++ port of misaki and is what our
  Kokoro US voices already use. No G2P work.
- **Audio shape.** 24 kHz, 600 samples per duration frame, 512 text positions. Same as Kokoro.
- **Duration and speed.** Same `round(sigmoid(...).sum() / speed)`, clamped at 1.

**Not matching, and the fix for each:**

| Gap | Fix |
|---|---|
| ONNX, not `.pte` | Export from the PyTorch weights (below). |
| One graph, with an output length that depends on predicted durations | Split into the same two programs as Kokoro. The JS between them already builds `indices`. |
| No voice input (style is baked in) | Take `voiceRef` inputs and ignore them. Ship a 1 KB voice file of zeros so the pipeline's voice map has an entry. |
| Duration features are 224 wide, the pipeline hardcodes 640 | Zero-pad to 640 in the predictor, slice back to 224 in the synthesizer. Costs about T x 416 floats per chunk, which is nothing. |
| Phase filter reads the decoder's internal harmonic source | Same forward hook Paradee's own ONNX export uses. Its length is rebuilt with `torch.tensor`, which does not export: keep it symbolic instead. |
| `torch.rand` / `randn_like` in the harmonic source (ExecuTorch has no kernels) | Deterministic hash noise and zero initial phase, as Software Mansion did for Kokoro. |
| `F.interpolate(scale_factor=...)` on a dynamic length cannot be exported | Use `size=` instead (also from Software Mansion's Kokoro export). |
| `nn.LSTM` specializes a dynamic axis to the example size on export | Pad each LSTM to a fixed length and slice back (`PaddedLSTM`), as Software Mansion did for Kokoro. |

All of these are model-side. **No patch to `react-native-executorch` is needed** if the
padded feature width is used. A cleaner alternative is a small `pnpm patch` to the library's
JS that reads the feature width from the schema rather than the constant. Do that only if the
padding turns out to cost measurable time.

## The proof of concept so far

`scripts/paradee/export_paradee_pte.py` is a draft of the export. It reuses Paradee's own
phase filter and STFT, and applies every fix in the table above. Run against the published
weights with `executorch==1.4.1` (the runtime the library's Kokoro files are built for):

- **Verified:** the eager forward runs end to end (40 tokens -> frames -> 600 x frames samples).
  The duration predictor passes `torch.export` with a dynamic token axis.
- **First attempt failed, fixed but not re-run:** the synthesizer's export failed on the
  scale-factor interpolation in the harmonic source. The script now uses sizes.
- **Not run yet:** the synthesizer export, XNNPACK lowering, and the comparison against
  Paradee's reference ONNX. The session that wrote this was not allowed to keep running code
  from the Paradee repository. Running the script locally is the next step.

## App-side changes

All JS, mostly in `src/services/device-tts/`. Same shape as when Supertonic was added.

1. **`services/device-tts/paradee.ts`** (new, like `supertonic.ts`): one voice id, e.g.
   `pd_heart`. It must not reuse `af_heart`, since ids decide the engine. Also its label and
   description, and its `KokoroTtsModel` config. For the phonemizer, use the library's own
   `KOKORO.EN_US.DEFAULT.phonemizer` object, so the ~15 MB of Phonemis files are shared with
   Kokoro US: same URL, same cache path.
2. **`catalogue.ts`**: `'paradee'` in `TtsEngineId`, `TTS_ENGINES`, `ENGINE_INFO` (label,
   one-line hint, download size), `ROSTERS`, `isAiVoice`, `engineOf`, `voiceLabel`,
   `voiceDescriptor`, and `readerVoiceId`. The native reader only knows Kokoro ids, so a
   Paradee voice is sent as none, like Supertonic.
3. **The memory wall becomes per engine.** `AI_VOICES_SUPPORTED` is one switch for every AI
   voice today. It needs to become "which engines this phone can hold", with Paradee allowed
   under 3 GB. `voiceMode`, `tts-settings-panel.tsx` and `use-voice-preview.ts` read it. This
   is the change that actually reaches small phones, and it is a UI change: load
   `open-citadel-design` before drawing it.
4. **`features/tts/utils/enhanced-fit.ts`**: the 8 GB "smooth" bar was measured for Kokoro and
   Supertonic. Paradee needs its own line, measured.
5. **`files.ts`**: `packSource` and a `localParadeeFiles`.
6. **`engine.ts`**: a `'paradee'` member of `Loaded`, holding a `KokoroTextToSpeech`. Add its
   branch in `load` and `synthesize`, and its own pace meter. Its chunk limits may differ from
   `KOKORO_CHUNKS`, see the LSTM cost below.
7. **`stores/tts.ts`**: a `DOWNLOADED_KEYS` entry.
8. **Copy**: plain, no em dashes. Something like "PARADEE" / "Small and quick. One US voice."
   It is Kokoro's `af_heart` distilled, so it could share that voice's name in the picker.

Hosting: Apache 2.0 allows redistribution with the license and notice. Put the two `.pte`
files, the zero voice file, `LICENSE` and a model card in our own Hugging Face repo. It is
also worth offering them to Software Mansion's model registry.

## Costs, expected and to measure

- **Download:** ~37 MB of `.pte` (8.07M params in fp32, plus the phase filter's DFT bases),
  plus ~15 MB of Phonemis files if Kokoro US is not already downloaded. About 50 MB, against
  350 and 400 MB for the other two.
- **Memory:** tens of MB of weights. It should fit a 2 GB phone. Confirm on one.
- **Speed: unknown, measure it.** Two reasons not to extrapolate from the M4 numbers:
  - **Padded LSTMs cost the same every chunk.** The synthesizer's prosody LSTM runs over
    frames, and with `--max-frames 1024` every chunk pays for 1024 steps, even a short one.
    Pick the bounds from the chunk sizes `pace.ts` asks for. Or try the while-loop LSTM
    decomposition (`torch.export._patches.register_lstm_while_loop_decomposition`), which
    Software Mansion imported but left disabled. Find out why before relying on it.
  - **Some ops will not be delegated.** LSTMs, reflect padding, `atan2` and the phase filter's
    gathers run on ExecuTorch's portable kernels, not XNNPACK. `print_delegation_info` after
    lowering shows how much.
- **int8:** Paradee's 9 MB file is ONNX-specific weight-only quantization. ExecuTorch's
  XNNPACK quantizer could do something similar later. Ship fp32 first and listen.

## Quality risks to check before shipping

- **Padded bidirectional LSTMs:** the backward direction starts on the zero padding, so its
  outputs drift slightly from the unpadded model. Software Mansion accepted this for Kokoro.
- **Deterministic noise** replaces Gaussian noise in the harmonic source. The phase filter
  depends on that source.
- **Phonemis vs misaki:** Phonemis is a port, and unknown words fall back to its neural G2P
  rather than misaki's eSpeak fallback. Our Kokoro US voices already live with this.

For each, compare the `.pte` output against Paradee's reference ONNX on the same token ids:
by ear, and with Paradee's own `wer.py` / `utmos.py` on its 200 held-out sentences.

## Options considered and set aside

- **`onnxruntime-react-native`, running Paradee's int8 ONNX as is.** It needs no export, but it
  adds a second inference runtime to every install and requires a native build, so no OTA. It
  also makes the APK bigger for the very phones this is meant for. Fall back to it only if
  the ExecuTorch export cannot be made to work or sound right.
- **Our own pipeline on the library's public primitives** (`loadModel`, `tensor`,
  `validateSpec`, `createPhonemizer`, `partition` are all exported). Only worth it if Paradee
  ever needs something the Kokoro pipeline cannot do. Today it does not.

## Next steps

1. Run `scripts/paradee/export_paradee_pte.py` locally. Get both programs to lower, and check
   `print_delegation_info`.
2. Compare against the reference ONNX (waveforms, then WER and UTMOS on the held-out set).
3. Load the pair in a dev build through `createKokoroTextToSpeech` with the zero voice file.
   Read the `[tts]` timing line on a Galaxy A33 and on a 2 to 3 GB phone.
4. If it keeps up, host the files and do the app-side changes, with the per-engine memory
   wall designed through `open-citadel-design`.
