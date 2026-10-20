/**
 * The transcription routes as the server runs them: the real database,
 * billing, identity and Samwell. Its own file so `transcribe.ts` and the
 * worker stay things the tests can build without touching any of them.
 */
import { billing } from './billing.js';
import { db, getDefaultModelIdForPlan, recordUsageEvent } from './db.js';
import { readIdentity } from './identity.js';
import { SPEAKER_NAMES_PROMPT, SpeakerNamesSchema, applySpeakerNames, speakerNamesInput } from './speaker-names.js';
import { runStructuredAnalysis } from './structured-analysis.js';
import { createTranscribeRoutes } from './transcribe.js';
import { createTranscribeJobs } from './transcribe-jobs.js';
import { createTranscribeWorker, type NameSpeakers } from './transcribe-worker.js';

/**
 * One call on the Maester default model. Its own usage event, as a record
 * only: what it cost is charged as part of the transcript's settle.
 */
const nameSpeakers: NameSpeakers = async (doc, context) => {
  const modelId = await getDefaultModelIdForPlan('maester');
  const usageEventId = `transcribe-names-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await recordUsageEvent({ id: usageEventId, accountId: context.accountId, modelId, countsTowardLimit: false, kind: 'transcribe_names' });
  let costUsd = 0;
  const answer = await runStructuredAnalysis({
    modelId,
    systemPrompts: [SPEAKER_NAMES_PROMPT],
    messages: [{ role: 'user', content: speakerNamesInput(doc, context) }],
    schema: SpeakerNamesSchema,
    usageEventId,
    failureCode: 'speaker_names_failed',
    onCost: (cost) => {
      costUsd = cost;
    },
  }).catch(() => null);
  return { doc: applySpeakerNames(doc, answer), costUsd };
};

export const transcribeJobs = createTranscribeJobs(db);

export const transcribeWorker = createTranscribeWorker({
  jobs: transcribeJobs,
  billing,
  apiKey: () => process.env.OPENROUTER_API_KEY,
  nameSpeakers,
});

export const transcribeRoutes = createTranscribeRoutes({
  identify: readIdentity,
  billing,
  jobs: transcribeJobs,
  worker: transcribeWorker,
  recordUsageEvent,
  apiKey: () => process.env.OPENROUTER_API_KEY,
});
