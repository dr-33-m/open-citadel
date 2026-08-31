/** Resolve a standard adjustable action without wrapping past either bound. */
export function indexForAccessibilityAction(
  index: number,
  length: number,
  actionName: string,
  disabled = false
): number | undefined {
  const direction = actionName === 'increment' ? 1 : actionName === 'decrement' ? -1 : 0;
  if (disabled || direction === 0 || length <= 0) return undefined;

  const next = Math.min(Math.max(index + direction, 0), length - 1);
  return next === index ? undefined : next;
}

/** Keep the numeric adjustable range aligned with the values the face offers. */
export function accessibilityValueForIndex(index: number, length: number, text: string) {
  const max = Math.max(0, length - 1);
  return {
    min: 0,
    max,
    now: Math.min(Math.max(index, 0), max),
    text,
  };
}
