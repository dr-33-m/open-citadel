import { HubPager } from '@/components/hub/hub-pager';

/**
 * The app's root route. Everything the hub is lives in `HubPager`; this file
 * only says where it sits in the router.
 */
export default function HubScreen() {
  return <HubPager />;
}
