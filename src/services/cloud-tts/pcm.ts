/**
 * The maker's PCM, turned into what Readium's native player takes.
 *
 * The speech route answers signed 16-bit little-endian samples as they are
 * made; the native engine plays mono Float32 (`ttsProvideAudioChunk`). So
 * each network chunk is converted as it lands rather than once at the end,
 * which is what lets the first words play while the rest is still coming.
 *
 * A network chunk does not end on a sample boundary. Two bytes make a sample
 * and a stereo frame is four, so whatever is left over from one chunk is
 * kept and finished by the next; dropping it would put a click in the audio
 * and, worse, shift every following byte into the wrong half of its sample.
 *
 * Pure, and stateful only in the carried bytes, so it can be tested alone.
 */

export class PcmDecoder {
  private carry = new Uint8Array(0);
  private readonly frameBytes: number;

  constructor(private readonly channels: number = 1) {
    this.frameBytes = 2 * Math.max(1, Math.floor(channels));
  }

  /** The whole frames this chunk completes, as mono Float32 in [-1, 1). */
  push(bytes: Uint8Array): Float32Array {
    let data = bytes;
    if (this.carry.length > 0) {
      data = new Uint8Array(this.carry.length + bytes.length);
      data.set(this.carry, 0);
      data.set(bytes, this.carry.length);
    }
    const frames = Math.floor(data.length / this.frameBytes);
    const used = frames * this.frameBytes;
    this.carry = data.slice(used);

    const out = new Float32Array(frames);
    const view = new DataView(data.buffer, data.byteOffset, used);
    const channels = this.frameBytes / 2;
    for (let frame = 0; frame < frames; frame++) {
      // Stereo is folded to mono by averaging: the native player has one
      // channel, and a voice is the same in both.
      let sum = 0;
      for (let channel = 0; channel < channels; channel++) {
        sum += view.getInt16((frame * channels + channel) * 2, true);
      }
      out[frame] = sum / channels / 32768;
    }
    return out;
  }

  /** Bytes left over that never made a whole frame. Zero after a clean stream. */
  get pending(): number {
    return this.carry.length;
  }
}

/** The bytes of a Float32Array, exactly, however it views its buffer. */
export function floatBytes(samples: Float32Array): ArrayBuffer {
  return samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength) as ArrayBuffer;
}
