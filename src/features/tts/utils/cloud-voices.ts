/**
 * Which cloud voice a stored setting means, and where a choice lands. (What
 * the pane draws is `cloud-voice-cards.ts`; what a voice is called is
 * `cloud-voice-names.ts`, which needs the on-device catalogue.)
 *
 * Pure, so it can be tested on its own.
 */
import {
  CLOUD_VOICE_MAX_CHARACTERS,
  CREDIT_PLANS,
  cloudVoiceKey,
  parseCloudVoiceKey,
  planIncludes,
  type PlanId,
  type VoiceFigures,
  type VoiceModelView,
} from 'samwell-shared';


export interface CloudSelection {
  model: VoiceModelView;
  voice: string;
}

/**
 * The model and voice a stored setting names, healed against what the plan
 * reaches. A model the plan no longer reaches (or the server no longer
 * lists) falls to the plan's default; a voice the model no longer offers
 * falls to the model's default. Null only when nothing at all is reachable.
 */
export function resolveCloudSelection(
  stored: string | null,
  reachable: readonly VoiceModelView[],
  defaultModelId: string | null,
): CloudSelection | null {
  const parsed = parseCloudVoiceKey(stored);
  const model =
    reachable.find((m) => m.id === parsed?.modelId) ??
    reachable.find((m) => m.id === defaultModelId) ??
    reachable[0];
  if (!model) return null;
  const voice = parsed && parsed.modelId === model.id && model.voices.includes(parsed.voice) ? parsed.voice : model.defaultVoice;
  return { model, voice };
}

/** The setting for a selection, so the pane and the store write the same string. */
export function selectionKey(selection: CloudSelection): string {
  return cloudVoiceKey(selection.model.id, selection.voice);
}

/**
 * What the read-aloud session asks the server for, from the stored voice and
 * the catalogue as last fetched. Speed goes only to a maker that takes it.
 * Without the catalogue (a cold start offline) the stored voice is still
 * asked for as it is, at the piece limit every maker takes; the server is the
 * one that says no, and saying no is a drawn state.
 */
export function cloudChoiceFor(
  stored: string | null,
  models: readonly VoiceModelView[] | null | undefined,
  rate: number,
  format: 'pcm' | 'mp3' = 'pcm',
): { modelId: string; voice: string; speed: number | null; maxCharacters: number; format: 'pcm' | 'mp3' } | null {
  const parsed = parseCloudVoiceKey(stored);
  if (!parsed) return null;
  const model = models?.find((m) => m.id === parsed.modelId);
  // To the hundredth: Readium hands the rate back as a double made from a
  // float (1.1 as 1.1000000238), and a sentence fetched ahead at the setting's
  // rate must be the one asked for at Readium's.
  const speed = Math.round(rate * 100) / 100;
  return {
    modelId: parsed.modelId,
    voice: parsed.voice,
    speed: model?.speedSupported && speed !== 1 ? speed : null,
    maxCharacters: model?.maxCharacters ?? CLOUD_VOICE_MAX_CHARACTERS,
    format,
  };
}

/** "Grand Maester Samwell" as a label has room for it: "GRAND MAESTER". */
export function planShortName(plan: PlanId): string {
  return CREDIT_PLANS[plan].label.replace(/\s*Samwell$/, '').toUpperCase();
}

/**
 * The cheapest plan that reaches the voice a stored setting names, or null
 * when it names none the catalogue knows. Where the plans sheet rests when a
 * plan has ended mid-book: on the plan that brings back the voice being heard.
 */
export function planForCloudVoice(stored: string | null, models: readonly VoiceModelView[] | null | undefined): PlanId | null {
  const parsed = parseCloudVoiceKey(stored);
  return models?.find((model) => model.id === parsed?.modelId)?.minPlan ?? null;
}

/** What sits under the Cloud card: the voices, the plans that open them, or the wait before it is known which. */
export type CloudPaneView = 'voices' | 'plans' | 'checking' | 'unreachable';

/**
 * What the cloud pane draws for this reader. The same order Samwell's own
 * cloud panel decides in: a plan shows what it opens; nobody at all is sold
 * one; somebody whose plan has not been read yet waits, so a reader who is
 * already paying is never shown a price list; a server that never answered
 * offers to ask again.
 *
 * A reader without a plan who asked to hear a plan's samples is shown its
 * voices in place of the plans, and only then: sampling never stands in for
 * the wait, since somebody who may be paying is not sampling.
 *
 * A build that cannot sell has no plans to show, so it falls to the voices,
 * which draw nothing without a plan (its Cloud card is shut anyway).
 */
export function cloudPaneView({
  status,
  identity,
  canSell,
  sampling = false,
}: {
  /** The subscription store's status. */
  status: 'unknown' | 'unavailable' | 'none' | 'active' | 'unreachable';
  /** Who the phone is to the server: an account or a guest is `held`. */
  identity: 'unknown' | 'none' | 'held';
  canSell: boolean;
  /** A plan's samples are being heard, from the plans. */
  sampling?: boolean;
}): CloudPaneView {
  if (status === 'active') return 'voices';
  if (identity === 'unknown') return 'checking';
  if (identity === 'held' && status === 'unknown') return 'checking';
  if (identity === 'held' && status === 'unreachable') return 'unreachable';
  return canSell && !sampling ? 'plans' : 'voices';
}

/**
 * Where choosing a maker lands: the plan's own default when it is one of the
 * maker's, the maker's first model otherwise. The default is the voice that
 * lasts, so a reader exploring makers is not quietly moved onto the dearest.
 */
export function modelForMaker(
  models: readonly VoiceModelView[],
  maker: string,
  defaultModelId: string | null,
): VoiceModelView | null {
  const own = models.filter((model) => model.maker === maker);
  return own.find((model) => model.id === defaultModelId) ?? own[0] ?? null;
}

/**
 * The voice a plan reads in, as the stored setting: the one remembered when
 * the plan still reaches it, the plan's own default otherwise. What choosing
 * Cloud, and buying a plan from the Cloud card, both land on.
 */
export function cloudVoiceForPlan(
  figures: VoiceFigures | null | undefined,
  plan: PlanId,
  remembered: string | null,
): string | null {
  if (!figures) return null;
  const reachable = figures.models.filter((model) => planIncludes(plan, model.minPlan));
  const selection = resolveCloudSelection(remembered, reachable, figures.byPlan[plan]?.defaultModelId ?? null);
  return selection ? selectionKey(selection) : null;
}
