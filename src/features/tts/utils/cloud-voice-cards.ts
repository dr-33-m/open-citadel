/**
 * What the cloud pane draws: the voice boxes as tabs, a box's versions as
 * chips, and what a version's "i" opens (what it is like, and what it costs
 * on the reader's plan).
 *
 * Nothing here prices anything. Neurons and hours arrive from the server as
 * figures.
 *
 * Pure, so it can be tested on its own.
 */
import {
  CHAPTER_CHARACTERS,
  CHARACTERS_PER_SECOND,
  planIncludes,
  planRank,
  type PlanId,
  type VoiceModelView,
} from 'samwell-shared';

import { landingForMaker, type CloudSelection } from '@/features/tts/utils/cloud-voices';
import { planShortName } from '@/utils/plan-name';
import { CLOUD_SPEED_FIXED } from '@/features/tts/utils/voice-copy';
import { formatHours } from '@/utils/format';

/** One voice box: who makes the voices, and the plan that opens it when it is not this one. */
export interface VoiceBox {
  maker: string;
  /** As its tab reads: "ELEVENLABS". */
  label: string;
  /** The plan's short name ("ARCHMAESTER") when the reader's plan does not reach this box. */
  locked: string | null;
  /** The cheapest plan that reaches it. */
  minPlan: PlanId;
}

/** The voice boxes in catalogue order, each locked with its plan's name when out of reach. */
export function voiceBoxes(models: readonly VoiceModelView[], plan: PlanId | null): VoiceBox[] {
  const boxes: VoiceBox[] = [];
  for (const model of models) {
    const existing = boxes.find((box) => box.maker === model.maker);
    if (existing) {
      if (planRank(model.minPlan) < planRank(existing.minPlan)) existing.minPlan = model.minPlan;
      continue;
    }
    boxes.push({ maker: model.maker, label: model.maker.toUpperCase(), locked: null, minPlan: model.minPlan });
  }
  for (const box of boxes) {
    if (!plan || !planIncludes(plan, box.minPlan)) box.locked = planShortName(box.minPlan);
  }
  return boxes;
}

/**
 * A box's versions as chips, named by what tells them apart: "Gemini Flash
 * Lite" and "Gemini Flash" are FLASH LITE and FLASH under Google. A box with
 * one version has nothing to choose, and gets no chips.
 */
export function voiceVersions(models: readonly VoiceModelView[]): { value: string; label: string }[] {
  if (models.length < 2) return [];
  const firstWords = new Set(models.map((model) => model.label.split(' ')[0]));
  const shared = firstWords.size === 1 ? `${[...firstWords][0]} ` : '';
  return models.map((model) => ({
    value: model.id,
    label: (shared && model.label.startsWith(shared) ? model.label.slice(shared.length) : model.label).toUpperCase(),
  }));
}

/** What one voice box's pane shows: the version in hand, its voice, and the versions to choose between. */
export interface BoxContent {
  maker: string;
  model: VoiceModelView;
  voice: string;
  versions: { value: string; label: string }[];
}

/**
 * A pane for every voice box the plan opens, in catalogue order, so the panes
 * can be kept and trade places instead of being rebuilt. The chosen box shows
 * the selection. Each other box shows where choosing it would land (the
 * version and voice last chosen in it, else the plan's default when it is one
 * of the box's, its first version otherwise, on that version's default
 * voice), so the pane is already right when its tab is pressed.
 */
export function boxContents(
  reachable: readonly VoiceModelView[],
  selection: CloudSelection | null,
  defaultModelId: string | null,
  picks: readonly string[] = [],
): BoxContent[] {
  const makers = [...new Set(reachable.map((model) => model.maker))];
  const contents: BoxContent[] = [];
  for (const maker of makers) {
    const landing = selection?.model.maker === maker ? selection : landingForMaker(reachable, maker, defaultModelId, picks);
    if (!landing) continue;
    contents.push({
      maker,
      model: landing.model,
      voice: landing.voice,
      versions: voiceVersions(reachable.filter((candidate) => candidate.maker === maker)),
    });
  }
  return contents;
}

/** One figure of what a voice costs: a number, its unit, and what it is measured over. */
export interface CloudFigure {
  key: 'hours' | 'chapter';
  /** "≈ 22": an estimate, and it says so. */
  value: string;
  unit: string;
  label: string;
}

/** A month in hours and a chapter in Neurons, each only when the server sent a figure. */
export function cloudFigures(model: VoiceModelView, plan: PlanId | null): CloudFigure[] {
  const figures: CloudFigure[] = [];
  const hours = (plan ? model.hoursByPlan[plan] : null) ?? model.hours;
  if (hours != null) {
    figures.push({ key: 'hours', value: `≈ ${formatHours(hours)}`, unit: hours === 1 ? 'hour' : 'hours', label: 'A MONTH' });
  }
  const credits = model.chapterCredits;
  if (credits != null) {
    figures.push({
      key: 'chapter',
      value: `≈ ${credits.toLocaleString('en-US')}`,
      unit: credits === 1 ? 'Neuron' : 'Neurons',
      label: 'A CHAPTER',
    });
  }
  return figures;
}

/** How long the chapter the estimates are drawn against takes to hear, in minutes. */
const CHAPTER_MINUTES = Math.round(CHAPTER_CHARACTERS / CHARACTERS_PER_SECOND / 60);

/** What a version's "i" opens: who makes it, what it is like, its figures, and how to read them. */
export interface VersionInfo {
  label: string;
  title: string;
  line: string;
  figures: CloudFigure[];
  points: string[];
}

export function versionInfo(model: VoiceModelView, plan: PlanId | null): VersionInfo {
  const figures = cloudFigures(model, plan);
  const points: string[] = [];
  if (figures.some((figure) => figure.key === 'hours')) {
    points.push('Hours are what a whole month of Neurons buys on this voice.');
  }
  if (figures.some((figure) => figure.key === 'chapter')) {
    points.push(`A chapter is about ${CHAPTER_MINUTES} minutes of listening.`);
  }
  if (!model.speedSupported) points.push(CLOUD_SPEED_FIXED);
  return { label: model.maker.toUpperCase(), title: model.label, line: model.description, figures, points };
}
