import React, { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { CollectionName, isFilled } from '@/lib/text-fields';
import { asColor } from '@/utils/colors';

type NewCollectionPromptProps = {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function NewCollectionPrompt({
  visible,
  onClose,
  onCreate,
}: NewCollectionPromptProps) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const [name, setName] = useState('');
  /*
   * Uncontrolled field: the text lives in the native buffer and React only
   * mirrors it out, never back in — a keystroke landing while JS is busy
   * can no longer be committed over by a stale `value` (dropped letters,
   * duplicated words). Resets go through the ref's `clear()`, which empties
   * the buffer where it actually lives.
   */
  const fieldRef = useRef<TextInput>(null);

  const canCreate = isFilled(CollectionName, name);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
    fieldRef.current?.clear();
  };

  const handleClose = () => {
    setName('');
    fieldRef.current?.clear();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleClose}>
      <View className="gap-6 px-6">
        <ThemedText type="headlineSm">New Collection</ThemedText>
        <Input
          ref={fieldRef}
          placeholder="Collection name…"
          onChangeText={setName}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <View className="gap-3">
          <GoldButton label="CREATE" onPress={handleCreate} disabled={!canCreate} />
          <Touchable onPress={handleClose} className="items-center py-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>CANCEL</ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
