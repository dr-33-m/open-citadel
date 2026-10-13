"""Export Paradee-8M as the two ExecuTorch programs that react-native-executorch's Kokoro
pipeline already runs, so it loads through `createKokoroTextToSpeech` with no change to the
library. See PARADEE-PLAN.md for why.

  duration_predictor.forward(tokens i64[1,T], textMask bool[1,T], voiceRef f32[1,128], speed f32[1])
      -> (durations i64[T], durationFeatures f32[1,T,640])
  synthesizer.forward(tokens i64[1,T], textMask bool[1,T], indices i64[D],
                      durationFeatures f32[1,T,640], voiceRef f32[1,256])
      -> audio f32[1,1,600*D]

Each program also carries `get_model_schema`, the JSON the library reads the dynamic sizes
from: without it a .pte is taken to have fixed shapes and the pipeline refuses it.

Paradee's voice is baked in (a learned style vector on each half), so both voiceRef inputs are
taken and ignored, and the voice file is one row of zeros. Its duration features are 224 wide
(hidden 192 + style 32), not Kokoro's 640, so they are zero-padded to 640 on the way out and
sliced back on the way in.

Run it in its own virtualenv, pinned to the runtime react-native-executorch 0.10.x carries
(the Kokoro .pte files it downloads are built for ExecuTorch 1.4.1):

  python3 -m venv venv
  venv/bin/pip install executorch==1.4.1 --extra-index-url https://download.pytorch.org/whl/cpu
  venv/bin/pip install transformers kokoro "misaki[en]" onnxruntime soundfile
  git clone https://github.com/sahilmahendrakar/paradee
  # text_side.pt and decoder.pt from huggingface.co/sahilmahendrakar/Paradee-8M-v1.0 (pytorch/)
  venv/bin/python export_paradee_pte.py <paradee clone> <weights dir> <out dir>

Then check the result with verify_paradee_pte.py, and after that on a phone: this machine's
runtime does not show what XNNPACK allocates there (the plan's note on wide convolutions).
"""
import argparse, json, os, sys, time, warnings
import torch, torch.nn as nn, torch.nn.functional as F
from torch.export import Dim, export
from executorch.exir import to_edge_transform_and_lower
from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner
from executorch.devtools.backend_debug import get_delegation_info

warnings.filterwarnings("ignore")

KOKORO_FEATURES = 640   # react-native-executorch's DURATION_FEATURE_DIM
TICKS = 600             # samples per duration frame, KOKORO_TICKS_PER_DURATION
VOICE = "pd_heart"

ap = argparse.ArgumentParser()
ap.add_argument("repo"); ap.add_argument("weights"); ap.add_argument("out")
# The two dynamic axes. The LSTMs run padded to the upper bounds, so those are a cost on every
# chunk and not just a limit. The defaults are the bounds of the library's own Kokoro export,
# apart from the token minimum: Kokoro's is 8, which pads anything shorter than six phonemes.
ap.add_argument("--min-tokens", type=int, default=3)
ap.add_argument("--max-tokens", type=int, default=128)
ap.add_argument("--min-frames", type=int, default=16)
ap.add_argument("--max-frames", type=int, default=296)


class SizedUpsample(nn.Module):
    """nn.Upsample by a whole factor. A float scale on a symbolic length cannot be exported."""
    def __init__(self, factor):
        super().__init__(); self.factor = int(factor)
    def forward(self, x):
        return F.interpolate(x, size=x.shape[-1] * self.factor, mode="nearest")


class Recurrence(nn.Module):
    """An LSTM's steps, both directions at once as a batch of two, given what the input adds
    to the gates at every step: pre f32[2, size, 4H] -> hidden f32[2, size, H]. Written out
    step by step because the exporter has no LSTM that keeps a dynamic length, and kept apart
    as a module so the partitioner can tell these ops from the rest (`OffTheSteps`)."""
    def __init__(self, w_hh, size):
        super().__init__(); self.size = size; self.hidden = w_hh.shape[1]
        self.register_buffer("w", w_hh)                      # [2, H, 4H]
    def forward(self, pre):
        H = self.hidden; h = pre.new_zeros(2, 1, H); c = pre.new_zeros(2, H); out = []
        for t in range(self.size):
            g = pre[:, t] + torch.bmm(h, self.w)[:, 0]       # gates in PyTorch's order: i, f, g, o
            s = torch.sigmoid(g)
            c = s[:, H: 2 * H] * c + s[:, :H] * torch.tanh(g[:, 2 * H: 3 * H])
            h = (s[:, 3 * H:] * torch.tanh(c))[:, None]
            out.append(h)
        return torch.cat(out, 1)


