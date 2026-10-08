import { useQuery } from '@tanstack/react-query';
import { cloudVoiceKey, planIncludes, type PlanId } from 'samwell-shared';

import {
  cloudCostLines,
  makerChoices,
  modelChoices,
  modelForMaker,
  resolveCloudSelection,
} from '@/features/tts/utils/cloud-voices';
import { createCloudVoicesQueryOptions } from '@/query-manager/cloud-voices';
import { isCloudVoice } from '@/services/device-tts/catalogue';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * The cloud pane's state and its choices: maker, model, voice.
 *
 * The catalogue comes from the server (the plan preview's `voices`, through
 * TanStack Query), and nothing here prices anything: Neurons a chapter and
 * hours a month arrive as figures. A maker the plan does not reach is drawn
 * locked with its plan's name, and pressing it hands that plan to
 * `onLockedMaker`, which raises the plans sheet.
 *
 * Every choice writes the active voice and so also the remembered cloud one
 * (`setTtsVoice`), which is what choosing Cloud again comes back to.
 */
export function useCloudVoicePane({ onLockedMaker }: { onLockedMaker: (maker: string, plan: PlanId) => void }) {
  const figures = useQuery(createCloudVoicesQueryOptions()).data ?? null;
  const plan = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsCloudVoice = useSettingsStore((s) => s.ttsCloudVoice);
  const setTtsVoice = useSettingsStore((s) => s.setTtsVoice);

  const models = figures?.models ?? [];
  const reachable = plan ? models.filter((model) => planIncludes(plan, model.minPlan)) : [];
  const defaultModelId = plan ? (figures?.byPlan[plan]?.defaultModelId ?? null) : null;
  const selection = resolveCloudSelection(isCloudVoice(ttsVoice) ? ttsVoice : ttsCloudVoice, reachable, defaultModelId);
  const makers = makerChoices(models, plan);
  const makerModels = selection ? reachable.filter((model) => model.maker === selection.model.maker) : [];
  const hours = selection && plan ? (selection.model.hoursByPlan[plan] ?? selection.model.hours) : null;

  // Plain functions: the React Compiler memoises them, and hand-written
  // memoisation over values derived each render only stopped it doing so.
  const chooseMaker = (maker: string) => {
    const choice = makers.find((candidate) => candidate.value === maker);
    if (!choice) return;
    if (choice.locked) {
      onLockedMaker(maker, choice.minPlan);
      return;
    }
    const model = modelForMaker(reachable, maker, defaultModelId);
    if (model) void setTtsVoice(cloudVoiceKey(model.id, model.defaultVoice));
  };

  const chooseModel = (modelId: string) => {
    const model = reachable.find((candidate) => candidate.id === modelId);
    if (!model) return;
    // Gemini's two models share their voices: moving between them keeps it.
    const voice = selection && model.voices.includes(selection.voice) ? selection.voice : model.defaultVoice;
    void setTtsVoice(cloudVoiceKey(model.id, voice));
  };

  const chooseVoice = (voice: string) => {
    if (selection) void setTtsVoice(cloudVoiceKey(selection.model.id, voice));
  };

  return {
    selection,
    makers,
    models: modelChoices(makerModels),
    costs: selection ? cloudCostLines(selection.model, hours) : { chapter: null, hours: null },
    chooseMaker,
    chooseModel,
    chooseVoice,
  };
}
