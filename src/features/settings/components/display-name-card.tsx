import React from 'react';
import { TextInput, View } from 'react-native';
import { User } from '@/components/icons';
import { useCSSVariable } from 'uniwind';

import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { asColor } from '@/utils/colors';
import { useSettingsStore } from '@/stores/settings';
import { fontFamily } from '@/constants/theme';

/**
 * What Samwell calls you. Owns the edit draft — the store only hears about a
 * name on blur/submit, not per keystroke.
 *
 * Local, and it stays local even with an account signed in. It is the one
 * piece of identity that works for someone who never makes an account, and
 * there is no reason a display name should need one.
 */
export const DisplayNameCard = React.memo(function DisplayNameCard() {
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const username = useSettingsStore((s) => s.username);
  const setUsername = useSettingsStore((s) => s.setUsername);
  const [editingName, setEditingName] = React.useState(username);

  const commitName = () => {
    const trimmed = editingName.trim();
    if (trimmed !== username) setUsername(trimmed);
  };

  return (
    // A card holding the field, not a bare strip of colour on the page.
    // The field is `inset` — a translucent darkening, so it is literally a
    // darker shade of whatever the card under it is, in either theme. It is
    // the same token the vendored Card uses for a band set into itself, and
    // `muted` was wrong here: `muted` is its own flat surface, so against
    // the card it read as a second, unrelated block rather than as a well
    // sunk into the one it sits on.
    <Card className="p-4">
      <View className="flex-row items-center gap-3 bg-inset px-4">
        {/* The same bordered badge every other settings row leads with. */}
        <PrefixIcon icon={User} size={36} />
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
      </View>
    </Card>
  );
});
