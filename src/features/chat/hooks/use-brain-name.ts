import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { useSubscriptionStore } from '@/stores/subscription';
import { brainName } from '@/utils/plan-name';

/**
 * The brain Samwell thinks with, by name, for the composer's toolbox: the
 * chosen cloud brain, or the phone's active one. Null before there is one.
 * Each selector returns a string, so a balance spent or a download ticking
 * along does not redraw the page that reads it.
 */
export function useBrainName(cloud: boolean): string | null {
  const cloudModelId = useSettingsStore((s) => s.cloudModelId);
  const cloudName = useSubscriptionStore((s) => {
    const model = s.models.find((candidate) => candidate.id === cloudModelId);
    return model ? brainName(model) : null;
  });
  const deviceName = useModelStore((s) => s.models.find((candidate) => candidate.id === s.activeModelId)?.name ?? null);
  return cloud ? cloudName : deviceName;
}