class PaddedLSTM(nn.Module):
    """A one-layer bidirectional LSTM run over a fixed number of steps, so its graph is static
    whatever the input length. Exact, not an approximation: the backward half reads the input
    reversed, so the padding always comes after the real steps and neither half is changed by
    it. The input's share of the gates is two plain linear layers over the real steps."""
    def __init__(self, lstm, size):
        super().__init__(); self.size = size
        assert lstm.num_layers == 1 and lstm.bidirectional and lstm.batch_first
        self.inputs = nn.ModuleList()
        for suffix in ("_l0", "_l0_reverse"):
            half = nn.Linear(lstm.input_size, 4 * lstm.hidden_size)
            half.weight.data.copy_(getattr(lstm, "weight_ih" + suffix).data)
            half.bias.data.copy_((getattr(lstm, "bias_ih" + suffix) + getattr(lstm, "bias_hh" + suffix)).data)
            self.inputs.append(half)
        self.steps = Recurrence(torch.stack([lstm.weight_hh_l0.data.T, lstm.weight_hh_l0_reverse.data.T]), size)
    def forward(self, x):
        t = x.shape[1]; along = torch.arange(t); back = (t - 1) - along
        pre = torch.cat([self.inputs[0](x), self.inputs[1](x.index_select(1, back))])
        out = self.steps(F.pad(pre, (0, 0, 0, self.size - t)))
        # Gathers, not slices: a slice that might be the whole of the padded length makes the
        # exporter ask which it is, and that pins the length.
        return torch.cat([out[:1].index_select(1, along), out[1:].index_select(1, back)], -1), None


class OffTheSteps(XnnpackPartitioner):
    """XNNPACK for everything but the LSTMs' steps. Those are thousands of ops on a hundred
    numbers each: as delegates they cost more to enter than to run, and the partitioner's
    merging, which is quadratic in them, does not finish."""
    def get_matched_nodes_from_configs(self, ep):
        def stepped(node):
            return any("Recurrence" in str(kind) for _, kind in node.meta.get("nn_module_stack", {}).values())
        return [group for group in super().get_matched_nodes_from_configs(ep) if not any(map(stepped, group))]


