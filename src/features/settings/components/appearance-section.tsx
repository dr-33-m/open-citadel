import React from 'react';
import { View } from 'react-native';
import { Sun } from '@/components/icons';

import { SettingsSection } from '@/features/settings/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Switch } from '@/components/ui/switch';
import { Touchable } from '@/components/ui/touchable';
import { useThemeMode } from '@/hooks/use-theme';

/** Light/dark, via the PanelUI theme hook rather than the store directly. */
export const AppearanceSection = React.memo(function AppearanceSection() {
  const { mode, setMode } = useThemeMode();

  // Drive the control from local state so the thumb moves on the same frame as
  // the tap, ahead of the store write and the theme-token cascade both landing
  // (see `app/_layout.tsx`). `mode` is the source of truth and reconciles this
  // the moment it catches up.
  const [light, setLight] = React.useState(mode === 'light');
  React.useEffect(() => {
    setLight(mode === 'light');
  }, [mode]);

  const apply = React.useCallback(
    (next: boolean) => {
      setLight(next);
      setMode(next ? 'light' : 'dark');
    },
    [setMode],
  );

  return (
    <SettingsSection label="APPEARANCE">
      <Touchable onPress={() => apply(!light)}>
        <Card className="flex-row items-center justify-between p-4">
          <View className="flex-row items-center gap-3">
            <PrefixIcon icon={Sun} size={36} />
            <ThemedText type="bodyMd">Light Mode</ThemedText>
          </View>
          <Switch value={light} onValueChange={apply} />
        </Card>
      </Touchable>
    </SettingsSection>
  );
});
