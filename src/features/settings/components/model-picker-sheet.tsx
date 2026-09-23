import { Sheet } from '@/components/ui/sheet';
import { ModelListPhase } from '@/features/settings/components/model-list-phase';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';

type SheetState = ReturnType<typeof useModelSheet>;

/**
 * The offline brain picker.
 *
 * Fixed at most of the screen, with the list scrolling inside: every brain
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
    <Sheet visible={sheet.visible} onClose={sheet.close} fixedHeightRatio={0.8}>
      <ModelListPhase
        sheet={sheet}
        mutedForeground={mutedForeground}
        primary={primary}
        onDelete={onDelete}
      />
    </Sheet>
  );
}
