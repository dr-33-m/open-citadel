# Paradee as a third Enhanced voice

> Researched 2026-10-08, built and measured 2026-10-13. The question: can Paradee
> ([github.com/sahilmahendrakar/paradee](https://github.com/sahilmahendrakar/paradee),
> [Paradee-8M-v1.0 on Hugging Face](https://huggingface.co/sahilmahendrakar/Paradee-8M-v1.0))
> run in our offline Enhanced voices, and what would it take? The goal is an AI voice for
> phones that cannot hold Kokoro or Supertonic today.

## Verdict

**Yes, without touching `react-native-executorch` or shipping a new binary.** Paradee is
Kokoro's own architecture at a tenth of the size, and it uses Kokoro's phoneme vocabulary and
misaki's phoneme spelling. Our Kokoro pipeline already speaks both. The work was a model
export (Python, once, offline), hosting two `.pte` files, and app-side catalogue wiring.
ExecuTorch and Phonemis are already compiled in, so this can ship as an OTA update.

**The export is done, checked, and measured on a Galaxy A33** (see "The export, as built" and
"On a Galaxy A33"): it reads a book aloud there at about twice the speed of speech, where
Kokoro takes three and a half times as long as the speech lasts. The files are hosted (see
"Where the files live"). What is left is measuring a 2 to 3 GB phone.

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
from it, and loads voices as `.bin` files of 256-float rows. That schema is not ExecuTorch's
own metadata, which only knows fixed shapes: the library reads it from a second method in
the `.pte`, `get_model_schema`, which returns JSON (each dynamic size as a range, plus the
constraints tying them together). A program without it is taken to have fixed shapes and
refused.

Phones under 3 GB (`LOW_MEMORY_ANDROID` in `catalogue.ts`) got no AI voice at all, because
Kokoro's FP32 weights exhausted a 2 GB emulator. That wall is the one Paradee is let past.

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
| ONNX, not `.pte` | Export from the PyTorch weights. |
| One graph, with an output length that depends on predicted durations | Split into the same two programs as Kokoro. The JS between them already builds `indices`. |
| No `get_model_schema` | Written into each program as a constant method, in the shape Kokoro's own files carry. |
| No voice input (style is baked in) | Take `voiceRef` inputs and ignore them. Ship a 1 KB voice file of zeros so the pipeline's voice map has an entry. |
| Duration features are 224 wide, the pipeline hardcodes 640 | Zero-pad to 640 in the predictor, slice back to 224 in the synthesizer. |
| Phase filter reads the decoder's internal harmonic source | Same forward hook Paradee's own ONNX export uses. Its lengths are kept symbolic, and its final cut is a gather: the exporter cannot prove a slice's bound there. |
| `torch.randn_like` in the harmonic source (ExecuTorch has no kernel) | Fixed Gaussian noise kept in the program (6 MB). Software Mansion used a sine hash for Kokoro. This is what unvoiced sounds are made from, so it stays real noise. |
| `torch.rand` initial phase | Left out. Kokoro's own downsampling never reads the sample it is added to, so it never did anything. |
| `F.interpolate(scale_factor=...)` on a dynamic length cannot be exported | Use `size=` instead (also what Software Mansion did). |
| `nn.LSTM` specializes a dynamic axis to the example size on export | Each LSTM runs padded to a fixed number of steps (`PaddedLSTM`). Unlike Software Mansion's, it is exact: the backward half reads the input reversed, so the padding always comes last and is never read. |
| `nn.InstanceNorm1d` | Written out as mean and variance (Software Mansion did the same, theirs gave NaNs). The exporter's version starts with a reshape XNNPACK then trips over. |

All of these are model-side. **No patch to `react-native-executorch` is needed.**

## The export, as built

`scripts/paradee/export_paradee_pte.py` writes the two programs and the voice file.
`scripts/paradee/verify_paradee_pte.py` checks them against Paradee's own ONNX file. The flow
is ExecuTorch's documented one (`torch.export`, `to_edge_transform_and_lower` with the
XNNPACK partitioner), pinned to `executorch==1.4.1`, the runtime the library's Kokoro files
are built for. The model-side fixes follow Software Mansion's Kokoro export
([NorbertKlockiewicz/kokoro-export](https://github.com/NorbertKlockiewicz/kokoro-export)),
which the library's model card points to.

| | |
|---|---|
| `duration_predictor_paradee_xnnpack_fp32.pte` | 9.0 MB |
| `synthesizer_paradee_xnnpack_fp32.pte` | 39.7 MB |
| `voices/pd_heart.bin` | 1 KB |
| Tokens per chunk | 3 to 128 (Kokoro's files: 8 to 128) |
| Frames per chunk | 16 to 296, so 7.4 s of speech (same as Kokoro's files) |

Checked on six sentences, run the way the app's pipeline runs them:

- **Timing is identical.** Every sentence gets exactly the reference's frame count.
- **The audio is the reference's, to within its own noise.** Log-mel distance from the ONNX
  output is 0.13 to 0.17. Two runs of the ONNX file against each other (it draws fresh noise
  each time) are the same distance apart.
- **The library accepts the schemas.** Its own `validateSpec`, with the Kokoro pipeline's
  spec, passes on what the two programs return.
- **On a laptop** it makes speech 25 times faster than it is spoken. The laptop says nothing
  about memory on a phone: see the wide-convolution note below.

Three things found on the way that are worth knowing again:

- **The LSTM steps stay off XNNPACK.** They are thousands of ops on a hundred numbers each.
  As delegates they cost more to enter than to run, and the partitioner's merging is
  quadratic in them: left in, the export did not finish. Kokoro's shipped predictor has 650
  delegates for this reason.
- **A weight shared by two convolutions breaks the lowering** (it is reshaped twice).
- **Wide convolutions must not reach XNNPACK on a phone.** The phase filter's transforms were
  three 1024-tap convolutions. In the app's runtime XNNPACK allocated a table for each that
  grows with the taps times the length of the audio: single blocks of 1.8, 1.8 and 2.5 GB
  for a five second chunk, and Android killed the app. The laptop's Python runtime never
  showed it (about 1 GB peak for the whole check, reference included), so only a phone or
  emulator finds this. They are now a gather of windows, a matrix product, and an
  overlap-add of four padded pieces: the same sums, to 1e-7 of Paradee's own filter, with no
  table. Found by sampling `/proc/<pid>/maps` through `run-as` while a sample played; each
  `[anon:scudo:secondary]` mapping is one large allocation, so its size names the culprit.

## On a Galaxy A33

Dev build, the app's own pipeline, files exported as above. Sold as 6 GB, reports 5.3 GB.

| | Paradee | Kokoro |
|---|---|---|
| Voice sample, first play (loads the voice box) | first audio after 1.9 s, x0.62 | first audio after 9.2 s, x3.44 |
| Voice sample, again | first audio after 0.9 s, x0.45 to x0.50 | |
| Reading a book aloud, long sentences | x0.38 to x0.48 | |
| Memory added by loading and the first sample | 370 MB at the peak | 590 MB at the peak |

The pace is work over speech: under 1 keeps up. Paradee's memory did not grow over repeated
samples, and over two and a half minutes of reading aloud the app stayed between 1.65 and
2.0 GB with no creep (the dev build idles at 1.26 GB).

## In the app

All JS, mostly in `src/services/device-tts/`, the same shape as when Supertonic was added.

- **`paradee.ts`**: one voice, `pd_heart`. Not `af_heart`: a voice's id decides the engine
  that speaks it. She is named Yennefer, as Kokoro's `af_heart` is, because she is that
  voice distilled. The config takes the library's own `KOKORO.EN_US.DEFAULT.phonemizer`, so
  the ~15 MB of Phonemis files are shared with Kokoro US: same address, same cache path.
- **`catalogue.ts`**: `'paradee'` everywhere an engine is listed, and the memory wall is per
  engine: `TTS_ENGINES` holds only the voice boxes this phone is offered, and Paradee is
  offered under 3 GB. The native reader only knows Kokoro ids, so a Paradee voice is sent to
  it as none, like Supertonic. Kokoro's roster moved to `kokoro.ts`.
- **`engine.ts`**: Paradee's pipeline is a `KokoroTextToSpeech` over its own files, with its
  own pace meter. A voice of an engine the phone is not offered is never loaded.
- **`files.ts`, `stores/tts.ts`**: its files and its download flag.
- **The disclaimer is per voice box** (`features/tts/utils/enhanced-fit.ts`): the mark under
  the chosen box says how this phone copes with that box. Kokoro and Supertonic keep the bar
  they were measured at, a phone sold as 8 GB. Paradee's is a phone sold as 6 GB, the A33's
  class, because that is the smallest phone it has been measured on.

## Costs

- **Download:** ~49 MB of `.pte` (8.07M params in fp32, plus the phase filter's DFT bases),
  plus ~15 MB of Phonemis files if Kokoro US is not already downloaded. About 65 MB, against
  350 and 400 MB for the other two.
- **Memory:** 370 MB added on a Galaxy A33, load and first sample together. Whether that
  fits a 2 GB phone is still to confirm on one.
- **Speed:** twice real time on a Galaxy A33 (see above). Two things hold it back, should a
  slower phone need more:
  - **Padded LSTMs cost the same every chunk.** The synthesizer's prosody LSTM runs over
    frames, so every chunk pays for all 296 steps, even a short one. The while-loop LSTM
    decomposition (`torch.export._patches.register_lstm_while_loop_decomposition`) would
    avoid that; Software Mansion imported it but left it disabled, so find out why first.
  - **Some ops are not delegated.** The LSTM steps, reflect padding, `atan2` and the phase
    filter's gathers run on ExecuTorch's portable kernels, not XNNPACK. The export prints
    which.
- **int8:** Paradee's 9 MB file is ONNX-specific weight-only quantization. ExecuTorch's
  XNNPACK quantizer could do something similar later. Ship fp32 first and listen.

## Quality: what is checked and what is not

- **Checked: the export against the reference.** Same frame counts, audio at the reference's
  own noise floor (above). The padded LSTMs are exact and the phase filter matches Paradee's
  to 1e-7, so neither is a risk.
- **Checked: fixed noise.** The harmonic source's Gaussian noise is a fixed buffer in the
  program. The distance to the reference is no larger for it.
- **Not checked: Phonemis against misaki.** Phonemis is a port, and unknown words fall back
  to its neural G2P rather than misaki's eSpeak fallback. Our Kokoro US voices already live
  with this, but Paradee is the more sensitive to spelling it did not train on. Worth a
  listen on real pages, and Paradee's own `wer.py` / `utmos.py` on its 200 held-out
  sentences through the app's phonemizer.

## Options considered and set aside

- **`onnxruntime-react-native`, running Paradee's int8 ONNX as is.** It needs no export, but it
  adds a second inference runtime to every install and requires a native build, so no OTA. It
  also makes the APK bigger for the very phones this is meant for. The app keeps one runtime.
- **Our own pipeline on the library's public primitives** (`loadModel`, `tensor`,
  `validateSpec`, `createPhonemizer`, `partition` are all exported). Only worth it if Paradee
  ever needs something the Kokoro pipeline cannot do. Today it does not.

## Where the files live

[huggingface.co/dr33m/paradee-8m-executorch](https://huggingface.co/dr33m/paradee-8m-executorch),
public, Apache 2.0, with a model card crediting Paradee and Kokoro. The app fetches from the
`v1` tag (`src/services/device-tts/paradee.ts`), the way the library pins Kokoro's files. A
new export is a new tag, a new address in that file, and a new key in `stores/tts.ts`, so
phones that have the old files keep them and are offered the download once more.

To publish one: upload the exported files with `huggingface_hub` (`upload_folder`, then
`create_tag`), from an environment logged in to that account. It is also worth offering the
files to Software Mansion's model registry.

## Next steps

1. Measure on a 2 to 3 GB phone or emulator. Until then, offering Paradee under the 3 GB
   wall is a claim, not a measurement, and so is where its disclaimer's bar sits.
2. Listen for the phonemizer difference above.
