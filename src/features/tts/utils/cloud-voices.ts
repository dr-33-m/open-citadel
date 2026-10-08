/**
 * Which cloud voice a stored setting means, what the pane offers, and what it
 * says a voice costs. (What a voice is called is `cloud-voice-names.ts`,
 * which needs the on-device catalogue.)
 *
 * Pure, so it can be tested on its own.
 */
import {
  CLOUD_VOICE_MAX_CHARACTERS,
  CREDIT_PLANS,
  cloudVoiceKey,
  parseCloudVoiceKey,
  planIncludes,
  planRank,
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

/** "About 17 Neurons a chapter" and "About 60 hours a month on your plan", or null without figures. */
export function cloudCostLines(model: VoiceModelView, hours: number | null): { chapter: string | null; hours: string | null } {
  const credits = model.chapterCredits;
  return {
    chapter: credits == null ? null : `About ${credits.toLocaleString('en-US')} Neuron${credits === 1 ? '' : 's'} a chapter`,
    hours: hours == null ? null : `About ${hours >= 10 ? Math.round(hours) : hours} hours a month on your plan`,
  };
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
): { modelId: string; voice: string; speed: number | null; maxCharacters: number } | null {
  const parsed = parseCloudVoiceKey(stored);
  if (!parsed) return null;
  const model = models?.find((m) => m.id === parsed.modelId);
  return {
    modelId: parsed.modelId,
    voice: parsed.voice,
    speed: model?.speedSupported && rate !== 1 ? rate : null,
    maxCharacters: model?.maxCharacters ?? CLOUD_VOICE_MAX_CHARACTERS,
  };
}

/** One maker chip: who makes the voices, and the plan that opens them when it is not this one. */
export interface MakerChoice {
  value: string;
  label: string;
  /** The plan's short name ("ARCHMAESTER") when the reader's plan does not reach this maker. */
  locked: string | null;
  /** The cheapest plan that reaches this maker. */
  minPlan: PlanId;
}

/** The makers in catalogue order, each locked with its plan's name when out of reach. */
export function makerChoices(models: readonly VoiceModelView[], plan: PlanId | null): MakerChoice[] {
  const out: MakerChoice[] = [];
  for (const model of models) {
    const existing = out.find((choice) => choice.value === model.maker);
    if (existing) {
      if (planRank(model.minPlan) < planRank(existing.minPlan)) existing.minPlan = model.minPlan;
      continue;
    }
    out.push({ value: model.maker, label: model.maker.toUpperCase(), locked: null, minPlan: model.minPlan });
  }
  for (const choice of out) {
    if (!plan || !planIncludes(plan, choice.minPlan)) choice.locked = planShortName(choice.minPlan);
  }
  return out;
}

/** "Grand Maester Samwell" as a chip has room for it: "GRAND MAESTER". */
export function planShortName(plan: PlanId): string {
  return CREDIT_PLANS[plan].label.replace(/\s*Samwell$/, '').toUpperCase();
}

/**
 * A maker's models as chips, named by what tells them apart: "Gemini Flash
 * Lite" and "Gemini Flash" are FLASH LITE and FLASH under the Google chip.
 * A maker with one model has nothing to choose, and gets no chips.
 */
export function modelChoices(models: readonly VoiceModelView[]): { value: string; label: string }[] {
  if (models.length < 2) return [];
  const firstWords = new Set(models.map((model) => model.label.split(' ')[0]));
  const shared = firstWords.size === 1 ? `${[...firstWords][0]} ` : '';
  return models.map((model) => ({
    value: model.id,
    label: (shared && model.label.startsWith(shared) ? model.label.slice(shared.length) : model.label).toUpperCase(),
  }));
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
