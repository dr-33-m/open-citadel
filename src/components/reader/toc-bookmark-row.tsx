import React, { useRef } from "react";
import { View } from "react-native";
import type { Locator } from "@dr33m/react-native-readium";

import { Bookmark as BookmarkIcon } from "@/components/icons";
import type { RowColors } from "@/components/reader/toc-shared";
import { ThemedText } from "@/components/themed-text";
import { Input } from "@/components/ui/input";
import { Item } from "@/components/ui/item";
import { Touchable } from "@/components/ui/touchable";
import { spacing } from "@/constants/theme";

export type BookmarkRowData = {
  id: string;
  chapter: string | null;
  page: number | null;
  note: string | null;
  createdAt: string;
  locator: Locator | null;
};

export const BookmarkRow = React.memo(function BookmarkRow({
  data,
  colors,
  onBookmarkPress,
  onEditNote,
  isEditing,
  onCancelEdit,
  onSaveNote,
}: {
  data: BookmarkRowData;
  colors: RowColors;
  onBookmarkPress: (locator: Locator) => void;
  onEditNote: (id: string) => void;
  isEditing: boolean;
  onCancelEdit: () => void;
  onSaveNote: (id: string, note: string) => void;
}) {
  /* The draft text lives here, in the row, mirrored from the uncontrolled
      input below — the list never re-renders on a keystroke. */
  const noteRef = useRef(data.note ?? "");
  const dateLabel = new Date(data.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    /* Not pressable as a whole: icon, title and note are independent
        targets, so Item stays a plain row and the Touchables keep their
        own handlers. */
    <Item className="items-start border-b border-surface-tertiary px-6 py-4">
      <Item.Media>
        <Touchable onPress={() => data.locator && onBookmarkPress(data.locator)}>
          <BookmarkIcon size={16} color={colors.primary} />
        </Touchable>
      </Item.Media>
      <Item.Content className="gap-1">
        <Touchable onPress={() => data.locator && onBookmarkPress(data.locator)}>
          <ThemedText type="bodySm">
            {data.chapter || `Page ${data.page ?? "?"}`}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.mutedForeground}>
            {dateLabel}
          </ThemedText>
        </Touchable>

        {/* Note display / edit */}
        {isEditing ? (
          <>
            {/* Fixed height, not `minHeight` — a growing box changes the
                sheet's own measured content height on every line wrap, which
                is what caused the original jitter elsewhere in this app.
                See new-thought-sheet.tsx. */}
            <Input
              // Uncontrolled and keyed by the bookmark: each edit session
              // remounts the field with that note's text (the buffer is
              // native-owned, so it cannot be set from state) and typing
              // can never be committed over by a stale `value` — see
              // new-thought-sheet.tsx for the full story.
              key={data.id}
              defaultValue={data.note ?? ""}
              onChangeText={(text) => {
                noteRef.current = text;
              }}
              placeholder="Add a note…"
              style={{ height: 60, textAlignVertical: "top", marginTop: spacing[1] }}
              multiline
              autoFocus
            />
            <View className="mt-2 flex-row gap-4">
              <Touchable onPress={onCancelEdit} hitSlop={8}>
                <ThemedText type="labelSm" color={colors.mutedForeground}>
                  CANCEL
                </ThemedText>
              </Touchable>
              <Touchable
                onPress={() => onSaveNote(data.id, noteRef.current.trim())}
                hitSlop={8}
              >
                <ThemedText type="labelSm" color={colors.primary}>
                  SAVE
                </ThemedText>
              </Touchable>
            </View>
          </>
        ) : (
          <Touchable onPress={() => onEditNote(data.id)} hitSlop={4}>
            {data.note ? (
              <ThemedText
                color={colors.mutedForeground}
                italic
                style={{ fontSize: 13, lineHeight: 18 }}
              >
                {data.note}
              </ThemedText>
            ) : (
              <ThemedText type="labelSm" color={colors.mutedForeground}>
                + add note
              </ThemedText>
            )}
          </Touchable>
        )}
      </Item.Content>
    </Item>
  );
});
