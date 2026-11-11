import { OnboardingScreen } from '@/features/onboarding/components/onboarding-screen';
import { useInteractiveWhen } from '@/hooks/use-screen-interactive';

/**
 * The first run. Everything it is lives in `OnboardingScreen`; this file only
 * says where it sits in the router, and that it is the app's first usable
 * screen on a first launch (its time to interactive).
 */
export default function OnboardingRoute() {
  useInteractiveWhen(true);
  return <OnboardingScreen />;
}
