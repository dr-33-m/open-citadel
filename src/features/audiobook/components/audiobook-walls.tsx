import React from 'react';

import { useAudiobookLifecycle } from '@/features/audiobook/hooks/use-audiobook-lifecycle';
import { PlansSheet } from '@/features/billing/components/plans-sheet';

/**
 * The audiobook's app-wide part, mounted once at the root: restoring the book
 * after a restart, and the plans raised in place when the voice stops for want
 * of one. A container, so its state re-renders this and not the app.
 */
export function AudiobookWalls({ ready }: { ready: boolean }) {
  const plans = useAudiobookLifecycle(ready);
  return <PlansSheet {...plans} />;
}
