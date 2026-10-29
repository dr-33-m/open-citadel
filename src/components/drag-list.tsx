import React from 'react';
import type { ListRenderItem, ListRenderItemInfo, StyleProp, ViewStyle } from 'react-native';
import ReorderableList, { type ReorderableListCellAnimations, type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import { useReducedMotion } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Transition from 'react-native-screen-transitions';

import { DragRow } from '@/components/drag-row';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { haptics } from '@/utils/haptics';

/*
 * A page's list reports its scroll to the screen's slide, as every page list
 * here does (`navigation/transition-scroll`): without it the drawer takes a
 * downward drag meant for the list as the screen closing. The list is already
 * an animated FlatList that composes the `onScroll` handed to it, so it is
 * wrapped as it is rather than animated a second time.
 */
const PageReorderableList = Transition.createTransitionAwareComponent(ReorderableList, {
  isScrollable: true,
  alreadyAnimated: true,
}) as unknown as typeof ReorderableList;

/*
 * The library dims a carried row by default, which lets the rows it passes
 * show through it. It keeps its small lift; the row's own ground (`DragRow`) is
 * what keeps it solid. With motion turned down the lift goes too: the row
 * still follows the finger, which is the drag itself, not decoration.
 */
const CELL_ANIMATIONS: ReorderableListCellAnimations = { opacity: 1 };
const CELL_ANIMATIONS_REDUCED: ReorderableListCellAnimations = { opacity: 1, transform: [] };

/*
 * Where the grip sits. A page's rows pad 24 from the edge, so the grip takes
 * part of that padding rather than adding its own beside it; a sheet's rows
 * end in their own controls and pad less, so it sits after them.
 */
const GRIP_PLACE = { page: '-ml-4 mr-2', sheet: 'mr-1' } as const;

/** About two screens of rows either side, the same reach as the app's FlashLists. */
const WINDOW = 5;
const FIRST_BATCH = 8;

type DragListProps<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  /** The row, drawn as any other list of these draws it; the grip is added beside it. */
  renderItem: ListRenderItem<T>;
  onReorder: (event: ReorderableListReorderEvent) => void;
  /** Off while a search narrows the list: a move among some of the rows has no place in all of them. The grips go with it. */
  dragEnabled: boolean;
  /** A page that slides, or a sheet. Decides the list's ground and whether it reports to the slide. */
  host: 'page' | 'sheet';
  ItemSeparatorComponent?: React.ComponentType | null;
  ListEmptyComponent?: React.ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * A list whose rows can be put in order by dragging their grip: the queues,
 * and Up Next. One list for all of them, so a fix to the drag lands in each.
 *
 * Virtualized like every list here (a FlatList underneath, from
 * react-native-reorderable-list, which MetaMask ships the same way): a queue
 * of five hundred mounts the same few screens of rows as one of five. Only
 * the grip lifts a row, so a tap still opens it and a long press still opens
 * its menu. A drag carried to an edge scrolls the list.
 *
 * The order is the caller's. `onReorder` says where a row was dropped once it
 * has landed; `useDragOrder` holds that order on screen until the saved one
 * comes back.
 */
export function DragList<T>({
  data,
  keyExtractor,
  renderItem,
  onReorder,
  dragEnabled,
  host,
  ItemSeparatorComponent,
  ListEmptyComponent,
  contentContainerStyle,
}: DragListProps<T>) {
  const tokens = useThemeTokens();
  const ground = host === 'sheet' ? 'bg-popover' : 'bg-background';
  const grip = tokens['--color-muted-foreground'];
  const reducedMotion = useReducedMotion();
  const last = data.length - 1;

  const renderRow = React.useCallback(
    (info: ListRenderItemInfo<T>) => (
      <DragRow
        index={info.index}
        last={last}
        enabled={dragEnabled}
        ground={ground}
        grip={grip}
        gripPlace={GRIP_PLACE[host]}
        onStep={onReorder}
      >
        {renderItem(info)}
      </DragRow>
    ),
    [dragEnabled, grip, ground, host, last, onReorder, renderItem],
  );

  const List = host === 'page' ? PageReorderableList : ReorderableList;
  return (
    <List
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      onReorder={onReorder}
      onDragStart={onLift}
      onIndexChange={onPass}
      dragEnabled={dragEnabled}
      cellAnimations={reducedMotion ? CELL_ANIMATIONS_REDUCED : CELL_ANIMATIONS}
      ItemSeparatorComponent={ItemSeparatorComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={contentContainerStyle}
      initialNumToRender={FIRST_BATCH}
      maxToRenderPerBatch={FIRST_BATCH}
      windowSize={WINDOW}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

/*
 * A knock as the row comes up, and a tick for every place it passes: each
 * fires once, at the moment it happens, never per frame.
 */
function onLift() {
  'worklet';
  scheduleOnRN(haptics.tap);
}
function onPass() {
  'worklet';
  scheduleOnRN(haptics.select);
}
