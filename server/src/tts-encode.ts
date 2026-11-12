/**
 * MP3 for a voice that only makes PCM (Gemini), encoded as it streams.
 *
 * The app asks for MP3 because it is a tenth of the bytes: a walking listener
 * downloads about 20 MB an hour instead of 173, and the audiobook keeps each
 * sentence as a file its native player opens. Most makers answer MP3
 * themselves; for the ones that do not, the PCM goes through ffmpeg here,
 * stdin to stdout, so the first words still go out while the rest is being
 * made.
 *
 * Mono, 64 kbps CBR, and no Xing header: a stream cannot go back to fill one
 * in, and a header with the wrong frame count is worse than none (the app
 * measures a sentence's length from its frames).
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface PcmShape {
  sampleRate: number;
  channels: number;
}

type Spawn = (command: string, args: string[]) => ChildProcessWithoutNullStreams;

let available: boolean | null = null;

/** Whether ffmpeg is on this machine. Asked once. */
export function canEncodeMp3(): boolean {
  if (available === null) {
    try {
      available = spawnSync('ffmpeg', ['-hide_banner', '-version'], { stdio: 'ignore', timeout: 5_000 }).status === 0;
    } catch {
      available = false;
    }
  }
  return available;
}

/** The arguments for raw 16-bit PCM in, MP3 out. Pure, so it can be tested on its own. */
export function encoderArgs(shape: PcmShape): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 's16le',
    '-ar', String(shape.sampleRate),
    '-ac', String(shape.channels),
    '-i', 'pipe:0',
    '-ac', '1',
    '-c:a', 'libmp3lame',
    '-b:a', '64k',
    '-write_xing', '0',
    '-id3v2_version', '0',
    '-flush_packets', '1',
    '-f', 'mp3',
    'pipe:1',
  ];
}

/**
 * PCM in, MP3 out, as it comes. `onSourceBytes` counts what the maker sent
 * (what the piece is charged on); the stream errors if ffmpeg fails, and
 * cancelling it stops both the maker's stream and ffmpeg.
 */
export function pcmToMp3(
  source: ReadableStream<Uint8Array>,
  shape: PcmShape,
  options: { onSourceBytes?: (bytes: number) => void; spawnImpl?: Spawn } = {},
): ReadableStream<Uint8Array> {
  const run: Spawn = options.spawnImpl ?? ((command, args) => spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] }));
  const encoder = run('ffmpeg', encoderArgs(shape));
  const reader = source.getReader();
  let stderr = '';
  encoder.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-500);
  });

  // The maker's PCM into ffmpeg, minding its back-pressure.
  const feed = async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        options.onSourceBytes?.(value.byteLength);
        if (!encoder.stdin.write(value)) await new Promise((resolve) => encoder.stdin.once('drain', resolve));
      }
      encoder.stdin.end();
    } catch {
      encoder.kill('SIGKILL');
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      void feed();
      encoder.stdout.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      encoder.on('close', (code) => {
        if (code === 0) controller.close();
        else controller.error(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
      });
      encoder.on('error', (error) => controller.error(error));
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => undefined);
      encoder.kill('SIGKILL');
    },
  });
}
