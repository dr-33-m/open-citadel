import React from 'react';
import { TextInput, View } from 'react-native';
import { User } from 'lucide-react-native';
import { useCSSVariable } from 'uniwind';

import { SettingsSection } from '@/features/settings/components/settings-section';
import { usePlayerRank } from '@/features/settings/hooks/use-player-rank';
import { ThemedText } from '@/components/themed-text';
import { asColor } from '@/utils/colors';
import { useSettingsStore } from '@/stores/settings';
import { fontFamily, iconSize } from '@/constants/theme';
import { SCORE_GREEN, SCORE_RED } from '@/components/compass/format';

/**
 * Display name plus the earned rank beside it. Owns the edit draft — the
 * store only hears about a name on blur/submit, not per keystroke.
 */
export const ProfileSection = React.memo(function ProfileSection() {
  const [primary, mutedForeground, foreground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-foreground',
  ]);
  const username = useSettingsStore((s) => s.username);
  const setUsername = useSettingsStore((s) => s.setUsername);
  const [editingName, setEditingName] = React.useState(username);
  const playerRank = usePlayerRank();

  const commitName = () => {
    const trimmed = editingName.trim();
    if (trimmed !== username) setUsername(trimmed);
  };

  return (
    <SettingsSection label="PROFILE" divider={false} className="mt-6 gap-4">
      <View className="flex-row items-center gap-3 bg-muted px-4">
        <User size={iconSize.default} color={asColor(foreground)} strokeWidth={2} />
        <TextInput
          className="flex-1 py-4 text-[16px] text-foreground"
          style={{ fontFamily: fontFamily.sans }}
          placeholder="Display name"
          placeholderTextColor={asColor(mutedForeground)}
          value={editingName}
          onChangeText={setEditingName}
          onBlur={commitName}
          onSubmitEditing={commitName}
          returnKeyType="done"
          autoCorrect={false}
        />
        {playerRank && (
          <View
            className="h-7 w-7 items-center justify-center border"
            style={{
              borderColor:
                playerRank === 'A' ? SCORE_GREEN : playerRank === 'C' ? SCORE_RED : asColor(primary),
            }}
          >
            <ThemedText
              type="labelMd"
              color={playerRank === 'A' ? SCORE_GREEN : playerRank === 'C' ? SCORE_RED : asColor(primary)}
            >
              {playerRank}
            </ThemedText>
          </View>
        )}
      </View>
    </SettingsSection>
  );
});
