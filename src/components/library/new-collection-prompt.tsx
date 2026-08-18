import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { useColors } from '@/hooks/use-colors';
import { fontFamily, spacing } from '@/constants/theme';

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
  const colors = useColors();
  const [name, setName] = useState('');

  const styles = React.useMemo(() => StyleSheet.create({
    sheet: {
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[6],
      paddingTop: spacing[4],
      paddingBottom: spacing[10],
      gap: spacing[5],
    },
    input: {
      backgroundColor: colors.surface.mid,
      color: colors.text.primary,
      fontFamily: fontFamily.sans,
      fontSize: 16,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[4],
    },
    cancel: {
      alignItems: 'center',
      paddingVertical: spacing[3],
    },
  }), [colors]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleClose}>
      <View style={styles.sheet}>
        <ThemedText type="headlineSm">New Collection</ThemedText>
        <BottomSheetTextInput
          style={styles.input}
          placeholder="Collection name…"
          placeholderTextColor={colors.text.secondary}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <GoldButton label="CREATE" onPress={handleCreate} />
        <Touchable onPress={handleClose} style={styles.cancel}>
          <ThemedText type="labelSm" color={colors.text.secondary}>CANCEL</ThemedText>
        </Touchable>
      </View>
    </Sheet>
  );
}
