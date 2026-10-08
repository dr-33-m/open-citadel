"""Draft: export Paradee-8M as the two ExecuTorch programs that react-native-executorch's
Kokoro pipeline already runs, so it loads through `createKokoroTextToSpeech` with no change
to the library. See PARADEE-PLAN.md for why and for what is verified so far.

  duration_predictor.forward(tokens i64[1,T], textMask bool[1,T], voiceRef f32[1,128], speed f32[1])
      -> (durations i64[T], durationFeatures f32[1,T,640])
  synthesizer.forward(tokens i64[1,T], textMask bool[1,T], indices i64[D],
                      durationFeatures f32[1,T,640], voiceRef f32[1,256])
      -> audio f32[1,1,600*D]

Paradee's voice is baked in (a learned style vector on each half), so both voiceRef inputs are
taken and ignored. Its duration features are 224 wide (hidden 192 + style 32), not Kokoro's 640,
so they are zero-padded to 640 on the way out and sliced back on the way in.

Status: the eager forward runs and the duration predictor passes torch.export with a dynamic
token axis. The synthesizer's export, the XNNPACK lowering, and the comparison against the
reference ONNX have not been run yet.

Run it in its own virtualenv, pinned to the runtime react-native-executorch 0.10.x carries
(the Kokoro .pte files it downloads are built for ExecuTorch 1.4.1):

  uv venv --python 3.12 && uv pip install executorch==1.4.1 transformers kokoro misaki[en]
  git clone https://github.com/sahilmahendrakar/paradee
  # text_side.pt and decoder.pt from huggingface.co/sahilmahendrakar/Paradee-8M-v1.0 (pytorch/)
  python export_paradee_pte.py <paradee clone> <weights dir> <out dir>
"""
import argparse, math, os, sys, time, warnings
import torch, torch.nn as nn, torch.nn.functional as F

warnings.filterwarnings("ignore")
ap = argparse.ArgumentParser()
ap.add_argument("repo"); ap.add_argument("weights"); ap.add_argument("out")
# Upper bounds of the two dynamic axes. The LSTMs run padded to these, so they are a cost on
# every chunk, not just a limit: keep them near the chunk sizes the app asks for (pace.ts).
ap.add_argument("--max-tokens", type=int, default=128)
ap.add_argument("--max-frames", type=int, default=1024)
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
sys.path.insert(0, os.path.join(A.repo, "training", "scripts"))

import kokoro.istftnet as ist
from student import TextStudent
from student_decoder import load_student_decoder

KOKORO_FEATURES = 640   # react-native-executorch's DURATION_FEATURE_DIM


# ---- ExecuTorch has no rand/randn kernels, and a float scale on a symbolic length cannot be
# exported. Deterministic noise and size-based interpolation, as kokoro-export does for Kokoro.
def hash_uniform(like, salt):
    n = torch.arange(like.numel(), dtype=torch.float32).reshape(like.shape)
    return torch.frac(torch.sin(n * 12.9898 + salt * 78.233) * 43758.5453).abs()

def hash_normal(like, salt):
    u1 = hash_uniform(like, salt).clamp_min(1e-6); u2 = hash_uniform(like, salt + 1.0)
    return torch.sqrt(-2 * torch.log(u1)) * torch.cos(2 * math.pi * u2)

