import { Sheet } from '@/components/ui/sheet';
import { ModelBrowsePhase } from '@/features/settings/components/model-browse-phase';
import { ModelFilesPhase } from '@/features/settings/components/model-files-phase';
import { ModelListPhase } from '@/features/settings/components/model-list-phase';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';

type SheetState = ReturnType<typeof useModelSheet>;

/**
 * The offline brain picker, as two sheets.
 *
 * The brains on this phone are a short list, so their sheet is as tall as the
 * list and no taller. Browsing opens a second, taller sheet pushed on top of
 * it, the way the Compass drawers stack over the toolbox: the catalogue and a
 * brain's versions live there at a fixed height, so the title and the filter
 * field stay put while results come and go, and a drag down lands back on the
 * list underneath.
 */
export function ModelPickerSheet({
  sheet,
  mutedForeground,
  primary,
  onDelete,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
  /** Swipe-delete removes the brain at once; the swipe is the confirmation. */
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <Sheet visible={sheet.visible} onClose={sheet.close} maxHeightRatio={0.8} scrollable>
        <ModelListPhase
          sheet={sheet}
          mutedForeground={mutedForeground}
          primary={primary}
          onDelete={onDelete}
        />
      </Sheet>
      <Sheet
        visible={sheet.visible && sheet.view === 'hf'}
        onClose={sheet.backToList}
        stackBehavior="push"
        fixedHeightRatio={0.9}
      >
        {sheet.repo ? (
          <ModelFilesPhase sheet={sheet} mutedForeground={mutedForeground} primary={primary} />
        ) : (
          <ModelBrowsePhase sheet={sheet} mutedForeground={mutedForeground} primary={primary} />
        )}
      </Sheet>
    </>
  );
}
