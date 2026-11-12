import { useSubscriptionStore } from '@/stores/subscription';

/**
 * How a menu's Listen row is drawn: open, or locked without a plan. Every
 * plan reaches a cloud voice, so the padlock is simply "no plan", and only
 * once that is known: a plan still being checked is not drawn locked.
 */
export function useListenState(): 'open' | 'locked' {
  return useSubscriptionStore((s) => (s.status === 'none' ? 'locked' : 'open'));
}
