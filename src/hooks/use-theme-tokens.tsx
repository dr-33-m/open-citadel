import React from 'react';
import { useCSSVariable } from 'uniwind';

import { asColor } from '@/utils/colors';

/**
 * The theme tokens the app's two most-instantiated primitives need, resolved
 * once for the whole tree.
 *
 * `useCSSVariable` subscribes each caller to Uniwind's theme store
 * individually, and answers a theme change with a `setState` per subscriber.
 * That is fine for a screen that calls it once; it is not fine for
 * `ThemedText`, which appears two or three times in every list row — a
 * twenty-book grid alone opens forty subscriptions, and a single theme flip
 * then schedules forty separate updates on top of every other subscriber in
 * the app. That fan-out is what made the toggle lag behind the switch, and it
 * is paid again on every mount: a sheet's rows each open (and tear down) their
 * own subscription before the sheet can measure and start animating.
 *
 * One subscription here, one context value, one update. Consumers re-render
 * from context, which React propagates directly to them without scheduling
 * per-component work.
 *
 * Deliberately narrow: this is not a general theming layer, it is the set of
 * tokens whose call sites are multiplied by list length. A screen that reads a
 * token once should keep calling `useCSSVariable` — it costs one subscription
 * and stays local to the thing that needs it.
 */
const TOKENS = [
  '--color-foreground',
  '--color-background',
  '--color-card',
  '--color-muted',
  '--color-surface-tertiary',
] as const;

type TokenName = (typeof TOKENS)[number];
export type ThemeTokens = Record<TokenName, string | undefined>;

/** Stable identity so the hook below never re-resolves on a re-render. */
const TOKEN_LIST: string[] = [...TOKENS];

const EMPTY: ThemeTokens = {
  '--color-foreground': undefined,
  '--color-background': undefined,
  '--color-card': undefined,
  '--color-muted': undefined,
  '--color-surface-tertiary': undefined,
};

const ThemeTokensContext = React.createContext<ThemeTokens>(EMPTY);

/**
 * Mounts outermost in the root layout — above `PanelUIProvider`, so the portal
 * host every sheet presents into is inside it too. A sheet rendered into a
 * portal is still a child of this provider in the React tree, which is the
 * only tree that matters here.
 */
export function ThemeTokensProvider({ children }: { children: React.ReactNode }) {
  const values = useCSSVariable(TOKEN_LIST);

  const tokens = React.useMemo(() => {
    const next = {} as ThemeTokens;
    for (let i = 0; i < TOKENS.length; i++) {
      next[TOKENS[i]] = asColor(values[i]);
    }
    return next;
  }, [values]);

  return <ThemeTokensContext.Provider value={tokens}>{children}</ThemeTokensContext.Provider>;
}

/** The resolved tokens. Live: re-renders the caller on a theme change. */
export function useThemeTokens(): ThemeTokens {
  return React.useContext(ThemeTokensContext);
}
