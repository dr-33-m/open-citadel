/**
 * The app's two scroll fades.
 *
 * PanelUI's `ScrollFade` is the mechanism — it holds scroll offset, content
 * size and viewport size in shared values and drives the gradients on the UI
 * thread, so scrolling never re-renders React. These two wrappers are the
 * *decisions*: how deep the fade goes, which edges get one, and whether the
 * wrapper carries the flex.
 *
 * They exist so those decisions live in one file rather than in a `size=` at
 * every call site. Change a number here and every shelf or page in the app
 * moves together.
 *
 * Depth is deliberately shallow. The fade is a hint that content continues
 * past the boundary, not a vignette — pulled too far inwards it stops reading
 * as an edge treatment and starts dimming content the reader is trying to
 * read.
 */
import React from 'react';
import { useCSSVariable } from 'uniwind';

import { ScrollFade } from '@/components/ui/scroll-fade';
import { useMessageScrollerEdgeDistance } from '@/components/ui/message-scroller';
import { asColor } from '@/utils/colors';

/**
 * Which ground the fade has to blend into.
 *
 * A gradient that resolves to the wrong colour does not disappear — it draws a
 * visible band of the wrong shade along the edge, which is worse than no fade
 * at all. Sheets sit on `popover`, everything else on `background`.
 */
export type FadeSurface = 'background' | 'popover';

function useFadeColor(surface: FadeSurface) {
  const [background, popover] = useCSSVariable(['--color-background', '--color-popover']);
  return asColor(surface === 'popover' ? popover : background);
}

/**
 * Shelves get less depth than pages: a book cover is only ~130px wide, so a
 * deep fade would wash out most of a card rather than the sliver past the edge.
 */
const ROW_FADE = 20;
const PAGE_FADE = 24;

/**
 * A horizontal shelf — book rows, collections.
 *
 * Both edges, because a shelf can be scrolled from either end and the fade is
 * the only thing saying so; there is no scrollbar (they are all hidden).
 */
export function RowFade({
  surface = 'background',
  children,
}: {
  surface?: FadeSurface;
  children: React.ReactNode;
}) {
  const color = useFadeColor(surface);
  return (
    <ScrollFade size={ROW_FADE} color={color}>
      {children}
    </ScrollFade>
  );
}

/**
 * A vertical page or transcript.
 *
 * `edges="start"` is the header treatment: it replaces the bar's bottom rule,
 * so content passes under the header and fades rather than being cut by a
 * line. `edges="both"` adds the same at the bottom, for the two screens where
 * content also runs under a floating input card.
 *
 * Carries `flex-1` because it stands in for the scrollable as the flex child —
 * without it the ScrollView's own `flex-1` resolves against a wrapper that
 * sized itself to nothing, and the whole page collapses.
 */
export function PageFade({
  edges = 'start',
  surface = 'background',
  children,
}: {
  edges?: 'start' | 'both';
  surface?: FadeSurface;
  children: React.ReactNode;
}) {
  const color = useFadeColor(surface);
  return (
    <ScrollFade className="flex-1" size={PAGE_FADE} edges={edges} color={color}>
      {children}
    </ScrollFade>
  );
}

/**
 * `PageFade` for a transcript — the same depth and the same colours, reading
 * the scroll from `MessageScroller` instead of from the child.
 *
 * A transcript's scrollable is the library's, and it owns its scroll events:
 * following the live edge, holding position through a prepend and opening on
 * the right turn are all reactions to them. So the fade cannot wrap the
 * scrollable and put a handler of its own on it; it takes the distances the
 * scroller is already tracking. Must be rendered inside a `MessageScroller`.
 */
export function TranscriptFade({
  edges = 'both',
  surface = 'background',
  children,
}: {
  edges?: 'start' | 'both';
  surface?: FadeSurface;
  children: React.ReactNode;
}) {
  const color = useFadeColor(surface);
  const distance = useMessageScrollerEdgeDistance();
  return (
    <ScrollFade
      className="flex-1"
      size={PAGE_FADE}
      edges={edges}
      color={color}
      distance={distance}
    >
      {children}
    </ScrollFade>
  );
}
