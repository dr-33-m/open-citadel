import React from 'react';
import { reorderItems, type ReorderableListReorderEvent } from 'react-native-reorderable-list';

/** A row dropped somewhere new: which, where it landed, and the whole order after it. */
export type DragMove = { id: string; to: number; order: string[] };

type Held<T> = { source: T[]; order: T[] };

/**
 * A dragged list's order, held on screen from the drop until the saved order
 * comes back.
 *
 * The list reports a drop once the row has landed, and the rows have to be in
 * their new order on that same render, or they spring back to the old one and
 * jump again when the write lands. So the moved order is kept here, for the
 * list it was made from; a new list from the data (the write answering, or
 * anything else changing) takes over from it.
 *
 * `onReorder` keeps one identity for the life of the list: it is handed to
 * every row, and a new one per drop would redraw all of them.
 */
export function useDragOrder<T>(items: T[], keyOf: (item: T) => string, save: (move: DragMove) => void) {
  const [held, setHeld] = React.useState<Held<T> | null>(null);
  const shown = held !== null && held.source === items ? held.order : items;

  const latest = React.useRef({ items, shown, keyOf, save });
  React.useLayoutEffect(() => {
    latest.current = { items, shown, keyOf, save };
  });

  const onReorder = React.useCallback(({ from, to }: ReorderableListReorderEvent) => {
    const now = latest.current;
    if (from === to || to < 0 || to >= now.shown.length) return;
    const order = reorderItems(now.shown, from, to);
    // Read by the next drop before React has rendered this one.
    latest.current = { ...now, shown: order };
    setHeld({ source: now.items, order });
    now.save({ id: now.keyOf(now.shown[from]), to, order: order.map(now.keyOf) });
  }, []);

  return { items: shown, onReorder };
}
