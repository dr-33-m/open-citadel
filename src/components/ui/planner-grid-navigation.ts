export type PlannerGridNavigationKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End';

/**
 * Whether a cell can take focus. Some looks leave the days either side of the
 * month blank, and a blank has nothing to focus — so the caller says which
 * indices are real and movement steps over the rest.
 */
export type PlannerGridNavigable = (index: number) => boolean;

/** Returns the next visible cell for a bounded, row-major month grid. */
export function plannerGridTarget(
  key: string,
  index: number,
  count: number,
  columns = 7,
  navigable?: PlannerGridNavigable
): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= count || columns < 1) {
    return null;
  }

  let target: number;
  /*
   * Which way to keep going when the first landing is blank. The arrows carry
   * on away from where you were; Home and End start at the edge of the row and
   * come back inward, because the cell they want is the outermost real one and
   * anything past it is off the row entirely.
   */
  let step: number;
  switch (key as PlannerGridNavigationKey) {
    case 'ArrowLeft':
      target = index - 1;
      step = -1;
      break;
    case 'ArrowRight':
      target = index + 1;
      step = 1;
      break;
    case 'ArrowUp':
      target = index - columns;
      step = -columns;
      break;
    case 'ArrowDown':
      target = index + columns;
      step = columns;
      break;
    case 'Home':
      target = index - (index % columns);
      step = 1;
      break;
    case 'End':
      target = index + (columns - 1 - (index % columns));
      step = -1;
      break;
    default:
      return null;
  }

  if (target < 0 || target >= count) return index;
  if (!navigable) return target;

  /*
   * Stepping stops at the cell you started from rather than running past it.
   * That covers both directions at once: an arrow that finds nothing before
   * the grid ends stays put, and Home or End on a row whose edge is blank
   * walks in until it reaches a real day or arrives back where it began.
   */
  while (target !== index && !navigable(target)) {
    target += step;
    if (target < 0 || target >= count) return index;
  }

  return target;
}
