import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Touchable } from '@/components/ui/touchable';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { useColors } from '@/hooks/use-colors';
import { fontFamily, spacing } from '@/constants/theme';
import type { books as booksTable } from '@/db/schema';

type Book = typeof booksTable.$inferSelect;

type EditTitleSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onSave: (bookId: string, title: string) => void;
};

export function EditTitleSheet({
  visible,
  book,
  onClose,
  onSave,
}: EditTitleSheetProps) {
  const colors = useColors();
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (visible && book) {
      setTitle(book.title);
    }
  }, [visible, book]);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, justifyContent: 'flex-end' },
        overlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.5)',
        },
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
      }),
    [colors],
  );

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed || !book) return;
    onSave(book.id, trimmed);
    onClose();
  };

  const handleClose = () => {
    setTitle('');
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
        <Touchable style={styles.overlay} onPress={handleClose} />
        <KeyboardAvoidingView behavior="padding" style={styles.kavWrapper}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <ThemedText type="headlineSm">Edit Title</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Book title…"
              placeholderTextColor={colors.text.secondary}
              value={title}
              onChangeText={setTitle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <GoldButton label="SAVE" onPress={handleSave} />
            <Touchable onPress={handleClose} style={styles.cancel}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                CANCEL
              </ThemedText>
            </Touchable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
