import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { cloudVoiceKey, planIncludes, type PlanId } from 'samwell-shared';

import { boxContents, versionInfo, voiceBoxes } from '@/features/tts/utils/cloud-voice-cards';
import {
  landingForMaker,
  landingForModel,
  planShortName,
  rememberCloudPick,
  resolveCloudSelection,
  selectionKey,
} from '@/features/tts/utils/cloud-voices';
import { createCloudVoicesQueryOptions } from '@/query-manager/cloud-voices';
import { isCloudVoice } from '@/services/device-tts/catalogue';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * The cloud pane's state and its choices: voice box, version, voice.
 *
 * The catalogue comes from the server (the plan preview's `voices`, through
 * TanStack Query), and nothing here prices anything: Neurons a chapter and
 * hours a month arrive as figures, and are shown behind each version's "i".
 * A voice box the plan does not reach is drawn locked, and pressing it hands
 * its plan to `onLockedMaker`, which raises the plans sheet.
 *
 * Every choice writes the active voice and so also the remembered cloud one
 * (`setTtsVoice`), which is what choosing Cloud again comes back to. Each
 * version's last choice is remembered too (`ttsCloudPicks`), so going back to
 * a voice box lands on the voice chosen in it, not on its default.
 *
 * Except while a plan is being sampled (`sample`, from `useVoiceSource`).
 * The pane is then drawn as that plan would have it: only the boxes it
 * opens, and every choice handed back to `sample.onPick` instead of saved.
 * This is the one place a choice in the pane becomes the reading voice, so
 * it is the place that keeps a reader without a plan off the cloud.
 */
export function useCloudVoicePane({
  onLockedMaker,
  sample,
}: {
  onLockedMaker: (maker: string, plan: PlanId) => void;
  sample: { plan: PlanId; key: string | null; onPick: (key: string) => void } | null;
}) {
  const figures = useQuery(createCloudVoicesQueryOptions()).data ?? null;
  const held = useSubscriptionStore((s) => (s.status === 'active' ? s.plan : null));
  // A plan held is never sampled: what it reaches is simply chosen.
  const sampling = held ? null : sample;
  const plan = held ?? sampling?.plan ?? null;
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsCloudVoice = useSettingsStore((s) => s.ttsCloudVoice);
  const storedPicks = useSettingsStore((s) => s.ttsCloudPicks);
  const setTtsVoice = useSettingsStore((s) => s.setTtsVoice);
  // While sampling nothing is saved, so the picks made in the samples are
  // remembered here, for as long as the pane is open.
  const [samplePicks, setSamplePicks] = useState<string[]>([]);

  const models = figures?.models ?? [];
  const reachable = plan ? models.filter((model) => planIncludes(plan, model.minPlan)) : [];
  const defaultModelId = plan ? (figures?.byPlan[plan]?.defaultModelId ?? null) : null;
  const stored = sampling ? sampling.key : isCloudVoice(ttsVoice) ? ttsVoice : ttsCloudVoice;
  const selection = resolveCloudSelection(stored, reachable, defaultModelId);
  const picks = sampling ? samplePicks : storedPicks;
  // Sampling shows what the plan has, not what a bigger one would add.
  const boxes = voiceBoxes(sampling ? reachable : models, plan);
  const choose = (key: string) => {
    if (sampling) {
      setSamplePicks((current) => rememberCloudPick(current, key));
      sampling.onPick(key);
    } else void setTtsVoice(key);
  };

  // Plain functions: the React Compiler memoises them, and hand-written
  // memoisation over values derived each render only stopped it doing so.
  const chooseMaker = (maker: string) => {
    const box = boxes.find((candidate) => candidate.maker === maker);
    if (!box) return;
    if (box.locked) {
      onLockedMaker(maker, box.minPlan);
      return;
    }
    const landing = landingForMaker(reachable, maker, defaultModelId, picks);
    if (landing) choose(selectionKey(landing));
  };

  const chooseModel = (modelId: string) => {
    const model = reachable.find((candidate) => candidate.id === modelId);
    if (!model) return;
    // The voice last chosen on it, or the one in hand where the two share
    // voices (Gemini's two models do), or its default.
    choose(cloudVoiceKey(model.id, landingForModel(model, selection?.voice ?? null, picks)));
  };

  const chooseVoice = (voice: string) => {
    if (selection) choose(cloudVoiceKey(selection.model.id, voice));
  };

  return {
    selection,
    boxes,
    contents: boxContents(reachable, selection, defaultModelId, picks),
    info: Object.fromEntries(reachable.map((model) => [model.id, versionInfo(model, plan)])),
    /** Whose figures a version's "i" quotes: the reader's plan, or the one being sampled. */
    figuresLabel: sampling ? `ON ${planShortName(sampling.plan)}` : 'ON YOUR PLAN',
    /** Said beside the pane's label while a plan is sampled, so it is plain these are not yet theirs. */
    sampleLabel: sampling ? `${planShortName(sampling.plan)} SAMPLES` : null,
    chooseMaker,
    chooseModel,
    chooseVoice,
  };
}
