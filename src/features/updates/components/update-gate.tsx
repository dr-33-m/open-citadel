import React from 'react';

import { useUpdateGate } from '../hooks/use-update-gate';
import { UpdateRequired } from './update-required';

/**
 * Whether this copy of the app is still served, mounted once at the root. A
 * container, so the gate's answers redraw this and not the layout.
 */
export function UpdateGate() {
  return <UpdateRequired {...useUpdateGate()} />;
}
