/** Maximum tick cells mounted by the ruler, regardless of the minute step. */
export const RULER_WINDOW_SIZE = 121;

const WINDOW_SHIFT = 40;

export interface RulerWindow {
  start: number;
  end: number;
}

/**
 * A chunked, overscanned slice around the visible tick. It moves only once per
 * WINDOW_SHIFT ticks, leaving at least forty ticks ahead of a normal scroll.
 */
export function rulerWindow(itemCount: number, visibleIndex: number): RulerWindow {
  const count = Math.max(0, Math.floor(itemCount));
  if (count <= RULER_WINDOW_SIZE) return { start: 0, end: count };

  const index = Math.min(Math.max(Math.round(visibleIndex), 0), count - 1);
  const chunk = Math.floor(index / WINDOW_SHIFT) * WINDOW_SHIFT;
  const before = Math.floor((RULER_WINDOW_SIZE - WINDOW_SHIFT) / 2);
  const start = Math.min(Math.max(chunk - before, 0), count - RULER_WINDOW_SIZE);
  return { start, end: start + RULER_WINDOW_SIZE };
}
