import { Check } from "@/components/icons";
import React, { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { Sheet } from "@/components/ui/sheet";
import { Touchable } from "@/components/ui/touchable";

import { ThemedText } from "@/components/themed-text";
import { GoldButton } from "@/components/ui/gold-button";
import { cn } from "@/lib/cn";
import { fontFamily } from "@/constants/theme";

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

/** ThemedText/lucide icons take a literal color, not a className. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

const COVER_FILL = { width: '100%' as const, height: '100%' as const };

/** Hoisted: a fresh style object per render re-lays the scroll region out. */
const FILL = { flex: 1 } as const;

/**
 * One row, memoized: a toggle only re-renders the row whose selection
 * flipped — not every mounted cell — and only the visible window exists
 * at all, so a 400-book library mounts the same dozen rows as a 4-book one.
 */
const AddBookRow = React.memo(function AddBookRow({
  book,
  isSelected,
  ghostInk,
  mutedForeground,
  primaryForeground,
  onToggle,
}: {
  book: Book;
  isSelected: boolean;
  ghostInk?: string;
  mutedForeground?: string;
  primaryForeground?: string;
  onToggle: (bookId: string) => void;
}) {
  return (
    <Touchable
      className="flex-row items-center gap-4 px-6 py-3"
      onPress={() => onToggle(book.id)}
    >
      <View className="h-[54px] w-9 overflow-hidden bg-muted">
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={COVER_FILL}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <ThemedText
              type="bodySm"
              color={ghostInk}
              style={{ fontSize: 16, fontFamily: fontFamily.serif }}
            >
              {book.title.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
        )}
      </View>
      <View className="flex-1 gap-1">
        <ThemedText
          type="bodySm"
          numberOfLines={1}
        >
          {book.title}
        </ThemedText>
        <ThemedText
          type="labelSm"
          color={mutedForeground}
          numberOfLines={1}
        >
          {book.author}
        </ThemedText>
      </View>
      <View
        className={cn(
          'h-6 w-6 items-center justify-center rounded-full',
          isSelected ? 'bg-primary' : 'bg-muted',
        )}
      >
        {isSelected && (
          <Check size={14} color={primaryForeground} />
        )}
      </View>
    </Touchable>
  );
});

export function AddBooksSheet({
  visible,
  allBooks,
  existingBookIds,
  onConfirm,
  onClose,
}: AddBooksSheetProps) {
  const [ghostInk, mutedForeground, primaryForeground] = useCSSVariable([
    '--color-surface-tertiary',
    '--color-muted-foreground',
    '--color-primary-foreground',
  ]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setSelectedIds(new Set(existingBookIds));
    }
  }, [visible, existingBookIds]);

  const toggle = useCallback((bookId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  }, []);

  const ghost = asColor(ghostInk);
  const muted = asColor(mutedForeground);
  const onPrimary = asColor(primaryForeground);

  const renderItem = useCallback(
    ({ item }: { item: Book }) => (
      <AddBookRow
        book={item}
        isSelected={selectedIds.has(item.id)}
        ghostInk={ghost}
        mutedForeground={muted}
        primaryForeground={onPrimary}
        onToggle={toggle}
      />
    ),
    [selectedIds, ghost, muted, onPrimary, toggle],
  );

  const newlySelected = [...selectedIds].filter(
    (id) => !existingBookIds.includes(id),
  );

  const handleConfirm = () => {
    onConfirm([...selectedIds]);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} fixedHeightRatio={0.65}>
      <View className="flex-1">
        <View className="mb-4 flex-row items-center justify-between px-6">
          <ThemedText type="headlineSm">Add Books</ThemedText>
          <ThemedText type="labelSm" color={asColor(mutedForeground)}>
            {selectedIds.size} selected
          </ThemedText>
        </View>

        <Sheet.FlatList
          style={FILL}
          data={allBooks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />

        <View className="px-6 pt-4">
          <GoldButton
            label={
              newlySelected.length > 0
                ? `ADD ${newlySelected.length} BOOKS`
                : "DONE"
            }
            onPress={handleConfirm}
          />
          <Touchable onPress={onClose} className="items-center py-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
