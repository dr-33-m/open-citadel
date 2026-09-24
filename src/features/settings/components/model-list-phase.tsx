import React from 'react';
import { useCSSVariable } from 'uniwind';

import { PageFade } from '@/components/scroll-fades';
import { ModelListSkeleton } from '@/components/skeletons/model-list-skeleton';
import { Sheet } from '@/components/ui/sheet';
import { Swipe, useSwipeGroup } from '@/components/ui/swipe';
import { ModelPickerHeader } from '@/features/settings/components/model-picker-header';
import { ModelRow } from '@/features/settings/components/model-row';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';
import type { LocalModel } from '@/stores/model';
import { asColor } from '@/utils/colors';

type SheetState = ReturnType<typeof useModelSheet>;

const FILL: { flex: 1 } = { flex: 1 };
const keyOf = (model: LocalModel) => model.id;

/**
 * Every brain Samwell offers that this phone could run.
 *
 * The sheet is fixed height and the list scrolls inside it, the way the chat
 * history does: fifteen brains are taller than the screen, and a sheet sized
 * to its content capped its own height but not the list's, which then ran off
 * the bottom and would not scroll. The title stays put above the list.
 */
export function ModelListPhase({
  sheet,
  mutedForeground,
  primary,
  onDelete,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
  /** A full swipe or the tile deletes the download at once: the swipe's reach point is the confirmation. */
  onDelete: (id: string) => void;
}) {
  const skeleton = <ModelListSkeleton count={6} />;

  return (
    <>
      <ModelPickerHeader title="Choose Brain" />
      {/* Every row is a `Swipe`, a gesture and animated styles apiece, so the
          rows mount once the sheet has settled rather than during its rise. */}
      <Sheet.Deferred skeleton={skeleton}>
        {sheet.modelsHydrated ? (
          // `flex-1` on the group: the list inside has nothing to grow into
          // under an auto-height parent.
          <Swipe.Group className="flex-1">
            <ModelList
              models={sheet.models}
              activeModelId={sheet.activeModelId}
              onChoose={sheet.chooseModel}
              onDelete={onDelete}
              mutedForeground={mutedForeground}
              primary={primary}
            />
          </Swipe.Group>
        ) : (
          skeleton
        )}
      </Sheet.Deferred>
    </>
  );
}

/** The list itself, below `Swipe.Group` so it can close rows as a scroll starts. */
function ModelList({
  models,
  activeModelId,
  onChoose,
  onDelete,
  mutedForeground,
  primary,
}: {
  models: LocalModel[];
  activeModelId: string | null;
  onChoose: (id: string) => void;
  onDelete: (id: string) => void;
  mutedForeground?: string;
  primary?: string;
}) {
  const { closeAll } = useSwipeGroup();
  const foreground = asColor(useCSSVariable('--color-foreground'));

  const renderItem = React.useCallback(
    ({ item }: { item: LocalModel }) => (
      <ModelRow
        model={item}
        active={item.id === activeModelId}
        onChoose={onChoose}
        onDelete={onDelete}
        mutedForeground={mutedForeground}
        primary={primary}
        foreground={foreground}
      />
    ),
    [activeModelId, onChoose, onDelete, mutedForeground, primary, foreground],
  );

  return (
    // `popover`, so the fade resolves to the sheet's own ground.
    <PageFade edges="both" surface="popover">
      <Sheet.FlatList
        style={FILL}
        data={models}
        keyExtractor={keyOf}
        extraData={activeModelId}
        // A row dragged open is put back the moment a scroll begins, so it
        // never rides along into a recycled cell.
        onScrollBeginDrag={closeAll}
        renderItem={renderItem}
      />
    </PageFade>
  );
}
