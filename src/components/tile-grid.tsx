import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { TransitionFlashList } from '@/components/navigation/transition-scroll';
import { LIST_DRAW_DISTANCE, MaxContentWidth, layout } from '@/constants/theme';

const GAP = 16;

type TileGridProps<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** One tile, drawn at the grid's column width. */
  renderTile: (item: T, width: number) => React.ReactElement;
  empty: React.ReactElement;
  bottomPadding: number;
};

/**
 * Tiles two to a row (followed shows, a genre's chart, followed blogs), on
 * the screen's own list so drag-to-close still works.
 */
export function TileGrid<T>({ items, keyOf, renderTile, empty, bottomPadding }: TileGridProps<T>) {
  const { width } = useWindowDimensions();
  const tileWidth = (Math.min(width, MaxContentWidth) - layout.gutter * 2 - GAP) / 2;
  const renderItem = React.useCallback(
    ({ item, index }: { item: T; index: number }) => {
      // FlashList has no column gap: each cell pads toward its neighbour by half of it.
      const left = index % 2 === 0;
      const cell = {
        paddingLeft: left ? layout.gutter : GAP / 2,
        paddingRight: left ? GAP / 2 : layout.gutter,
        paddingBottom: GAP,
      };
      return <View style={cell}>{renderTile(item, tileWidth)}</View>;
    },
    [renderTile, tileWidth],
  );

  return (
    <TransitionFlashList
      data={items}
      keyExtractor={keyOf}
      renderItem={renderItem}
      numColumns={2}
      drawDistance={LIST_DRAW_DISTANCE}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListEmptyComponent={empty}
    />
  );
}
