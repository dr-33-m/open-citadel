/**
 * The read-aloud route as the server runs it: `createTtsRoutes` with the real
 * database, billing, catalogue and identity. Its own file so `tts.ts` stays a
 * thing the tests can build without touching any of them.
 */
import { billing } from './billing.js';
import { recordUsageEvent, updateUsageEvent } from './db.js';
import { readIdentity } from './identity.js';
import { createTtsRoutes } from './tts.js';
import { canEncodeMp3, pcmToMp3 } from './tts-encode.js';
import { speechCharging } from './tts-billing.js';
import { createSpeechGuards } from './tts-guards.js';
import { voiceCatalog } from './voice-catalog.js';

export const ttsRoutes = createTtsRoutes({
  identify: readIdentity,
  billing,
  charging: speechCharging,
  findVoiceModel: (id) => voiceCatalog.find(id),
  recordUsageEvent,
  updateUsageEvent,
  guards: createSpeechGuards(),
  apiKey: () => process.env.OPENROUTER_API_KEY,
  // Gemini makes PCM alone; the app is sent MP3 all the same where ffmpeg is here.
  encodeMp3: canEncodeMp3() ? (source, shape, onSourceBytes) => pcmToMp3(source, shape, { onSourceBytes }) : null,
});
