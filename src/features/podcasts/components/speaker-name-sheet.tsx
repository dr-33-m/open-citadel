import React from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

type SpeakerNameSheetProps = {
  visible: boolean;
  /** The name as it stands: "Speaker 3", or what Samwell worked out. */
  name: string;
  onClose: () => void;
  onSave: (name: string) => void;
};

/**
 * Correcting who a speaker is, for every line they have. The keyboard opens
 * only on a tap in the field, never with the sheet.
 */
export function SpeakerNameSheet({ visible, name, onClose, onSave }: SpeakerNameSheetProps) {
  const tokens = useThemeTokens();
  const [draft, setDraft] = React.useState(name);
  // A new speaker, a fresh draft: kept while open so a slip can be mended.
  const [shown, setShown] = React.useState(name);
  if (shown !== name) {
    setShown(name);
    setDraft(name);
  }
  const clean = draft.trim();
  const save = () => {
    if (!clean) return;
    onSave(clean);
  };

  return (
    <Sheet visible={visible} onClose={onClose} stackBehavior="push">
      <View className="gap-6 px-6 pb-2">
        <View className="gap-1">
          <ThemedText type="headlineSm">Who is speaking?</ThemedText>
          <ThemedText type="bodySm" color={tokens['--color-muted-foreground']}>
            The name changes on every line they say, and for Samwell too.
          </ThemedText>
        </View>
        <Input
          key={name}
          defaultValue={name}
          onChangeText={setDraft}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Speaker's name"
        />
        <GoldButton label="SAVE" onPress={save} disabled={!clean || clean === name} />
      </View>
    </Sheet>
  );
}
