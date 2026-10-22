/**
 * The voice a book is heard in: the reader's last cloud voice, healed
 * against what the plan reaches, or the plan's default when none was ever
 * chosen. One voice for books, so the reader and the player never disagree
 * about who is reading.
 *
 * Pure, so it can be tested on its own.
 */
import { parseCloudVoiceKey, planIncludes, type PlanId, type VoiceFigures, type VoiceModelView } from 'samwell-shared';

import { resolveCloudSelection, selectionKey } from '@/features/tts/utils/cloud-voices';

export interface BookVoice {
  /** `cloud:<modelId>:<voice>`. */
  key: string;
  /** The model as the catalogue describes it, or null when the catalogue is not to hand (a cold start offline). */
  model: VoiceModelView | null;
}

export function bookVoice(stored: string | null, figures: VoiceFigures | null | undefined, plan: PlanId | null): BookVoice | null {
  if (!figures) return parseCloudVoiceKey(stored) ? { key: stored as string, model: null } : null;
  if (!plan) return null;
  const reachable = figures.models.filter((model) => planIncludes(plan, model.minPlan));
  const selection = resolveCloudSelection(stored, reachable, figures.defaultModelId);
  return selection ? { key: selectionKey(selection), model: selection.model } : null;
}
