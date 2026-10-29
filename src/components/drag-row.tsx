import React from 'react';
import { Pressable, View } from 'react-native';
import { useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list';

import { GripVertical } from '@/components/icons';
import { cn } from '@/lib/cn';

type DragRowProps = {
  index: number;
  last: number;
  enabled: boolean;
  /** The list's ground, as a class. */
  ground: string;
  grip: string | undefined;
  /** The grip's margins, which depend on how the row pads its own edge. */
  gripPlace: string;
  /** A move of one place, from a screen reader's action. */
  onStep: (event: ReorderableListReorderEvent) => void;
  children: React.ReactNode;
};

/**
 * One row and its grip. The row keeps its own presses; only the grip lifts
 * it, on the touch rather than after a hold, so a drag starts the moment a
 * finger lands there.
 *
 * The row stands on the list's ground so that, carried over the others, it
 * is never see-through. A drag means nothing to a screen reader, so the grip
 * offers Move up and Move down instead, the way the old arrows did.
 */
export function DragRow({ index, last, enabled, ground, grip, gripPlace, onStep, children }: DragRowProps) {
  const drag = useReorderableDrag();
  // `adjustable` promises a swipe up or down; up is toward the top, as Move up is.
  const actions = React.useMemo(
    () => [
      ...(index > 0 ? [{ name: 'increment' }, { name: 'moveUp', label: 'Move up' }] : []),
      ...(index < last ? [{ name: 'decrement' }, { name: 'moveDown', label: 'Move down' }] : []),
    ],
    [index, last],
  );
  const onAction = React.useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const name = event.nativeEvent.actionName;
      const up = name === 'moveUp' || name === 'increment';
      onStep({ from: index, to: up ? index - 1 : index + 1 });
    },
    [index, onStep],
  );
  const position = { text: `Position ${index + 1} of ${last + 1}` };

  return (
    <View className={cn('flex-row items-center', ground)}>
      <View className="flex-1">{children}</View>
      {enabled ? (
        <Pressable
          onPressIn={drag}
          hitSlop={8}
          className={cn('h-12 w-10 items-center justify-center', gripPlace)}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to reorder"
          accessibilityValue={position}
          accessibilityActions={actions}
          onAccessibilityAction={onAction}
        >
          <GripVertical size={18} color={grip} />
        </Pressable>
      ) : null}
    </View>
  );
}
