/**
 * The cloud voices as the app draws them: figures, never prices.
 *
 * Shared by `/billing/me` and `/billing/plans` for the reason their chat
 * catalogue is: the hours a plan is sold with before somebody signs in must be
 * the hours they are told about afterwards. The app gets Neurons a chapter and
 * hours a month, worked out here from the stored prices, and never a dollar.
 */
import {
  CHAPTER_CHARACTERS,
  PLAN_ORDER,
  defaultVoiceModelId,
  listeningHours,
  listedVoices,
  planIncludes,
  ttsCreditsEstimate,
  voicesForPlan,
  type CloudVoiceModel,
  type PlanId,
} from 'samwell-shared';

/** One decimal: "14.6 hours" is worth saying, "14.5833" is not. */
function oneDecimal(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

export interface VoiceModelView {
  id: string;
  label: string;
  maker: string;
  description: string;
  minPlan: PlanId;
  speedSupported: boolean;
  maxCharacters: number;
  /** The voices a reader is offered (`listedVoices`), in the maker's order. */
  voices: string[];
  defaultVoice: string;
  /** About what a chapter costs, in Neurons. Null for a voice with no price. */
  chapterCredits: number | null;
  /**
   * Hours of listening a month's grant buys on this voice: on the reader's own
   * plan when it reaches the voice, on the plan that opens it otherwise.
   */
  hours: number | null;
}

export interface VoiceFigures {
  /** The voice model the reader's plan starts on, or null without a plan. */
  defaultModelId: string | null;
  models: VoiceModelView[];
  /** For the plan cards: who each plan reaches, and how long its default lasts. */
  byPlan: Record<PlanId, { makers: string[]; defaultModelId: string | null; hours: number | null }>;
}

export function voiceFigures(models: CloudVoiceModel[], plan: PlanId | null): VoiceFigures {
  const byPlan = Object.fromEntries(
    PLAN_ORDER.map((tier) => {
      const reach = voicesForPlan(models, tier);
      const defaultId = defaultVoiceModelId(models, tier);
      const fallback = models.find((model) => model.id === defaultId);
      return [
        tier,
        {
          makers: [...new Set(reach.map((model) => model.maker))],
          defaultModelId: defaultId,
          hours: fallback ? oneDecimal(listeningHours(tier, fallback)) : null,
        },
      ];
    }),
  ) as VoiceFigures['byPlan'];

  return {
    defaultModelId: plan ? defaultVoiceModelId(models, plan) : null,
    models: models.map((model) => {
      const counted: PlanId = plan && planIncludes(plan, model.minPlan) ? plan : model.minPlan;
      return {
        id: model.id,
        label: model.label,
        maker: model.maker,
        description: model.description,
        minPlan: model.minPlan,
        speedSupported: model.speedSupported,
        maxCharacters: model.maxCharacters,
        voices: listedVoices(model),
        defaultVoice: model.defaultVoice,
        chapterCredits: ttsCreditsEstimate(CHAPTER_CHARACTERS, model, counted),
        hours: oneDecimal(listeningHours(counted, model)),
      };
    }),
    byPlan,
  };
}
