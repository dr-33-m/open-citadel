import { Sheet } from '@/components/ui/sheet';
import { ModelListPhase } from '@/features/settings/components/model-list-phase';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';

type SheetState = ReturnType<typeof useModelSheet>;

/**
 * The offline brain picker.
 *
 * As tall as the list and no taller, up to most of the screen: every brain
 * Samwell offers is in it, so it is the whole of the choice.
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
  /** Swipe-delete removes a brain's download at once; the swipe is the confirmation. */
  onDelete: (id: string) => void;
}) {
  return (
    <Sheet visible={sheet.visible} onClose={sheet.close} maxHeightRatio={0.8} scrollable>
      <ModelListPhase
        sheet={sheet}
        mutedForeground={mutedForeground}
        primary={primary}
        onDelete={onDelete}
      />
    </Sheet>
  );
}
