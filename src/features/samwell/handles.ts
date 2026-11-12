import React from 'react';
import type { TextInput } from 'react-native';

import type { PlansSheetHandle } from '@/features/billing/components/plans-sheet';
import type { BrainSheetHandle } from '@/features/chat/hooks/use-brain-sheet';

/*
 * The Samwell page's imperative handles, made once for the app.
 *
 * Each belongs to a part drawn in one place (the composer's field, the sheets
 * at the foot of the page) and is used from another (Compass's "work on it
 * more", the plan wall, the toolbox). Held here rather than threaded down from
 * the page, which would make the page re-render to pass them, and every part
 * under it with it.
 */

/** The composer's text field: Compass's "work on it more" puts the cursor in it. */
export const composerInput = React.createRef<TextInput>();

/** The plans sheet, raised over the plan wall. */
export const plansSheet = React.createRef<PlansSheetHandle>();

/** The brain picker, raised from the toolbox. */
export const brainSheet = React.createRef<BrainSheetHandle>();
