import React from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Touchable } from "@/components/ui/touchable";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

type NotePickerModalProps = {
  visible: boolean;
  notes: string[];
  onSelect: (noteText: string | null) => void;
  onClose: () => void;
};

export function NotePickerModal({
  visible,
  notes,
  onSelect,
  onClose,
}: NotePickerModalProps) {
  const colors = useColors();

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, justifyContent: "flex-end" },
        overlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(0,0,0,0.5)",
        },
        sheet: {
          backgroundColor: colors.surface.low,
          paddingHorizontal: spacing[6],
          paddingTop: spacing[4],
          paddingBottom: spacing[10],
          maxHeight: "60%",
        },
        handle: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: "center",
          marginBottom: spacing[4],
        },
        title: {
          marginBottom: spacing[4],
        },
        noteRow: {
          backgroundColor: colors.surface.mid,
          padding: spacing[4],
          marginBottom: spacing[2],
        },
        noNoteRow: {
          alignItems: "center",
          paddingVertical: spacing[4],
          marginTop: spacing[2],
        },
      }),
    [colors],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Touchable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ThemedText
            type="labelMd"
            color={colors.text.secondary}
            style={styles.title}
          >
            SELECT A NOTE FOR EXPORT
          </ThemedText>

          <ScrollView showsVerticalScrollIndicator={false}>
            {notes.map((note, index) => (
              <Touchable
                key={index}
                style={styles.noteRow}
                onPress={() => onSelect(note)}
              >
                <ThemedText
                  type="bodySm"
                  color={colors.text.primary}
                  numberOfLines={3}
                >
                  {note}
                </ThemedText>
              </Touchable>
            ))}

            <Touchable
              style={styles.noNoteRow}
              onPress={() => onSelect(null)}
            >
              <ThemedText type="labelSm" color={colors.text.secondary}>
                EXPORT WITHOUT NOTE
              </ThemedText>
            </Touchable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
