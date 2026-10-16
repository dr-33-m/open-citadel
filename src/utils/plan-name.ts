import { CREDIT_PLANS, type PlanId } from 'samwell-shared';

/** "Grand Maester Samwell" as a label has room for it: "GRAND MAESTER". */
export function planShortName(plan: PlanId): string {
  return CREDIT_PLANS[plan].label.replace(/\s*Samwell$/, '').toUpperCase();
}

/** "Google: Gemini 2.5 Pro" is "Gemini 2.5 Pro" beside its maker. */
export function brainName(model: { label: string; provider: string }): string {
  return model.label.startsWith(`${model.provider}: `) ? model.label.slice(model.provider.length + 2).trim() : model.label;
}
