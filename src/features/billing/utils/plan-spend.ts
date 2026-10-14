/**
 * What a month of Neurons goes on, for a plan's info sheet.
 *
 * One balance pays for two things: Samwell's brains and the cloud reading
 * voices. The sheet says so by drawing them as two sides of the same figure,
 * each with its own estimate ("if the whole month went this way"), a control
 * to browse that estimate, and a list of what the plan includes.
 *
 * Both sides have the same shape so one pane can draw either. Nothing here
 * prices anything: conversations divide the server's credits by the server's
 * credits (`planFacts`), and hours arrive from the server as figures.
 *
 * Pure, so it can be tested on its own.
 */
import { CREDIT_PLANS, PLAN_ORDER, planIncludes, type CreditPlan, type PlanId, type VoiceFigures } from 'samwell-shared';

import { planFacts, type PlanFactModel } from '@/features/billing/utils/plan-facts';
import { formatHours } from '@/utils/format';

export type PlanSpend = 'brains' | 'voices';

/** A number and what it counts, over a month: "≈ 600", "conversations". */
export interface SpendFigure {
  value: string;
  unit: string;
}

export interface SpendGroup {
  /** The heading over the options, or null for the ones that need none. */
  label: string | null;
  options: { value: string; label: string }[];
}

/** One line of what the plan includes. */
export interface SpendRow {
  key: string;
  /** Who makes it, where the name does not already say: "ANTHROPIC". */
  kicker: string | null;
  name: string;
}

export interface PlanSpendSide {
  /** What the browse control offers. Empty when nothing can be estimated. */
  groups: SpendGroup[];
  /** The option the side opens on. */
  defaultValue: string | null;
  /** The estimate for each option that has one. */
  figures: Record<string, SpendFigure>;
  /** What the side says for itself when there is no estimate: a count. */
  fallback: SpendFigure;
  /** The one line under the browse control, on why the estimate moves. */
  line: string;
  listTitle: string;
  total: string;
  rows: SpendRow[];
  /** What the list leaves out, in a line: the brains of the tiers beneath. */
  more: string | null;
  note: string | null;
}

const tierName = (plan: PlanId) => CREDIT_PLANS[plan].label.replace(/ Samwell$/, '');

/** "Google: Gemini 2.5 Pro" is "Gemini 2.5 Pro" beside its maker. */
const brainName = (model: PlanFactModel) =>
  model.label.startsWith(`${model.provider}: `) ? model.label.slice(model.provider.length + 2).trim() : model.label;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The brains side. The estimate opens on the dearest brain in the plan, so
 * browsing can only make it bigger (`planFacts`). The list names the brains
 * that are new at this tier and folds the tiers beneath into one line,
 * because access is cumulative and re-listing them is the sheet arguing with
 * the plan table.
 *
 * Against an older server there is no catalogue: the count still stands,
 * and nothing is named or estimated.
 */
export function planBrains(plan: CreditPlan, models: readonly PlanFactModel[], modelCount: number): PlanSpendSide {
  const facts = planFacts(plan, models);
  const priced = facts.models.filter((model) => facts.estimates[model.id] !== undefined);
  const own = facts.models.filter((model) => model.minPlan === plan.id);
  const beneath = PLAN_ORDER.slice(0, PLAN_ORDER.indexOf(plan.id)).reverse();
  const inherited = facts.models.length - own.length;

  const groups: SpendGroup[] = [
    { label: null, options: priced.filter((model) => model.minPlan === plan.id) },
    ...beneath.map((tier) => ({ label: tierName(tier), options: priced.filter((model) => model.minPlan === tier) })),
  ]
    .filter((group) => group.options.length > 0)
    .map((group) => ({ label: group.label, options: group.options.map((model) => ({ value: model.id, label: brainName(model) })) }));

  const figures: Record<string, SpendFigure> = {};
  for (const model of priced) {
    figures[model.id] = { value: `≈ ${facts.estimates[model.id].toLocaleString()}`, unit: 'conversations' };
  }

  return {
    groups,
    defaultValue: facts.defaultModelId != null && figures[facts.defaultModelId] ? facts.defaultModelId : (priced[0]?.id ?? null),
    figures,
    fallback: { value: modelCount.toLocaleString(), unit: plural(modelCount, 'brain to think with', 'brains to think with') },
    line: 'Stronger brains use more Neurons.',
    listTitle: 'Included brains',
    total: `${modelCount.toLocaleString()} total`,
    rows: own.map((model) => ({ key: model.id, kicker: model.provider, name: brainName(model) })),
    more:
      facts.models.length === 0
        ? `${modelCount.toLocaleString()} ${plural(modelCount, 'brain is', 'brains are')} open to this plan.`
        : inherited > 0
          ? `Plus the ${inherited} ${beneath.map(tierName).join(' and ')} brains`
          : null,
    note: null,
  };
}

/**
 * The voices side, or null when the server sent no cloud voices (an older
 * one), which leaves the sheet with its brains alone.
 *
 * The estimate opens on the plan's own default voice, the figure its card
 * quotes. The list is the voice boxes this plan opens and nothing else: a
 * box's versions are in the browse control, and what a bigger plan adds is
 * that plan's sheet to say.
 */
export function planVoices(plan: CreditPlan, voices: VoiceFigures | null | undefined): PlanSpendSide | null {
  const all = voices?.models ?? [];
  if (all.length === 0) return null;
  const reached = all.filter((model) => planIncludes(plan.id, model.minPlan));
  const makers = [...new Set(reached.map((model) => model.maker))];

  const figures: Record<string, SpendFigure> = {};
  for (const model of reached) {
    const hours = model.hoursByPlan[plan.id] ?? null;
    if (hours == null) continue;
    const value = formatHours(hours);
    figures[model.id] = { value: `≈ ${value}`, unit: `${plural(Number(value), 'hour', 'hours')} read aloud` };
  }
  const priced = reached.filter((model) => figures[model.id]);
  const preferred = voices?.byPlan[plan.id]?.defaultModelId ?? null;

  return {
    groups: makers
      .map((maker) => ({
        label: maker,
        options: priced.filter((model) => model.maker === maker).map((model) => ({ value: model.id, label: model.label })),
      }))
      .filter((group) => group.options.length > 0),
    defaultValue: preferred != null && figures[preferred] ? preferred : (priced[0]?.id ?? null),
    figures,
    fallback: { value: String(makers.length), unit: plural(makers.length, 'voice box to read with', 'voice boxes to read with') },
    line: 'Richer voices use more Neurons.',
    listTitle: 'Included voice boxes',
    total: `${makers.length} total`,
    rows: makers.map((maker) => ({ key: maker, kicker: null, name: maker })),
    more: null,
    note: 'On-device voices stay free. Neurons pay for the voice, never the book.',
  };
}