def patch_kokoro(ist, max_samples):
    """ExecuTorch has no rand or randn kernels, and a float scale on a symbolic length cannot
    be exported. Kokoro's harmonic source uses both."""
    noise = torch.randn(1, max_samples, 9, generator=torch.Generator().manual_seed(0))

    def f02sine(self, f0_values):
        # Kokoro adds a random phase to the first sample of every harmonic, but the
        # downsampling below never reads that sample (it starts half a hop in), so the phase
        # it means to add is lost there too. Leaving it out changes nothing.
        rad = (f0_values / self.sampling_rate) % 1
        n = rad.shape[1]
        rad = F.interpolate(rad.transpose(1, 2), size=n // self.upsample_scale, mode="linear").transpose(1, 2)
        phase = torch.cumsum(rad, dim=1) * 2 * torch.pi
        phase = F.interpolate(phase.transpose(1, 2) * self.upsample_scale, size=n, mode="linear").transpose(1, 2)
        return torch.sin(phase)

    def sinegen_forward(self, f0):
        fn = f0 * torch.arange(1, self.harmonic_num + 2, dtype=f0.dtype)[None, None]
        sine_waves = self._f02sine(fn) * self.sine_amp
        uv = self._f02uv(f0)
        # The same Gaussian noise every time, kept in the program: this is what the unvoiced
        # sounds are made from, so it stays real noise and not a hash that stands in for it.
        fixed = self.noise[:, : sine_waves.shape[1]]
        return sine_waves * uv + (uv * self.noise_std + (1 - uv) * self.sine_amp / 3) * fixed, uv, fixed

    def source_forward(self, x):
        sine_wavs, uv, _ = self.l_sin_gen(x)
        return self.l_tanh(self.l_linear(sine_wavs)), uv, uv   # the generator only reads the first

    def upsample1d_forward(self, x):
        return x if self.layer_type == "none" else F.interpolate(x, size=x.shape[-1] * 2, mode="nearest")

    def adain_forward(self, x, s):
        # InstanceNorm1d written out, as Software Mansion did for Kokoro, and written so
        # that all of it runs on XNNPACK. That matters more than it looks: each stretch of
        # XNNPACK ops between two ops it does not take keeps its own scratch memory, so
        # seventy of these each cutting the decoder in two cost about a gigabyte on a phone.
        # XNNPACK takes a mean only over the last two axes of four, hence the extra axis.
        # The style is the same on every run (it is Paradee's one voice), so what it
        # multiplies and adds is worked out once, on the first run, and kept.
        if not hasattr(self, "gain"):
            gamma, beta = torch.chunk(self.fc(s)[:, :, None], 2, dim=1)
            weight, bias = self.norm.weight[None, :, None], self.norm.bias[None, :, None]
            self.register_buffer("gain", ((1 + gamma) * weight).detach())
            self.register_buffer("offset", ((1 + gamma) * bias + beta).detach())
        channels = x.shape[1]   # reshapes, not squeezes: XNNPACK leaves a squeeze to the slow path
        mean = lambda z: z.reshape(1, channels, -1, 1).mean((2, 3), keepdim=True).reshape(1, channels, 1)
        centred = x - mean(x)
        return centred * torch.rsqrt(mean(centred * centred) + self.norm.eps) * self.gain + self.offset

    def resblock1_forward(self, x, s):
        # Snake, with 1 / alpha kept as a constant in place of a division on every run.
        if not hasattr(self, "inverse1"):
            self.register_buffer("inverse1", torch.stack([1 / a.detach() for a in self.alpha1]))
            self.register_buffer("inverse2", torch.stack([1 / a.detach() for a in self.alpha2]))
        for i, (c1, c2, n1, n2, a1, a2) in enumerate(zip(self.convs1, self.convs2, self.adain1, self.adain2, self.alpha1, self.alpha2)):
            xt = n1(x, s); wave = torch.sin(a1 * xt)
            xt = c1(xt + self.inverse1[i] * wave * wave)
            xt = n2(xt, s); wave = torch.sin(a2 * xt)
            x = c2(xt + self.inverse2[i] * wave * wave) + x
        return x

    def resblk_forward(self, x, s):
        return (self._residual(x, s) + self._shortcut(x)) * 0.7071067811865476

    ist.AdaIN1d.forward = adain_forward
    ist.AdaINResBlock1.forward = resblock1_forward
    ist.AdainResBlk1d.forward = resblk_forward
    ist.SineGen._f02sine = f02sine
    ist.SineGen.forward = sinegen_forward
    ist.SourceModuleHnNSF.forward = source_forward
    ist.UpSample1d.forward = upsample1d_forward
    return noise


def paradee_defs(repo):
    """Paradee's own export pieces (phase filter, exact STFT, weight-norm strip), reused as-is:
    the part of its export script before it starts loading data."""
    src = open(os.path.join(repo, "training", "scripts", "export_paradee.py")).read()
    head = src.split("held = torch.load")[0].replace(
        "A = ap.parse_args(); os.makedirs(A.out, exist_ok=True)", "A = ap.parse_args([])")
    ns = {"__name__": "paradee_export_defs"}
    exec(compile(head, "export_paradee.py", "exec"), ns)
    return ns


def build(A):
    """The two halves as modules, ready to run eagerly or to export."""
    sys.path.insert(0, os.path.join(A.repo, "training", "scripts"))
    import kokoro.istftnet as ist
    noise = patch_kokoro(ist, TICKS * A.max_frames)
    from student import TextStudent
    from student_decoder import load_student_decoder
    P = paradee_defs(A.repo)
    Lock, ConvSTFT, strip, HOP, N_FFT = P["Lock"], P["ConvSTFT"], P["strip"], P["HOP"], P["N_FFT"]

    class ExportLock(Lock):
        """Lock.forward, made exportable and kept off wide convolutions.

        The original's transforms are 1024-tap convolutions, and XNNPACK on a phone lays out
        a table for each that grows with the taps times the length: gigabytes for one sentence,
        which gets the app killed. They are the same sums as a matrix product over windows cut
        a hop apart, so that is how they are done here: cut, multiply, add back.

        The original also builds the length with torch.tensor, and cuts the result with a
        slice whose bound the exporter cannot prove holds for every length, so the cut is a
        gather."""
        def __init__(self, L):
            super().__init__(L)
            self.steps = N_FFT // HOP
            self.register_buffer("analyse", self.fwd[:, 0].contiguous())        # [2K, N]
            self.register_buffer("rebuild", self.inv[:, 0].t().contiguous())    # [N, 2K]
            self.register_buffer("window2", self.w2[0].contiguous())            # [1, N]

        def overlap(self, y):
            """Windows [B, nf, N_FFT] added back a hop apart: [B, (nf + 3) hops]."""
            parts = y.unflatten(2, (self.steps, HOP))
            last = self.steps - 1
            total = F.pad(parts[:, :, 0], (0, 0, 0, last))
            for i in range(1, self.steps):
                total = total + F.pad(parts[:, :, i], (0, 0, i, last - i))
            return total.flatten(1)

        def forward(self, s, src, f0):
            k = s.shape[1]; half = N_FFT // 2; K = self.analyse.shape[0] // 2
            both = F.pad(torch.cat([s, src[:, :k]])[:, None], (half, half), mode="reflect")[:, 0]
            # Each window's samples, gathered by position: [nf, N_FFT] for either signal.
            at = torch.arange(k // HOP + 1)[:, None] * HOP + torch.arange(N_FFT)[None]
            S, E = (F.linear(both[i][at], self.analyse).t() for i in range(2))
            Sr, Si, Er, Ei = S[:K], S[K:], E[:K], E[K:]
            nf = Sr.shape[1]; j = torch.clamp(torch.arange(nf) * HOP // 300, max=f0.shape[1] - 1)
            v = (f0[0].index_select(0, j) > 60).float()[None]
            Em = torch.sqrt(Er ** 2 + Ei ** 2).clamp_min(1e-6)
            R = torch.cat([(Sr * Er + Si * Ei) / Em, (Si * Er - Sr * Ei) / Em])
            R = F.conv1d(R[:, None], self.sk, padding=self.pad)[:, 0]; Rr, Ri = R[:K], R[K:]
            Rm = torch.sqrt(Rr ** 2 + Ri ** 2).clamp_min(1e-12)
            Sm = torch.sqrt(Sr ** 2 + Si ** 2)
            ur, ui = (Er * Rr - Ei * Ri) / (Em * Rm), (Er * Ri + Ei * Rr) / (Em * Rm)
            Dr, Di = (Sm * ur - Sr) * v, (Sm * ui - Si) * v
            back = F.linear(torch.cat([Dr, Di]).t(), self.rebuild)
            added = self.overlap(torch.stack([back, self.window2.expand(nf, N_FFT)]))
            ola, env = added[:1], added[1:]
            return s + (ola / env.clamp_min(1e-8)).index_select(1, torch.arange(k) + half)

    ts = TextStudent("s+mlp").eval()
    ts.load_state_dict(torch.load(os.path.join(A.weights, "text_side.pt"), map_location="cpu", weights_only=True)["model"])
    ds = load_student_decoder("A", os.path.join(A.weights, "decoder.pt"), disable_complex=True)
    strip(ts); strip(ds)
    g = ds.generator
    g.f0_upsamp = SizedUpsample(g.f0_upsamp.scale_factor)
    g.stft = ConvSTFT(g.stft.filter_length, g.stft.hop_length)
    g.m_source.l_sin_gen.register_buffer("noise", noise)
    ts, ds = ts.eval(), ds.eval()

    class DurationPredictor(nn.Module):
        def __init__(self):
            super().__init__(); self.ts = ts; p = ts.predictor
            self.enc = nn.ModuleList([PaddedLSTM(b, A.max_tokens) if isinstance(b, nn.LSTM) else b
                                      for b in p.text_encoder.lstms])
            self.dur_lstm = PaddedLSTM(p.lstm, A.max_tokens)
            self.width = p.lstm.input_size      # hidden 192 + style 32

        def forward(self, tokens, text_mask, voice_ref, speed):
            t = self.ts; s = t.style
            d_en = t.bert_encoder(t.bert(tokens, attention_mask=text_mask.int())).transpose(-1, -2)
            sx = s[:, :, None].expand(-1, -1, tokens.shape[1])
            x = torch.cat([d_en, sx], 1)
            for b in self.enc:
                if isinstance(b, PaddedLSTM): x = b(x.transpose(-1, -2))[0].transpose(-1, -2)
                else: x = torch.cat([b(x.transpose(-1, -2), s).transpose(-1, -2), sx], 1)
            d = x.transpose(-1, -2)
            dur = torch.sigmoid(t.predictor.duration_proj(self.dur_lstm(d)[0])).sum(-1)[0]
            return torch.clamp(torch.round(dur / speed), min=1).long(), F.pad(d, (0, KOKORO_FEATURES - self.width))

    class Synthesizer(nn.Module):
        def __init__(self):
            super().__init__(); self.ts, self.ds, self.lock = ts, ds, ExportLock(33)
            self.width = ts.predictor.lstm.input_size
            self.shared = PaddedLSTM(ts.predictor.shared, A.max_frames)
            self.text_lstm = PaddedLSTM(ts.text_encoder.lstm, A.max_tokens)
            # The phase filter needs the decoder's harmonic source, as in Paradee's own export.
            self.cap = {}
            g.m_source.register_forward_hook(lambda m, i, o: self.cap.__setitem__("src", o[0]))

        def forward(self, tokens, text_mask, indices, features, voice_ref):
            t = self.ts; p = t.predictor; style = t.style
            # Each token's features, repeated over its frames.
            x, _ = self.shared(features[:, :, : self.width].index_select(1, indices))
            # Transposed once for both branches. Twice, the two are folded into one output
            # that a delegate then lists twice, which XNNPACK refuses.
            F0 = N = x.transpose(-1, -2)
            for b in p.F0: F0 = b(F0, style)
            F0 = p.F0_proj(F0).squeeze(1)
            for b in p.N: N = b(N, style)
            N = p.N_proj(N).squeeze(1)
            e = t.text_encoder; h = e.embedding(tokens).transpose(1, 2)
            for c in e.cnn: h = c(h)
            asr = t.asr_proj(self.text_lstm(h.transpose(1, 2))[0]).index_select(1, indices).transpose(-1, -2)
            s = self.ds(asr, F0, N).squeeze(1)                                    # [1, 600*D]
            return self.lock(s, self.cap["src"].squeeze(-1), F0)[:, None]

    return DurationPredictor().eval(), Synthesizer().eval()


def example_tokens(n):
    ids = torch.randint(1, 178, (1, n), generator=torch.Generator().manual_seed(0))
    ids[0, 0] = ids[0, -1] = 0
    return ids


# ---- get_model_schema: the shape of what react-native-executorch's own Kokoro files carry.
def const(n): return {"kind": "constant", "value": n}
def span(lo, hi, step=1): return {"kind": "range", "range": {"min": lo, "max": hi, "step": step}}
def tensor(dtype, *shape): return {"kind": "Tensor", "dtype": dtype, "shape": list(shape)}
def dim(side, tensor_idx, dim_idx): return {"paramSide": side, "tensorIdx": tensor_idx, "dimIdx": dim_idx}

def schemas(A):
    T, D = span(A.min_tokens, A.max_tokens), span(A.min_frames, A.max_frames)
    return {
        "duration_predictor": {"forward": {
            "inputs": [tensor("int64", const(1), T), tensor("bool", const(1), T),
                       tensor("float32", const(1), const(128)), tensor("float32", const(1))],
            "outputs": [tensor("int64", T), tensor("float32", const(1), T, const(KOKORO_FEATURES))],
            "runtimeConstraints": [{"kind": "equality", "dims": [
                dim("input", 0, 1), dim("input", 1, 1), dim("output", 0, 0), dim("output", 1, 1)]}],
        }},
        "synthesizer": {"forward": {
            "inputs": [tensor("int64", const(1), T), tensor("bool", const(1), T), tensor("int64", D),
                       tensor("float32", const(1), T, const(KOKORO_FEATURES)), tensor("float32", const(1), const(256))],
            "outputs": [tensor("float32", const(1), const(1), span(TICKS * A.min_frames, TICKS * A.max_frames, TICKS))],
            "runtimeConstraints": [
                {"kind": "equality", "dims": [dim("input", 0, 1), dim("input", 1, 1), dim("input", 3, 1)]},
                {"kind": "linear", "dimLhs": dim("output", 0, 2), "dimRhs": dim("input", 2, 0), "coefficients": [TICKS, 0]}],
        }},
    }


if __name__ == "__main__":
    A = ap.parse_args()
    os.makedirs(os.path.join(A.out, "voices"), exist_ok=True)
    dp, sy = build(A)

    # The rewritten LSTM against PyTorch's own, at a length shorter than its padding.
    probe = nn.LSTM(20, 6, batch_first=True, bidirectional=True); x = torch.randn(1, 9, 20)
    with torch.no_grad(): drift = (PaddedLSTM(probe, 16)(x)[0] - probe(x)[0]).abs().max().item()
    assert drift < 1e-5, drift

    # Run once before exporting, and not only as a check: the first run is where the
    # constants that depend on the voice are worked out (`patch_kokoro`).
    tokens = example_tokens(40); mask = torch.ones_like(tokens, dtype=torch.bool)
    with torch.no_grad():
        n, feats = dp(tokens, mask, torch.zeros(1, 128), torch.ones(1))
        idx = torch.repeat_interleave(torch.arange(tokens.shape[1]), n)
        audio = sy(tokens, mask, idx, feats, torch.zeros(1, 256))
    assert audio.shape[-1] == TICKS * len(idx), audio.shape
    print(f"eager: {tokens.shape[1]} tokens -> {len(idx)} frames -> {audio.shape[-1]} samples")

    T = Dim("T", min=A.min_tokens, max=A.max_tokens)
    D = Dim("D", min=A.min_frames, max=A.max_frames)
    jobs = {
        "duration_predictor": lambda: export(dp, (tokens, mask, torch.zeros(1, 128), torch.ones(1)),
                                             dynamic_shapes=({1: T}, {1: T}, None, None), strict=False),
        "synthesizer": lambda: export(sy, (tokens, mask, idx, feats, torch.zeros(1, 256)),
                                      dynamic_shapes=({1: T}, {1: T}, {0: D}, {1: T}, None), strict=False),
    }
    spec = schemas(A)
    for name, job in jobs.items():
        t0 = time.time(); ep = job()
        print(f"{name}: traced in {time.time() - t0:.0f}s, {len(ep.graph.nodes)} nodes", flush=True)
        edge = to_edge_transform_and_lower({"forward": ep}, partitioner=[OffTheSteps()],
                                           constant_methods={"get_model_schema": json.dumps(spec[name])})
        info = get_delegation_info(edge.exported_program("forward").graph_module)
        path = f"{A.out}/{name}_paradee_xnnpack_fp32.pte"
        with open(path, "wb") as f: edge.to_executorch().write_to_file(f)
        print(f"{name}: {os.path.getsize(path) / 1e6:.1f} MB in {time.time() - t0:.0f}s, "
              f"{info.num_delegated_nodes} of {info.num_delegated_nodes + info.num_non_delegated_nodes} ops on XNNPACK")
        left = info.get_operator_delegation_dataframe()
        left = left[(left["occurrences_in_non_delegated_graphs"] > 0) & (left["op_type"] != "Total")]
        print("  not delegated: " + ", ".join(f"{r.op_type} x{r.occurrences_in_non_delegated_graphs}" for r in left.itertuples()))

    # One row of zeros: the pipeline wants a voice file for every voice, and reads a row of it.
    with open(f"{A.out}/voices/{VOICE}.bin", "wb") as f: f.write(bytes(4 * 256))
    print(f"voice: {A.out}/voices/{VOICE}.bin")
