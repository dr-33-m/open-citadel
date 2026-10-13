/**
 * The read-aloud route as the server runs it: `createTtsRoutes` with the real
 * database, billing, catalogue and identity. Its own file so `tts.ts` stays a
 * thing the tests can build without touching any of them.
 */
import { billing } from './billing.js';
import { recordUsageEvent, updateUsageEvent } from './db.js';
import { readIdentity } from './identity.js';
import { createTtsRoutes } from './tts.js';
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
});
