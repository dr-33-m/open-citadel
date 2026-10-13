"""Check the two programs export_paradee_pte.py writes against Paradee's own ONNX file, on
this machine, before they go anywhere near a phone.

Runs them the way react-native-executorch's Kokoro pipeline does: tokens to the duration
predictor, each token index repeated over its frames, then the synthesizer. For each
sentence it reports the frames against the reference, how far the audio is from the
reference's in log-mel, and how fast it was made. The reference draws fresh noise on every
run, so two runs of it are compared too: that distance is the floor, and the export is fine
when it sits near it.

ONNX Runtime is only the reference here. The app runs the .pte files and nothing else.

  venv/bin/python verify_paradee_pte.py <out dir> <dir with paradee.onnx and config.json> [wav dir]
"""
import json, sys, time, warnings
import numpy as np, torch

warnings.filterwarnings("ignore")

SR, TICKS = 24000, 600
SENTENCES = [
    "The chickadee is a small songbird found across North America.",
    "In 1998, the company reported revenue of 4.2 billion dollars.",
    "Would you rather read the article now, or should I save it for later?",
    "It was the best of times, it was the worst of times, it was the age of wisdom.",
    "Chapter one.",
    "Yes.",
]


def logmel(x):
    """Log-mel frames of a waveform, loudness taken out."""
    x = torch.as_tensor(x, dtype=torch.float32); x = x / x.pow(2).mean().sqrt().clamp_min(1e-8)
    spec = torch.stft(x, 1024, 256, window=torch.hann_window(1024), return_complex=True).abs() ** 2
    hz = torch.linspace(0, SR / 2, 513); mel = 2595 * torch.log10(1 + hz / 700)
    edges = torch.linspace(0, float(mel[-1]), 82)
    bank = torch.stack([torch.clamp(torch.minimum((mel - edges[i]) / (edges[i + 1] - edges[i]),
                                                  (edges[i + 2] - mel) / (edges[i + 2] - edges[i + 1])), min=0)
                        for i in range(80)])
    return torch.log((bank @ spec).clamp_min(1e-5))

def distance(a, b):
    """Mean log-mel difference over the frames both have."""
    la, lb = logmel(a), logmel(b); n = min(la.shape[1], lb.shape[1])
    return (la[:, :n] - lb[:, :n]).abs().mean().item()


if __name__ == "__main__":
    out, ref = sys.argv[1], sys.argv[2]
    wavs = sys.argv[3] if len(sys.argv) > 3 else None
    import onnxruntime as ort
    from executorch.runtime import Runtime
    from misaki import en, espeak

    programs = {name: Runtime.get().load_program(f"{out}/{name}_paradee_xnnpack_fp32.pte")
                for name in ("duration_predictor", "synthesizer")}
    for name, program in programs.items():
        schema = json.loads(program.load_method("get_model_schema").execute([])[0])["forward"]
        ranges = sorted({(d["range"]["min"], d["range"]["max"]) for p in schema["inputs"] for d in p["shape"] if d["kind"] == "range"})
        print(f"{name}: schema ranges {ranges}, {len(schema['runtimeConstraints'])} constraints")
    predict, synthesize = (programs[name].load_method("forward") for name in ("duration_predictor", "synthesizer"))
    max_tokens = schema["inputs"][0]["shape"][1]["range"]["max"]
    max_frames = schema["inputs"][2]["shape"][0]["range"]["max"]

    vocab = json.load(open(f"{ref}/config.json", encoding="utf-8"))["vocab"]
    so = ort.SessionOptions(); so.intra_op_num_threads = 1; so.inter_op_num_threads = 1
    reference = ort.InferenceSession(f"{ref}/paradee.onnx", so, providers=["CPUExecutionProvider"])
    g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False), unk="")

    made = spoken = 0.0
    for i, sentence in enumerate(SENTENCES):
        ids = [0] + [vocab[c] for c in g2p(sentence)[0] if c in vocab] + [0]
        # The app never sends more than fits: the pipeline cuts a sentence into chunks first.
        if len(ids) > max_tokens:
            print(f"{i + 1}: {len(ids)} tokens is over the programs' {max_tokens}, skipped")
            continue
        tokens = torch.tensor([ids]); mask = torch.ones_like(tokens, dtype=torch.bool)
        t0 = time.perf_counter()
        durations, features = predict.execute([tokens, mask, torch.zeros(1, 128), torch.ones(1)])
        frames = int(durations.sum())
        if frames > max_frames:
            print(f"{i + 1}: {frames} frames is over the synthesizer's {max_frames}, skipped")
            continue
        indices = torch.repeat_interleave(torch.arange(len(ids)), durations)
        audio = synthesize.execute([tokens, mask, indices, features, torch.zeros(1, 256)])[0].reshape(-1).numpy()
        work = time.perf_counter() - t0
        assert len(audio) == TICKS * frames and np.isfinite(audio).all(), (len(audio), frames)

        feed = {"input_ids": np.array([ids], dtype=np.int64), "speed": np.ones(1, np.float32)}
        a, b = (reference.run(None, feed)[0][0] for _ in range(2))
        seconds = len(audio) / SR; made += work; spoken += seconds
        print(f"{i + 1}: {len(ids)} tokens, {frames} frames (reference {len(a) // TICKS}), "
              f"log-mel {distance(audio, a):.3f} from the reference (floor {distance(a, b):.3f}), "
              f"peak {np.abs(audio).max():.2f} (reference {np.abs(a).max():.2f}), "
              f"{seconds:.1f}s in {work:.2f}s")
        if wavs:
            import soundfile as sf
            sf.write(f"{wavs}/{i + 1}_pte.wav", audio, SR); sf.write(f"{wavs}/{i + 1}_onnx.wav", a, SR)
    print(f"{spoken:.1f}s of speech in {made:.1f}s on this machine: {spoken / made:.1f}x real time")