def f02sine(self, f0_values):
    rad_values = (f0_values / self.sampling_rate) % 1          # initial phase 0 for every harmonic
    L = rad_values.shape[1]
    rad_values = F.interpolate(rad_values.transpose(1, 2), size=L // self.upsample_scale, mode="linear").transpose(1, 2)
    phase = torch.cumsum(rad_values, dim=1) * 2 * torch.pi
    phase = F.interpolate(phase.transpose(1, 2) * self.upsample_scale, size=L, mode="linear").transpose(1, 2)
    return torch.sin(phase)

def sinegen_forward(self, f0):
    fn = f0 * torch.arange(1, self.harmonic_num + 2, dtype=f0.dtype)[None, None]
    sine_waves = self._f02sine(fn) * self.sine_amp
    uv = self._f02uv(f0)
    noise = (uv * self.noise_std + (1 - uv) * self.sine_amp / 3) * hash_normal(sine_waves, 1.0)
    return sine_waves * uv + noise, uv, noise

def source_forward(self, x):
    sine_wavs, uv, _ = self.l_sin_gen(x)
    return self.l_tanh(self.l_linear(sine_wavs)), hash_normal(uv, 3.0) * self.sine_amp / 3, uv

def upsample1d_forward(self, x):
    return x if self.layer_type == "none" else F.interpolate(x, size=x.shape[-1] * 2, mode="nearest")

class SizedUpsample(nn.Module):
    def __init__(self, factor):
        super().__init__(); self.factor = int(factor)
    def forward(self, x):
        return F.interpolate(x, size=x.shape[-1] * self.factor, mode="nearest")

ist.SineGen._f02sine = f02sine
ist.SineGen.forward = sinegen_forward
ist.SourceModuleHnNSF.forward = source_forward
ist.UpSample1d.forward = upsample1d_forward


# ---- Paradee's own export pieces (phase filter, exact STFT, weight-norm strip), reused as-is.
src = open(os.path.join(A.repo, "training", "scripts", "export_paradee.py")).read()
head = src.split("held = torch.load")[0].replace(
    "A = ap.parse_args(); os.makedirs(A.out, exist_ok=True)", "A = ap.parse_args([])")
ns = {"__name__": "paradee_export_defs"}
exec(compile(head, "export_paradee.py", "exec"), ns)
Lock, ConvSTFT, strip, HOP, N_FFT = ns["Lock"], ns["ConvSTFT"], ns["strip"], ns["HOP"], ns["N_FFT"]


class ExportLock(Lock):
    """Lock.forward with the length kept symbolic: the original builds it with torch.tensor."""
    def forward(self, s, src, f0):
        k = s.shape[1]; src = src[:, :k]
        Sr, Si = self.stft(s); Er, Ei = self.stft(src)
        nf = Sr.shape[1]; j = torch.clamp(torch.arange(nf) * HOP // 300, max=f0.shape[1] - 1)
        v = (f0[0, j] > 60).float()[None]
        Em = torch.sqrt(Er ** 2 + Ei ** 2).clamp_min(1e-6)
        Rr, Ri = (Sr * Er + Si * Ei) / Em, (Si * Er - Sr * Ei) / Em
        sm = lambda z: F.conv1d(z[:, None], self.sk, padding=self.pad)[:, 0]
        Rr, Ri = sm(Rr), sm(Ri); Rm = torch.sqrt(Rr ** 2 + Ri ** 2).clamp_min(1e-12)
        Sm = torch.sqrt(Sr ** 2 + Si ** 2)
        ur, ui = (Er * Rr - Ei * Ri) / (Em * Rm), (Er * Ri + Ei * Rr) / (Em * Rm)
        Dr, Di = (Sm * ur - Sr) * v, (Sm * ui - Si) * v
        ola = F.conv_transpose1d(torch.cat([Dr, Di])[None], self.inv, stride=HOP)[0]
        env = F.conv_transpose1d(torch.ones(1, 1, nf), self.w2, stride=HOP)[0]
        return s + (ola / env.clamp_min(1e-8))[:, N_FFT // 2: N_FFT // 2 + k]


class PaddedLSTM(nn.Module):
    """Runs a batch-first LSTM over a fixed length, so its graph is static whatever the input
    length. A plain nn.LSTM specializes the dynamic axis to the example's size on export."""
    def __init__(self, lstm, size):
        super().__init__(); self.lstm, self.size = lstm, size
    def forward(self, x):
        t = x.shape[1]
        return self.lstm(F.pad(x, (0, 0, 0, self.size - t)))[0][:, :t], None


def load_models():
    ts = TextStudent("s+mlp").eval()
    ts.load_state_dict(torch.load(os.path.join(A.weights, "text_side.pt"), map_location="cpu", weights_only=True)["model"])
    ds = load_student_decoder("A", os.path.join(A.weights, "decoder.pt"), disable_complex=True)
    strip(ts); strip(ds)
    ds.generator.f0_upsamp = SizedUpsample(ds.generator.f0_upsamp.scale_factor)
    ds.generator.stft = ConvSTFT(ds.generator.stft.filter_length, ds.generator.stft.hop_length)
    return ts.eval(), ds.eval()


class DurationPredictor(nn.Module):
    def __init__(self, ts):
        super().__init__(); self.ts = ts; p = ts.predictor
        self.enc_lstms = nn.ModuleList([PaddedLSTM(b, A.max_tokens) if isinstance(b, nn.LSTM) else b
                                        for b in p.text_encoder.lstms])
        self.dur_lstm = PaddedLSTM(p.lstm, A.max_tokens)
        self.width = p.lstm.input_size      # hidden 192 + style 32

    def forward(self, tokens, text_mask, voice_ref, speed):
        t = self.ts; s = t.style
        d_en = t.bert_encoder(t.bert(tokens, attention_mask=text_mask.int())).transpose(-1, -2)
        sx = s[:, :, None].expand(-1, -1, tokens.shape[1])
        x = torch.cat([d_en, sx], 1)
        for b in self.enc_lstms:
            if isinstance(b, PaddedLSTM): x = b(x.transpose(-1, -2))[0].transpose(-1, -2)
            else: x = torch.cat([b(x.transpose(-1, -2), s).transpose(-1, -2), sx], 1)
        d = x.transpose(-1, -2)
        dur = torch.sigmoid(t.predictor.duration_proj(self.dur_lstm(d)[0])).sum(-1)[0]
        return torch.clamp(torch.round(dur / speed), min=1).long(), F.pad(d, (0, KOKORO_FEATURES - self.width))


class Synthesizer(nn.Module):
    def __init__(self, ts, ds):
        super().__init__(); self.ts, self.ds, self.lock = ts, ds, ExportLock(33)
        self.width = ts.predictor.lstm.input_size
        self.shared = PaddedLSTM(ts.predictor.shared, A.max_frames)
        self.text_lstm = PaddedLSTM(ts.text_encoder.lstm, A.max_tokens)
        # The phase filter needs the decoder's harmonic source, as in Paradee's own export.
        self.cap = {}
        ds.generator.m_source.register_forward_hook(lambda m, i, o: self.cap.__setitem__("src", o[0]))

    def forward(self, tokens, text_mask, indices, features, voice_ref):
        t = self.ts; p = t.predictor; style = t.style
        d = features[:, :, : self.width]
        aln = (torch.arange(tokens.shape[1])[:, None] == indices[None, :]).to(d.dtype)[None]   # [1,T,D]
        x, _ = self.shared((d.transpose(-1, -2) @ aln).transpose(-1, -2))
        F0 = x.transpose(-1, -2)
        for b in p.F0: F0 = b(F0, style)
        F0 = p.F0_proj(F0).squeeze(1)
        N = x.transpose(-1, -2)
        for b in p.N: N = b(N, style)
        N = p.N_proj(N).squeeze(1)
        e = t.text_encoder; h = e.embedding(tokens).transpose(1, 2)
        for c in e.cnn: h = c(h)
        asr_tok = t.asr_proj(self.text_lstm(h.transpose(1, 2))[0]).transpose(-1, -2)
        s = self.ds(asr_tok @ aln, F0, N).squeeze(1)                                     # [1, 600*D]
        return self.lock(s, self.cap["src"].squeeze(-1), F0)[:, None]


def example_tokens(n):
    ids = torch.randint(1, 178, (1, n), generator=torch.Generator().manual_seed(0))
    ids[0, 0] = ids[0, -1] = 0
    return ids


if __name__ == "__main__":
    from torch.export import Dim, export
    from executorch.exir import to_edge_transform_and_lower
    from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner

    ts, ds = load_models()
    dp, sy = DurationPredictor(ts).eval(), Synthesizer(ts, ds).eval()

    tokens = example_tokens(40); mask = torch.ones_like(tokens, dtype=torch.bool)
    with torch.no_grad():
        n, feats = dp(tokens, mask, torch.zeros(1, 128), torch.ones(1))
        idx = torch.repeat_interleave(torch.arange(tokens.shape[1]), n)
        audio = sy(tokens, mask, idx, feats, torch.zeros(1, 256))
    assert audio.shape[-1] == 600 * len(idx), audio.shape
    print(f"eager: {tokens.shape[1]} tokens -> {len(idx)} frames -> {audio.shape[-1]} samples")

    T = Dim("T", min=8, max=A.max_tokens)
    D = Dim("D", min=16, max=A.max_frames)
    programs = {
        "duration_predictor": export(dp, (tokens, mask, torch.zeros(1, 128), torch.ones(1)),
                                     dynamic_shapes=({1: T}, {1: T}, None, None), strict=False),
        "synthesizer": export(sy, (tokens, mask, idx, feats, torch.zeros(1, 256)),
                              dynamic_shapes=({1: T}, {1: T}, {0: D}, {1: T}, None), strict=False),
    }
    for name, ep in programs.items():
        t0 = time.time()
        prog = to_edge_transform_and_lower(ep, partitioner=[XnnpackPartitioner()]).to_executorch()
        path = f"{A.out}/{name}_paradee_xnnpack_fp32.pte"
        with open(path, "wb") as f: prog.write_to_file(f)
        print(f"{name}: {os.path.getsize(path) / 1e6:.1f} MB in {time.time() - t0:.0f}s")
