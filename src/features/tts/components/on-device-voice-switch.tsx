import React from 'react';

import { TextSwitch, type TextSwitchOption } from '@/components/text-switch';
import { ON_DEVICE_KINDS } from '@/features/tts/utils/voice-copy';
import type { OnDeviceMode } from '@/services/device-tts/catalogue';

const KINDS: readonly TextSwitchOption<OnDeviceMode>[] = ON_DEVICE_KINDS.map((kind) => ({
  value: kind.mode,
  label: kind.name.toUpperCase(),
  accessibilityLabel: `${kind.name} voices`,
}));

export interface OnDeviceVoiceSwitchProps {
  mode: OnDeviceMode;
  onChange: (mode: OnDeviceMode) => void;
}

/**
 * The two kinds of on-device voice, as one switch: Lite, the phone's own, and
 * Enhanced, the ones Open Citadel downloads.
 *
 * Words in the cells instead of icons: the two kinds have no icon that tells
 * them apart, and their names do. What each kind is, and its controls, are
 * under it and trade places as it moves (`SwitchPanes`). The switch itself
 * is `TextSwitch`, shared with the cloud's voice boxes.
 */
export function OnDeviceVoiceSwitch({ mode, onChange }: OnDeviceVoiceSwitchProps) {
  return <TextSwitch options={KINDS} value={mode} onChange={onChange} />;
}
