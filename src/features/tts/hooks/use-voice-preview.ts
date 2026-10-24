import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { disposeAudioPlayer } from '@/lib/audio-player';
import { AI_VOICES_SUPPORTED, DEVICE_VOICE, voiceLabel, type ReaderVoice } from '@/services/device-tts/catalogue';
import { synthesize } from '@/services/device-tts/engine';
import { deviceSpeech } from '@/services/device-tts/speech';
import { encodeWav } from '@/utils/wav';

function previewText(voice: ReaderVoice): string {
  const name = voice === DEVICE_VOICE ? 'your device voice' : voiceLabel(voice);
  return `Hi, I'm ${name}. Welcome to Open Citadel, your personal knowledge companion.`;
}

/**
 * Plays a short spoken sample of an AI voice — picking a voice by name
 * alone in `TtsSettingsPanel` doesn't tell you much about how it sounds.
 *
 * Synthesizes through the same `device-tts/engine.ts` singleton the reader
 * uses, then writes the result to a scratch WAV file and plays it with
 * `expo-audio` — there's no reader/navigator around to play through when
 * this is opened from Settings, so this can't reuse Readium's own native
 * playback the way an active reading session does.
 */
export function useVoicePreview() {
  const [previewingVoice, setPreviewingVoice] = useState<ReaderVoice | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  // Whether the sample asked for can be heard yet. An Enhanced voice is made
  // on the phone before it plays, which on a slower one is several seconds of
  // silence after the press (a Galaxy A33 took 3.7 to 7.3 for Kokoro). Until
  // sound starts the press has to show it was taken, or it reads as ignored.
  const [audible, setAudible] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every `preview`/`stop` call so a synthesis or file write that's
  // still in flight when a newer call (or unmount) supersedes it can tell and
  // avoid starting playback nobody asked for anymore.
  const generationRef = useRef(0);

  const stopPlayer = useCallback(() => {
    if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    playbackTimerRef.current = null;
    disposeAudioPlayer(playerRef.current);
    playerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    stopPlayer();
    void deviceSpeech()?.stop().catch(() => undefined);
    setPreviewingVoice(null);
  }, [stopPlayer]);

  const playDeviceVoice = useCallback((generation: number, voice: ReaderVoice) => {
    if (generation !== generationRef.current) return;
    const speech = deviceSpeech();
    if (!speech) {
      setPreviewingVoice(null);
      setPreviewError('Install a new build to use the device voice.');
      return;
    }
    setPreviewingVoice(voice);
    // The phone's own voice starts as it is asked, so there is nothing to wait through.
    setAudible(true);
    setPreviewNotice(voice === DEVICE_VOICE ? null : `${voiceLabel(voice)} is unavailable. Playing the device voice instead.`);
    try {
      speech.speak(previewText(DEVICE_VOICE), {
        language: 'en-US',
        onDone: () => {
          if (generation === generationRef.current) setPreviewingVoice(null);
        },
        onStopped: () => {
          if (generation === generationRef.current) setPreviewingVoice(null);
        },
        onError: (error) => {
          if (generation === generationRef.current) {
            setPreviewingVoice(null);
            setPreviewError(error.message || 'The device voice could not play.');
          }
        },
      });
    } catch (error) {
      setPreviewingVoice(null);
      setPreviewError(error instanceof Error ? error.message : 'The device voice could not play.');
    }
  }, []);

  const preview = useCallback(
    async (voice: ReaderVoice) => {
      const generation = ++generationRef.current;
      stopPlayer();
      // Said before anything is waited on, so the press is answered in its
      // own frame: the row shows it is working from the moment it is touched.
      setPreviewError(null);
      setPreviewNotice(null);
      setAudible(false);
      setPreviewingVoice(voice);
      await deviceSpeech()?.stop().catch(() => undefined);
      if (generation !== generationRef.current) return;

      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
          interruptionMode: 'doNotMix',
        });
        if (generation !== generationRef.current) return;
        // Never load Kokoro on a phone too small to hold it: the native
        // runtime is killed outright on out-of-memory, which no catch can
        // survive.
        if (voice === DEVICE_VOICE || !AI_VOICES_SUPPORTED) {
          playDeviceVoice(generation, voice);
          return;
        }
        const chunks: Float32Array[] = [];
        let sampleRate = 24000;
        for await (const chunk of synthesize(previewText(voice), { voice, speed: 1 })) {
          if (generation !== generationRef.current) return;
          chunks.push(chunk.audio);
          sampleRate = chunk.sampleRate;
        }
        if (generation !== generationRef.current) return;

        if (!chunks.some((chunk) => chunk.some((sample) => Number.isFinite(sample) && Math.abs(sample) > 0.0001))) {
          throw new Error('The voice produced no audible audio.');
        }

        const file = new File(Paths.cache, 'voice-preview.wav');
        file.create({ overwrite: true });
        file.write(encodeWav(chunks, sampleRate));

        const player = createAudioPlayer(file.uri);
        playerRef.current = player;
        player.volume = 1;
        player.muted = false;
        playbackTimerRef.current = setTimeout(() => {
          if (playerRef.current !== player) return;
          stopPlayer();
          playDeviceVoice(generation, voice);
        }, 8000);
        player.addListener('playbackStatusUpdate', (status) => {
          if (playerRef.current !== player) return;
          if (status.currentTime > 0 && playbackTimerRef.current) {
            clearTimeout(playbackTimerRef.current);
            playbackTimerRef.current = null;
          }
          // The first sound has reached the speaker. React drops a repeat of
          // the same value, so this costs one render however often it fires.
          if (status.currentTime > 0 && generation === generationRef.current) setAudible(true);
          if (status.error && playerRef.current === player) {
            stopPlayer();
            playDeviceVoice(generation, voice);
            return;
          }
          if (!status.didJustFinish || playerRef.current !== player) return;
          stopPlayer();
          if (generation === generationRef.current) setPreviewingVoice(null);
        });
        player.play();
      } catch {
        if (generation !== generationRef.current) return;
        stopPlayer();
        playDeviceVoice(generation, voice);
      }
    },
    [playDeviceVoice, stopPlayer],
  );

  useEffect(() => () => {
    generationRef.current += 1;
    stopPlayer();
    void deviceSpeech()?.stop().catch(() => undefined);
  }, [stopPlayer]);

  /** The voice whose sample was asked for and cannot be heard yet. */
  const preparingVoice = audible ? null : previewingVoice;

  return { previewingVoice, preparingVoice, previewError, previewNotice, preview, stop };
}
