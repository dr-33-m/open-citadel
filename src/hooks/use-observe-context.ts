import React from 'react';

import { setObserveContext } from '@/lib/observe';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';

/**
 * Keeps the facts every Observe event carries up to date: which engine
 * Samwell runs on and which brain, and the plan. These are what most
 * differences in speed come down to, so every timing can be split by them.
 * Nothing about who the reader is.
 */
export function useObserveContext(): void {
  const engine = useSettingsStore((s) => s.samwellMode);
  const cloudModel = useSettingsStore((s) => s.cloudModelId);
  const deviceModel = useModelStore((s) => s.activeModelId);
  const plan = useSubscriptionStore((s) => s.plan);

  React.useEffect(() => {
    setObserveContext({
      samwellEngine: engine === 'cloud' ? 'cloud' : 'device',
      samwellModel: engine === 'cloud' ? cloudModel : deviceModel,
      plan: plan ?? 'none',
    });
  }, [engine, cloudModel, deviceModel, plan]);
}
