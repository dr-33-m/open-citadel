import { Check } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { GoldButton } from "@/components/ui/gold-button";
import { fontFamily, spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

type Book = {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
};

type AddBooksSheetProps = {
  visible: boolean;
  allBooks: Book[];
  existingBookIds: string[];
  onConfirm: (selectedBookIds: string[]) => void;
  onClose: () => void;
};

export function AddBooksSheet({
  visible,
  allBooks,
  existingBookIds,
  onConfirm,
  onClose,
}: AddBooksSheetProps) {
  const colors = useColors();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set(existingBookIds));
    }
  }, [visible, existingBookIds]);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, justifyContent: "flex-end" },
        overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
        sheet: {
          backgroundColor: colors.surface.low,
          paddingTop: spacing[4],
          paddingBottom: spacing[10],
          height: Dimensions.get("window").height * 0.65,
        },
        handle: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: "center",
          marginBottom: spacing[4],
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing[6],
          marginBottom: spacing[4],
        },
        scroll: { flex: 1 },
        row: {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[4],
          paddingHorizontal: spacing[6],
          paddingVertical: spacing[3],
        },
        cover: {
          width: 36,
          height: 54,
          backgroundColor: colors.surface.mid,
          overflow: "hidden",
        },
        coverImage: { width: "100%", height: "100%" },
        coverPlaceholder: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
        initial: { fontSize: 16, fontFamily: fontFamily.serif },
        bookInfo: { flex: 1, gap: spacing[1] },
        checkCircle: {
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
        },
        footer: {
          paddingHorizontal: spacing[6],
          paddingTop: spacing[4],
        },
        cancel: {
          alignItems: "center",
          paddingVertical: spacing[3],
        },
      }),
    [colors],
  );

  const toggle = (bookId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  };

  const newlySelected = [...selectedIds].filter(
    (id) => !existingBookIds.includes(id),
  );

  const handleConfirm = () => {
    onConfirm([...selectedIds]);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <ThemedText type="headlineSm">Add Books</ThemedText>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              {selectedIds.size} selected
            </ThemedText>
          </View>

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {allBooks.map((book) => {
              const isSelected = selectedIds.has(book.id);
              return (
                <Pressable
                  key={book.id}
                  style={styles.row}
                  onPress={() => toggle(book.id)}
                >
                  <View style={styles.cover}>
                    {book.coverUrl ? (
                      <Image
                        source={{ uri: book.coverUrl }}
                        style={styles.coverImage}
                      />
                    ) : (
                      <View style={styles.coverPlaceholder}>
                        <ThemedText
                          type="bodySm"
                          color={colors.surface.highest}
                          style={styles.initial}
                        >
                          {book.title.charAt(0).toUpperCase()}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  <View style={styles.bookInfo}>
                    <ThemedText
                      type="bodySm"
                      color={colors.text.primary}
                      numberOfLines={1}
                    >
                      {book.title}
                    </ThemedText>
                    <ThemedText
                      type="labelSm"
                      color={colors.text.secondary}
                      numberOfLines={1}
                    >
                      {book.author}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.checkCircle,
                      {
                        backgroundColor: isSelected
                          ? colors.primary.default
                          : colors.surface.mid,
                      },
                    ]}
                  >
                    {isSelected && (
                      <Check size={14} color={colors.text.inverse} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <GoldButton
              label={
                newlySelected.length > 0
                  ? `ADD ${newlySelected.length} BOOKS`
                  : "DONE"
              }
              onPress={handleConfirm}
            />
            <Pressable onPress={onClose} style={styles.cancel}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                CANCEL
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
