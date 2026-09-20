import { Pencil, StickyNote, Trash2 } from "@/components/icons";
import React from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { Touchable } from "@/components/ui/touchable";
import { cn } from "@/lib/cn";
import { asColor } from "@/utils/colors";

export type HighlightNote = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string | null;
};

type HighlightNoteListProps = {
  notes: HighlightNote[];
  editingId: string | null;
  onEdit: (note: HighlightNote) => void;
  onDelete: (noteId: string) => void;
};

/**
 * The notes on a highlight, laid out in full.
 *
 * Not a scroll of its own. It used to be a plain `ScrollView` capped at 140px
 * inside the sheet's scroll region, and a plain scrollable nested in a sheet
 * never gets the gesture: one long note filled the box and every note after it
 * was unreachable, so a second note looked like it had never saved. The sheet
 * already scrolls, so the notes just take the room they need inside it.
 */
export function HighlightNoteList({
  notes,
  editingId,
  onEdit,
  onDelete,
}: HighlightNoteListProps) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);

  return (
    <View className="gap-2">
      {notes.map((note) => (
        <View
          key={note.id}
          className={cn(
            "flex-row items-start gap-3 bg-muted p-3",
            editingId === note.id && "border border-primary",
          )}
        >
          <StickyNote
            size={14}
            color={asColor(primary)}
            style={{ marginTop: 2 }}
          />
          <View className="flex-1">
            {/* The row itself is a static View — only the trailing
                pencil/trash icons are pressable — so selecting the note text
                doesn't collide with a row-level gesture. */}
            <ThemedText selectable type="bodySm">{note.text}</ThemedText>
            {note.updatedAt && (
              <ThemedText
                type="labelSm"
                color={asColor(mutedForeground)}
                italic
                style={{ fontSize: 10 }}
              >
                edited
              </ThemedText>
            )}
          </View>
          <Touchable
            onPress={() => onEdit(note)}
            className="pt-[2px]"
            hitSlop={8}
            accessibilityLabel="Edit note"
          >
            <Pencil size={14} color={asColor(mutedForeground)} />
          </Touchable>
          <Touchable
            onPress={() => onDelete(note.id)}
            className="pt-[2px]"
            hitSlop={8}
            accessibilityLabel="Delete note"
          >
            <Trash2 size={14} color={asColor(mutedForeground)} />
          </Touchable>
        </View>
      ))}
    </View>
  );
}
