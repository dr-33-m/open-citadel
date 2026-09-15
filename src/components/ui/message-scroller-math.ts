type MessageScrollerTarget = 'start' | 'end';

export const MESSAGE_SCROLLER_EDGE_THRESHOLD = 24;

/** Distance from the viewport to the edge a jump button targets. */
export function distanceFromMessageScrollerTarget(
  target: MessageScrollerTarget,
  contentOffsetY: number,
  contentHeight: number,
  viewportHeight: number
): number {
  'worklet';

  const maximumOffset = Math.max(0, contentHeight - viewportHeight);
  const boundedOffset = Math.min(maximumOffset, Math.max(0, contentOffsetY));
  return target === 'start' ? boundedOffset : maximumOffset - boundedOffset;
}

/** Whether the control has enough distance to its target edge to be useful. */
export function isMessageScrollerTargetVisible(distance: number): boolean {
  'worklet';

  return distance > MESSAGE_SCROLLER_EDGE_THRESHOLD;
}

export interface MessageScrollerIndexedItem {
  messageId: string;
  scrollAnchor?: boolean;
}

/** Index used by initial positioning and id-addressed virtualized jumps. */
export function messageScrollerIndex(
  items: readonly MessageScrollerIndexedItem[],
  id: string
): number | undefined {
  const index = items.findIndex((item) => item.messageId === id);
  return index < 0 ? undefined : index;
}

/** Initial target for a list; `undefined` means use the physical end. */
export function initialMessageScrollerIndex(
  items: readonly MessageScrollerIndexedItem[],
  position: 'start' | 'end' | 'last-anchor'
): number | undefined {
  if (position === 'end') return undefined;
  if (position === 'start') return items.length ? 0 : undefined;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]!.scrollAnchor) return index;
  }
  return undefined;
}

/** Anchor at or before the first visible virtualized row. */
export function messageScrollerAnchorAt(
  items: readonly MessageScrollerIndexedItem[],
  firstVisibleIndex: number
): string | null {
  for (let index = Math.min(firstVisibleIndex, items.length - 1); index >= 0; index -= 1) {
    if (items[index]!.scrollAnchor) return items[index]!.messageId;
  }
  return null;
}
