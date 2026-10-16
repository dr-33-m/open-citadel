import React from 'react';
import { useCSSVariable } from 'uniwind';

import { ShieldLock } from '@/components/icons';
import { Touchable } from '@/components/ui/touchable';
import { asColor } from '@/utils/colors';

interface PrivacyButtonProps {
  /** Raises the sheet saying what happens to what was said (`PrivacySheet`). */
  onOpen: () => void;
}

/**
 * A green shield at the far end of a cloud reply's footer: the reply came
 * from a brain that keeps nothing. Green, the one place it is, because it is
 * a status that is good news rather than an action. A tap says what that
 * means.
 */
export const PrivacyButton = React.memo(function PrivacyButton({ onOpen }: PrivacyButtonProps) {
  const [success] = useCSSVariable(['--color-success']);
  return (
    <Touchable
      onPress={onOpen}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Private. Nothing you say is kept. Show how."
      className="ms-auto py-1"
    >
      <ShieldLock size={16} color={asColor(success)} />
    </Touchable>
  );
});
