/**
 * Which of a plan's models a turn may be rerouted to.
 *
 * OpenRouter takes a short list of fallbacks, not a long one: past three it
 * refuses the whole request. A plan's own list is as long as the plan is
 * generous (two on Maester, five on Grand Maester, eight on Archmaester), so
 * handing all of it over meant the dearer the plan, the surer every turn on
 * it was to be refused before any model ran.
 *
 * So three, and the three nearest the chosen model in price. A turn is
 * charged at the chosen model's price whichever model answered, so a
 * fallback that costs far more is the house paying the difference, and one
 * that costs far less is the reader paying for a better answer than they
 * got. Nearest in price is the fairest stand-in both ways.
 *
 * Pure, so it can be tested without a request.
 */
export const MAX_FALLBACK_MODELS = 3;

type Candidate = {
  id: string;
  capabilities: readonly string[];
  outputPricePerMillion?: number | null;
};

export function pickFallbackModels<T extends Candidate>(
  planModels: readonly T[],
  primaryId: string,
  max: number = MAX_FALLBACK_MODELS,
): T[] {
  /*
   * Tools, because every request carries tool definitions: a model that
   * cannot call them is not a substitute, it is a destination where the
   * request arrives broken.
   */
  const candidates = planModels.filter(
    (model) => model.id !== primaryId && model.capabilities.includes('tools'),
  );
  const primaryPrice = planModels.find((model) => model.id === primaryId)?.outputPricePerMillion;
  // Nothing to measure against: the catalogue's own order is the best guess.
  if (primaryPrice == null) return candidates.slice(0, max);

  const distance = (model: T) =>
    model.outputPricePerMillion == null
      ? Number.POSITIVE_INFINITY
      : Math.abs(model.outputPricePerMillion - primaryPrice);
  return candidates
    .map((model, index) => ({ model, index, distance: distance(model) }))
    // A tie keeps the catalogue's order, so the choice does not flip between turns.
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, max)
    .map((entry) => entry.model);
}
