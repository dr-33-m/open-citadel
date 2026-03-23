import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

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
    container: { flex: 1, justifyContent: 'flex-end' },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    kavWrapper: { backgroundColor: colors.surface.low },
    sheet: {
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[6],
      paddingTop: spacing[4],
      paddingBottom: spacing[10],
      gap: spacing[5],
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.surface.highest,
      alignSelf: 'center',
      marginBottom: spacing[2],
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <Pressable style={styles.overlay} onPress={handleClose} />
        <KeyboardAvoidingView behavior="padding" style={styles.kavWrapper}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ThemedText type="headlineSm">New Collection</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Collection name…"
              placeholderTextColor={colors.text.secondary}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <GoldButton label="CREATE" onPress={handleCreate} />
            <Pressable onPress={handleClose} style={styles.cancel}>
              <ThemedText type="labelSm" color={colors.text.secondary}>CANCEL</ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
