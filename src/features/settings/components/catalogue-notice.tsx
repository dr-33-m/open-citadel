import { useCSSVariable } from 'uniwind';

import { FieldHint } from '@/components/field-hint';
import { FlaskConical } from '@/components/icons';
import { asColor } from '@/utils/colors';

/**
 * The caution above the brain catalogue, folded the way Samwell's tips are.
 *
 * Worth reading once, and in the way of the list every time after: the reader
 * who has browsed before knows these brains are untested. Closed, it is one
 * row that still says what kind of list this is. The flask says "experiment"
 * before the words do; it stays muted because this is not Samwell talking.
 */
export function CatalogueNotice() {
  const mutedForeground = useCSSVariable('--color-muted-foreground');

  return (
    <FieldHint
      title="For tinkerers"
      name="note for tinkerers"
      icon={<FlaskConical size={16} color={asColor(mutedForeground)} strokeWidth={2} />}
    >
      Free to use, but not tested in Open Citadel, so some may run slowly or not at all. For a brain
      that just works, pick Gemma 4 E2B.
    </FieldHint>
  );
}
