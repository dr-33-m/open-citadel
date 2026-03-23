import { darkColors, lightColors } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

export function useColors() {
  const theme = useSettingsStore((s) => s.theme);
  return theme === 'light' ? lightColors : darkColors;
}
