import { Redirect, useIsFocused } from 'expo-router';
import React from 'react';

import { HubPager } from '@/components/hub/hub-pager';
import { useSettingsStore } from '@/stores/settings';

/**
 * The app's root route. Everything the hub is lives in `HubPager`; this file
 * only says where it sits in the router, and whether the reader has got there
 * yet.
 *
 * The redirect is safe to read synchronously and cannot flash: `_layout` holds
 * the splash until `loadSettings()` has resolved, so by the time anything here
 * renders, `onboarding` is the answer from disk rather than the store's
 * default. Redirecting from here rather than from the layout also means
 * `HubPager` is never mounted on a first run, and it is the most expensive
 * thing in the app to mount.
 *
 * Which is exactly why the focus gate below exists. `finish_onboarding` flips
 * the flag from inside the conversation, several seconds before the reader
 * presses GO TO MY LIBRARY — so without it, the hub would mount underneath a
 * reply that is still streaming, landing the app's heaviest mount on its
 * busiest frame. The gate only applies to a run that started pending, so
 * ordinary launches are untouched and the hub still stays mounted behind the
 * reader and Settings, which several screens depend on.
 *
 * `useIsFocused` comes from `expo-router`, which re-exports react-navigation's
 * own hook. Importing it from `@react-navigation/native` directly is a build
 * error as of SDK 56: expo-router owns the navigation tree now and refuses to
 * bundle alongside a second copy of it.
 */
export default function HubScreen() {
  const onboarding = useSettingsStore((s) => s.onboarding);
  const focused = useIsFocused();
  const [startedPending] = React.useState(() => onboarding === 'pending');

  if (onboarding === 'pending') return <Redirect href="/onboarding" />;
  if (startedPending && !focused) return null;

  return <HubPager />;
}
