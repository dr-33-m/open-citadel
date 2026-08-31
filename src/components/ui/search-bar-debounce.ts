export interface SearchBarDebounceTimer {
  current: ReturnType<typeof setTimeout> | null;
}

export function cancelSearchBarDebounce(timer: SearchBarDebounceTimer): void {
  if (timer.current === null) return;
  clearTimeout(timer.current);
  timer.current = null;
}

export function scheduleSearchBarDebounce(
  timer: SearchBarDebounceTimer,
  callback: ((value: string) => void) | undefined,
  value: string,
  delay: number
): void {
  cancelSearchBarDebounce(timer);
  if (!Number.isFinite(delay) || delay <= 0) {
    callback?.(value);
    return;
  }
  timer.current = setTimeout(() => {
    timer.current = null;
    callback?.(value);
  }, delay);
}

export function flushSearchBarDebounce(
  timer: SearchBarDebounceTimer,
  callback: ((value: string) => void) | undefined,
  value: string
): void {
  cancelSearchBarDebounce(timer);
  callback?.(value);
}
