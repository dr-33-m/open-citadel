import { Check, MessageSquare, Pencil, StickyNote, Trash2, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { Touchable } from "@/components/ui/touchable";

import { ThemedText } from "@/components/themed-text";
import { GoldButton } from "@/components/ui/gold-button";
import { fontFamily, spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

const COLORS = [
  "#f2ca50", // gold
  "#e05252", // red
  "#52b788", // green
  "#4a90d9", // blue
  "#9b72cf", // purple
];

type NoteItem = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string | null;
};

type HighlightMenuProps = {
  visible: boolean;
  highlightId: string;
  highlightText: string;
  currentColor: string;
  currentTags: string[];
  chatSessionId?: string | null;
  allTags: string[];
  existingNotes: NoteItem[];
  onAddNote: (highlightId: string, text: string) => void;
  onUpdateNote: (noteId: string, text: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDelete: (highlightId: string) => void;
  onUpdateHighlight: (
    id: string,
    updates: { color?: string; tags?: string },
  ) => void;
  onStartChat?: () => void;
  onClose: () => void;
};

export function HighlightMenu({
  visible,
  highlightId,
  highlightText,
  currentColor,
  currentTags,
  chatSessionId,
  allTags,
  existingNotes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDelete,
  onUpdateHighlight,
  onStartChat,
  onClose,
}: HighlightMenuProps) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, justifyContent: "flex-end" },
        overlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(0,0,0,0.5)",
        },
        kavWrapper: { backgroundColor: colors.surface.low },
        sheet: {
          backgroundColor: colors.surface.low,
          paddingHorizontal: spacing[6],
          paddingTop: spacing[4],
          paddingBottom: spacing[10],
          gap: spacing[4],
        },
        handle: {
          width: 40,
          height: 4,
          backgroundColor: colors.surface.highest,
          alignSelf: "center",
          marginBottom: spacing[2],
        },
        quoteText: { fontFamily: fontFamily.serifItalic, fontSize: 14 },
        colorRow: { flexDirection: "row", gap: spacing[3] },
        swatch: { width: 28, height: 28, borderRadius: 14 },
        swatchSelected: { borderWidth: 3, borderColor: colors.text.primary },
        tagSection: { gap: spacing[2] },
        tagChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
        chip: {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[2],
          backgroundColor: colors.surface.mid,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[1],
          borderRadius: 99,
        },
        chipText: { fontSize: 12 },
        tagInputRow: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface.mid,
        },
        tagInput: {
          flex: 1,
          color: colors.text.primary,
          fontFamily: fontFamily.sans,
          fontSize: 14,
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[2],
        },
        tagInputBtn: {
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
        },
        tagInputBtnDisabled: { opacity: 0.4 },
        notesList: { maxHeight: 140 },
        noteRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: spacing[3],
          backgroundColor: colors.surface.mid,
          padding: spacing[3],
          marginBottom: spacing[2],
        },
        noteRowEditing: { borderWidth: 1, borderColor: colors.primary.default },
        noteIcon: { marginTop: 2 },
        noteText: { flex: 1 },
        noteAction: { paddingTop: 2 },
        noteInput: {
          backgroundColor: colors.surface.mid,
          color: colors.text.primary,
          fontFamily: fontFamily.sans,
          fontSize: 16,
          padding: spacing[4],
          minHeight: 80,
          textAlignVertical: "top",
        },
        actions: { gap: spacing[3] },
        secondaryButton: { alignItems: "center", paddingVertical: spacing[3] },
        chatBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing[2],
          paddingVertical: spacing[3],
        },
        suggestionsScroll: { marginTop: spacing[1] },
        suggestionsContent: { gap: spacing[2] },
        suggestionChip: {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[1],
          backgroundColor: colors.surface.mid,
          borderWidth: 1,
          borderColor: colors.surface.highest,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[1],
          borderRadius: 99,
        },
        suggestionChipAdded: { opacity: 0.5 },
      }),
    [colors],
  );

  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(currentTags);
  const [selectedColor, setSelectedColor] = useState(currentColor);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Reset when the menu opens for a different highlight
  useEffect(() => {
    setNoteText("");
    setEditingNote(null);
    setTagInput("");
    setTags(currentTags);
    setSelectedColor(currentColor);
  }, [highlightId]);

  // Sync incoming props when re-opened
  useEffect(() => {
    setTags(currentTags);
  }, [currentTags]);

  useEffect(() => {
    setSelectedColor(currentColor);
  }, [currentColor]);

  const handleRequestClose = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else if (editingNote) {
      setEditingNote(null);
      setNoteText("");
    } else {
      onClose();
    }
  };

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    onUpdateHighlight(highlightId, { color });
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    // Case-insensitive duplicate check
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
    const newTags = [...tags, trimmed];
    setTags(newTags);
    onUpdateHighlight(highlightId, { tags: JSON.stringify(newTags) });
  };

  const commitTag = () => {
    addTag(tagInput.trim().replace(/,+$/, ""));
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    onUpdateHighlight(highlightId, { tags: JSON.stringify(newTags) });
  };

  const handleSave = () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    if (editingNote) {
      onUpdateNote(editingNote.id, trimmed);
    } else {
      onAddNote(highlightId, trimmed);
    }
    setNoteText("");
    setEditingNote(null);
  };

  const handleEditNote = (note: NoteItem) => {
    setEditingNote(note);
    setNoteText(note.text);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCancelEdit = () => {
    setEditingNote(null);
    setNoteText("");
    Keyboard.dismiss();
  };

  const handleDelete = () => {
    onDelete(highlightId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.container}>
        <Touchable style={styles.overlay} onPress={onClose} />

        <KeyboardAvoidingView behavior="padding" style={styles.kavWrapper}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {/* Highlight quote */}
            <ThemedText
              type="bodySm"
              color={colors.text.secondary}
              style={styles.quoteText}
              numberOfLines={3}
            >
              &ldquo;{highlightText}&rdquo;
            </ThemedText>

            {/* Existing notes list */}
            {existingNotes.length > 0 && (
              <ScrollView
                style={styles.notesList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {existingNotes.map((note) => (
                  <View
                    key={note.id}
                    style={[
                      styles.noteRow,
                      editingNote?.id === note.id && styles.noteRowEditing,
                    ]}
                  >
                    <StickyNote
                      size={14}
                      color={colors.primary.default}
                      style={styles.noteIcon}
                    />
                    <View style={styles.noteText}>
                      <ThemedText type="bodySm" color={colors.text.primary}>
                        {note.text}
                      </ThemedText>
                      {note.updatedAt && (
                        <ThemedText
                          type="labelSm"
                          color={colors.text.secondary}
                          style={{ fontStyle: "italic", fontSize: 10 }}
                        >
                          edited
                        </ThemedText>
                      )}
                    </View>
                    <Touchable
                      onPress={() => handleEditNote(note)}
                      style={styles.noteAction}
                      hitSlop={8}
                    >
                      <Pencil size={14} color={colors.text.secondary} />
                    </Touchable>
                    <Touchable
                      onPress={() => onDeleteNote(note.id)}
                      style={styles.noteAction}
                      hitSlop={8}
                    >
                      <Trash2 size={14} color={colors.text.secondary} />
                    </Touchable>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Note input */}
            <TextInput
              ref={inputRef}
              style={styles.noteInput}
              placeholder={editingNote ? "Edit your note…" : "Add a note…"}
              placeholderTextColor={colors.text.secondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
            />

            {/* Color swatches */}
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <Touchable
                  key={c}
                  style={[
                    styles.swatch,
                    { backgroundColor: c },
                    selectedColor === c && styles.swatchSelected,
                  ]}
                  onPress={() => handleColorSelect(c)}
                />
              ))}
            </View>

            {/* Tags */}
            <View style={styles.tagSection}>
              {tags.length > 0 && (
                <View style={styles.tagChips}>
                  {tags.map((tag) => (
                    <View key={tag} style={styles.chip}>
                      <ThemedText
                        type="labelSm"
                        color={colors.text.primary}
                        style={styles.chipText}
                      >
                        {tag}
                      </ThemedText>
                      <Touchable onPress={() => removeTag(tag)} hitSlop={6}>
                        <X size={11} color={colors.text.secondary} />
                      </Touchable>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.tagInputRow}>
                <TextInput
                  style={styles.tagInput}
                  placeholder="Add tag…"
                  placeholderTextColor={colors.text.secondary}
                  value={tagInput}
                  onChangeText={(v) => {
                    if (v.endsWith(",")) {
                      commitTag();
                    } else {
                      setTagInput(v);
                    }
                  }}
                  returnKeyType="done"
                  onSubmitEditing={commitTag}
                />
                <Touchable
                  style={[
                    styles.tagInputBtn,
                    !tagInput.trim() && styles.tagInputBtnDisabled,
                  ]}
                  onPress={commitTag}
                  hitSlop={8}
                >
                  <Check
                    size={16}
                    color={
                      tagInput.trim()
                        ? colors.primary.default
                        : colors.text.secondary
                    }
                  />
                </Touchable>
              </View>

              {allTags.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.suggestionsScroll}
                  contentContainerStyle={styles.suggestionsContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {allTags.map((tag) => {
                    const isAdded = tags.some(
                      (t) => t.toLowerCase() === tag.toLowerCase(),
                    );
                    return (
                      <Touchable
                        key={tag}
                        style={[
                          styles.suggestionChip,
                          isAdded && styles.suggestionChipAdded,
                        ]}
                        onPress={() => !isAdded && addTag(tag)}
                      >
                        {isAdded && (
                          <Check size={11} color={colors.text.secondary} />
                        )}
                        <ThemedText
                          type="labelSm"
                          color={
                            isAdded
                              ? colors.text.secondary
                              : colors.text.primary
                          }
                          style={styles.chipText}
                        >
                          {tag}
                        </ThemedText>
                      </Touchable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={styles.actions}>
              <GoldButton
                label={editingNote ? "UPDATE NOTE" : "ADD NOTE"}
                onPress={handleSave}
              />
              {onStartChat && (
                <Touchable style={styles.chatBtn} onPress={onStartChat}>
                  <MessageSquare size={16} color={colors.text.secondary} />
                  <ThemedText type="labelSm" color={colors.text.secondary}>
                    {chatSessionId ? "VIEW CHAT" : "START CHAT"}
                  </ThemedText>
                </Touchable>
              )}
              {editingNote ? (
                <Touchable
                  onPress={handleCancelEdit}
                  style={styles.secondaryButton}
                >
                  <ThemedText type="labelSm" color={colors.text.secondary}>
                    CANCEL
                  </ThemedText>
                </Touchable>
              ) : (
                <Touchable
                  onPress={handleDelete}
                  style={styles.secondaryButton}
                >
                  <ThemedText type="labelSm" color={colors.text.secondary}>
                    DELETE HIGHLIGHT
                  </ThemedText>
                </Touchable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
