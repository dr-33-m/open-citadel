import { useEffect, useRef } from 'react';

export function normalizeCarouselIndex(index: number, count: number, loop: boolean): number {
  'worklet';
  if (count <= 0 || !Number.isFinite(index)) return 0;
  if (loop) return ((index % count) + count) % count;
  return Math.max(0, Math.min(index, count - 1));
}

interface CarouselIndexLifecycleOptions {
  requestedIndex: number;
  count: number;
  countKnown: boolean;
  loop: boolean;
  onCorrection: (index: number) => void;
  onSettledIndex: (index: number) => void;
}

/** Keeps the rendered position inside the current run and reports corrections once. */
export function useCarouselIndexLifecycle({
  requestedIndex,
  count,
  countKnown,
  loop,
  onCorrection,
  onSettledIndex,
}: CarouselIndexLifecycleOptions): number {
  const index = countKnown
    ? normalizeCarouselIndex(requestedIndex, count, loop)
    : requestedIndex;
  const reportedCorrection = useRef<string | null>(null);

  useEffect(() => {
    if (!countKnown) return;
    onSettledIndex(index);

    if (index === requestedIndex) {
      reportedCorrection.current = null;
      return;
    }

    const correction = `${requestedIndex}:${count}:${loop}`;
    if (reportedCorrection.current === correction) return;
    reportedCorrection.current = correction;
    onCorrection(index);
  }, [count, countKnown, index, loop, onCorrection, onSettledIndex, requestedIndex]);

  return index;
}

interface CarouselAutoplayOptions {
  enabled: boolean;
  index: number;
  count: number;
  loop: boolean;
  interval: number;
  onAdvance: (index: number) => void;
}

/** One autoplay request per accepted index; configuration changes re-arm it. */
export function useCarouselAutoplay({
  enabled,
  index,
  count,
  loop,
  interval,
  onAdvance,
}: CarouselAutoplayOptions): void {
  useEffect(() => {
    if (!enabled || count <= 1 || (!loop && index >= count - 1)) return;
    const timer = setTimeout(() => onAdvance(index + 1), interval);
    return () => clearTimeout(timer);
  }, [count, enabled, index, interval, loop, onAdvance]);
}
