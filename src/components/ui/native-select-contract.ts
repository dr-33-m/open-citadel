interface NativeSelectOption {
  disabled?: boolean;
}

/**
 * The portable @expo/ui picker can disable the whole control, but not one
 * option. Keep the styled Select when an item needs that distinction rather
 * than silently turning a disabled choice back into a selectable one.
 */
export function nativeSelectSupportsOptions(options: NativeSelectOption[]): boolean {
  return options.every((option) => !option.disabled);
}
