import { OnboardingScreen } from '@/features/onboarding/components/onboarding-screen';

/**
 * The first run. Everything it is lives in `OnboardingScreen`; this file only
 * says where it sits in the router.
 */
export default function OnboardingRoute() {
  return <OnboardingScreen />;
}
