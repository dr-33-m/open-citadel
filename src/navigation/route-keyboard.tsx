import { usePathname } from 'expo-router';
import React from 'react';
import { Keyboard } from 'react-native';

/**
 * The keyboard belongs to the screen it was opened on, so it goes when the
 * route changes, whichever way: a result opened from a search, a back press, a
 * drawer closed. Its own node, so a route change re-renders nothing else.
 */
export function RouteKeyboard() {
  const pathname = usePathname();
  React.useEffect(() => {
    Keyboard.dismiss();
  }, [pathname]);
  return null;
}
