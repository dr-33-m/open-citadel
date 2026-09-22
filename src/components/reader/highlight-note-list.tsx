import { Pencil, StickyNote, Trash2 } from "@/components/icons";
import React, { useRef } from "react";
import { View } from "react-native";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import { useCSSVariable } from "uniwind";

import { BoxFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
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
 * Past this the notes scroll inside their own box rather than pushing the
 * note field and everything under it down the sheet.
 */
const NOTES_MAX_HEIGHT = 180;

/**
 * The notes on a highlight, in a capped box that scrolls on its own.
 *
 * Laid out in full inside the sheet's scroll, a few long notes pushed the
 * note field, the tags and the actions off the bottom. So the box stops
 * growing at `NOTES_MAX_HEIGHT` and scrolls within it.
 *
 * RNGH's ScrollView, the way the tag strip in `highlight-menu` is. The first
 * try was a plain RN `ScrollView`, which never got the gesture: the sheet
 * wraps its scroll region in a native gesture and a plain nested scrollable
 * loses the touch stream to it. The gesture-handler one registers with the
 * same system. `nestedScrollEnabled` is what lets Android hand it the drag
 * inside the sheet's own vertical scroll.
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

  /*
   * Oldest first, the order they were written in, so a note just added lands
   * at the bottom of the box, out of sight under the first ones. The box
   * follows it down. Only on a new note: an edit or a delete leaves the reader
   * where they were, and so does opening the sheet.
   */
  const scrollRef = useRef<GestureScrollView>(null);
  const shownCount = useRef(notes.length);
  const followNewNote = () => {
    const added = notes.length > shownCount.current;
    shownCount.current = notes.length;
    if (added) scrollRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <BoxFade surface="popover">
      <GestureScrollView
        ref={scrollRef}
        onContentSizeChange={followNewNote}
        style={{ maxHeight: NOTES_MAX_HEIGHT }}
        contentContainerStyle={{ gap: spacing[2] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
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
      </GestureScrollView>
    </BoxFade>
  );
}
