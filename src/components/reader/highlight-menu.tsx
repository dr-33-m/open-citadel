import { Check, MessageSquare, Pencil, Share, Sparkles, StickyNote, Trash2, X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

import { ExportImageCard } from "@/components/export/export-image-card";
import { captureAndShare } from "@/utils/export-image";

import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Touchable } from "@/components/ui/touchable";
import { useSamwellWake } from "@/hooks/use-samwell-wake";

import { ThemedText } from "@/components/themed-text";
import { GoldButton } from "@/components/ui/gold-button";
import { easing, fontFamily, motion, spacing } from "@/constants/theme";
import { cn } from "@/lib/cn";
import { asColor } from "@/utils/colors";
import { ColorSwatch, ColorSwatchRow, HIGHLIGHT_COLORS } from "@/components/color-swatch";

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
  bookTitle: string;
  authorName: string;
  bookCoverUri: string | null;
  bookCategory: string | null;
  onAddNote: (highlightId: string, text: string) => void;
  onUpdateNote: (noteId: string, text: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDelete: (highlightId: string) => void;
  onUpdateHighlight: (
    id: string,
    updates: { color?: string; tags?: string },
  ) => void;
  onStartChat?: () => void;
  onSuggestTags?: () => Promise<string[]>;
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
  bookTitle,
  authorName,
  bookCoverUri,
  bookCategory,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDelete,
  onUpdateHighlight,
  onStartChat,
  onSuggestTags,
  onClose,
}: HighlightMenuProps) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);

  const [noteText, setNoteText] = useState("");
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(currentTags);
  const [selectedColor, setSelectedColor] = useState(currentColor);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const { ensureAwake, wakeDialog } = useSamwellWake();
  /*
   * The fields are uncontrolled: the text lives in the native buffer and
   * React only mirrors it out (`onChangeText`), never back in. Every
   * controlled commit re-sets the field from JS state, and a keystroke that
   * lands while the JS thread is busy gets committed over by a stale string
   * — the letter drops, or the IME re-inserts it and the word duplicates.
   * Resets go through the refs; the one case that must *populate* the note
   * field (editing an existing note) remounts it via `key` with
   * `defaultValue`, keyed by the note being edited.
   */
  const noteFieldRef = useRef<TextInput>(null);
  const tagFieldRef = useRef<TextInput>(null);

  // Export state
  const exportViewRef = useRef<View>(null);
  const [showExport, setShowExport] = useState(false);

  // Reset every time the menu opens, not only when the highlight changes:
  // the sheet now stays mounted across a close (its content has to survive
  // the exit animation), so reopening the same highlight would otherwise
  // come back with the last draft note still in the field.
  useEffect(() => {
    if (!visible) return;
    setNoteText("");
    setEditingNote(null);
    setTagInput("");
    setTags(currentTags);
    setSelectedColor(currentColor);
    setAiSuggestions([]);
    setSuggesting(false);
    setSuggestError(null);
    // The buffers are native-owned (the fields are uncontrolled — see the
    // refs above), so the mirror resets alone would leave the old text in
    // the fields across a reopen or a switch to another highlight.
    noteFieldRef.current?.clear();
    tagFieldRef.current?.clear();
  }, [highlightId, visible]);

  // Sync incoming props when re-opened
  useEffect(() => {
    setTags(currentTags);
  }, [currentTags]);

  useEffect(() => {
    setSelectedColor(currentColor);
  }, [currentColor]);

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

  /*
   * Commits from the *event* value, never the mirror: keystrokes can land
   * faster than renders, so `tagInput` can lag the buffer — committing from
   * it would clip the tag's tail. The ✓ button and the keyboard action fire
   * long after the render settled, so the mirror is current there.
   * `clear()` empties the native buffer; if an IME batch re-applies text
   * across it, the re-applied value arrives as another `onChangeText`
   * ending in a comma and commits (deduped) again, so the field always
   * converges on empty.
   */
  const commitTag = (raw: string) => {
    addTag(raw.trim().replace(/,+$/, ""));
    setTagInput("");
    tagFieldRef.current?.clear();
  };

  const removeTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    onUpdateHighlight(highlightId, { tags: JSON.stringify(newTags) });
  };

  const handleSuggestTags = async () => {
    if (!onSuggestTags || suggesting) return;
    // Offline Samwell has to be awake to answer. Ask before starting rather
    // than failing afterwards with an instruction to go to Settings.
    if (!(await ensureAwake())) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      setAiSuggestions(await onSuggestTags());
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Could not suggest tags.");
    } finally {
      setSuggesting(false);
    }
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
    // The field is keyed by the note being edited, so dropping
    // `editingNote` remounts it empty for the next note; the mirror reset
    // above keeps the save button honest until then.
  };

  const handleEditNote = (note: NoteItem) => {
    setEditingNote(note);
    setNoteText(note.text);
    setTimeout(() => noteFieldRef.current?.focus(), 50);
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

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setShowExport(true);
    setIsExporting(true);
  };

  const handleExportReady = useCallback(async () => {
    await captureAndShare(exportViewRef);
    setShowExport(false);
    setIsExporting(false);
  }, []);

  return (
    <>
      {/* Dynamic sizing, same as the new-thought sheet, and `scrollable`
          because the scroll region IS the sheet: it reports its own content
          height, which is what the sheet sizes itself from. Keyboard
          clearance is the sheet's — it lifts as a whole for whichever field
          below takes focus (see components/ui/sheet). */}
      <Sheet visible={visible} onClose={onClose} scrollable>
        <Sheet.ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing[6],
            // The sheet's rhythm: every major block sits 24px from its
            // neighbours (quote / note field / metadata group / commit
            // button / action row). Related controls live inside the
            // metadata group at 12px, so the group reads as one thing.
            gap: spacing[6],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Highlight quote — data the reader may want to copy (fidelity
              law 4). The sheet body is a ScrollView, not a pressable, so a
              long-press selection here has nothing to fight. */}
          <ThemedText
            selectable
            type="bodySm"
            color={asColor(mutedForeground)}
            style={{ fontFamily: fontFamily.serifItalic, fontSize: 14 }}
            numberOfLines={3}
          >
            &ldquo;{highlightText}&rdquo;
          </ThemedText>

          {/* Existing notes list */}
          {existingNotes.length > 0 && (
            // Plain RN, nested inside the sheet's own scroll region: only
            // the outer one negotiates with the sheet's pan, and a second
            // registered scrollable would take that role off it.
            <ScrollView
              className="max-h-[140px]"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {existingNotes.map((note) => (
                <View
                  key={note.id}
                  className={cn(
                    "mb-2 flex-row items-start gap-3 bg-muted p-3",
                    editingNote?.id === note.id && "border border-primary",
                  )}
                >
                  <StickyNote
                    size={14}
                    color={asColor(primary)}
                    style={{ marginTop: 2 }}
                  />
                  <View className="flex-1">
                    {/* The row itself is a static View — only the trailing
                        pencil/trash icons are pressable — so selecting the
                        note text doesn't collide with a row-level gesture. */}
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
                    onPress={() => handleEditNote(note)}
                    className="pt-[2px]"
                    hitSlop={8}
                  >
                    <Pencil size={14} color={asColor(mutedForeground)} />
                  </Touchable>
                  <Touchable
                    onPress={() => onDeleteNote(note.id)}
                    className="pt-[2px]"
                    hitSlop={8}
                  >
                    <Trash2 size={14} color={asColor(mutedForeground)} />
                  </Touchable>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Fixed height, not `minHeight`: a growing box changes the
              sheet's own measured content height on every line wrap, and a
              dynamically-sized sheet re-measures and re-snaps in response —
              the jitter. See new-thought-sheet.tsx, which hit this first. */}
          <Input
            ref={noteFieldRef}
            // Keyed by the note being edited: editing remounts the field
            // with that note's text (the buffer is native-owned, so it
            // cannot be set from state), and anything else remounts empty.
            key={editingNote?.id ?? "new"}
            style={{ height: 80, textAlignVertical: "top" }}
            placeholder={editingNote ? "Edit your note…" : "Add a note…"}
            defaultValue={editingNote?.text ?? ""}
            onChangeText={setNoteText}
            multiline
          />

          {/* Colour and tags are two facets of the highlight, not one
              cluster. Unlabelled and 24 below the note field but only 12
              above the tag box, the swatches read as belonging to the tags —
              so each is now its own labelled block on the sheet's 24 rhythm,
              12 within. */}
          <View className="gap-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              COLOUR
            </ThemedText>
            <ColorSwatchRow>
              {HIGHLIGHT_COLORS.map((c) => (
                <ColorSwatch
                  key={c}
                  color={c}
                  selected={selectedColor === c}
                  onPress={() => handleColorSelect(c)}
                  accessibilityLabel={`Colour ${c}`}
                />
              ))}
            </ColorSwatchRow>
          </View>

          <View className="gap-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              TAGS
            </ThemedText>
              {tags.length > 0 && (
                <View className="flex-row flex-wrap gap-2">
                  {tags.map((tag) => (
                    <View
                      key={tag}
                      className="flex-row items-center gap-2 rounded-full bg-muted px-3 py-1"
                    >
                      <ThemedText type="labelSm" style={{ fontSize: 12 }}>
                        {tag}
                      </ThemedText>
                      <Touchable onPress={() => removeTag(tag)} hitSlop={6}>
                        <X size={11} color={asColor(mutedForeground)} />
                      </Touchable>
                    </View>
                  ))}
                </View>
              )}
            {/* The commit button is the field's own `endContent`, not a
                sibling beside it. As a sibling it needed the field to give up
                width to it — and `className` on `Input` styles the *field*,
                not the container, so the `flex-1` never reached the box that
                had to shrink: the field took the full row and pushed the
                button off the right edge of the screen. */}
            <Input
              ref={tagFieldRef}
              placeholder="Add tag…"
              onChangeText={(v) => {
                if (v.endsWith(",")) {
                  commitTag(v);
                } else {
                  setTagInput(v);
                }
              }}
              returnKeyType="done"
              onSubmitEditing={() => commitTag(tagInput)}
              endContent={
                <Touchable
                  onPress={() => commitTag(tagInput)}
                  disabled={!tagInput.trim()}
                  hitSlop={8}
                  accessibilityLabel="Add tag"
                  className={cn(!tagInput.trim() && "opacity-40")}
                >
                  <Check
                    size={18}
                    color={
                      tagInput.trim()
                        ? asColor(primary)
                        : asColor(mutedForeground)
                    }
                  />
                </Touchable>
              }
            />

              {onSuggestTags && (
                <View className="flex-row flex-wrap items-center gap-2">
                  <Touchable
                    className="flex-row items-center gap-1 py-1"
                    onPress={handleSuggestTags}
                    disabled={suggesting}
                    haptic="tap"
                    hitSlop={6}
                  >
                    {suggesting ? (
                      <Spinner size="sm" />
                    ) : (
                      <Sparkles size={14} color={asColor(primary)} />
                    )}
                    <ThemedText type="labelSm" color={asColor(primary)}>
                      {suggesting ? "SUGGESTING…" : "SUGGEST TAGS"}
                    </ThemedText>
                  </Touchable>
                  {aiSuggestions.map((tag, index) => {
                    const isAdded = tags.some(
                      (t) => t.toLowerCase() === tag.toLowerCase(),
                    );
                    return (
                      <Animated.View
                        key={tag}
                        entering={FadeInUp.duration(motion.base)
                          .easing(easing)
                          .delay(index * 50)}
                      >
                        <Touchable
                          className={cn(
                            "flex-row items-center gap-1 rounded-full border border-primary bg-muted px-3 py-1",
                            isAdded && "opacity-50",
                          )}
                          haptic={isAdded ? false : 'tap'}
                          onPress={() => !isAdded && addTag(tag)}
                        >
                          {isAdded && (
                            <Check size={11} color={asColor(mutedForeground)} />
                          )}
                          <ThemedText
                            type="labelSm"
                            color={isAdded ? asColor(mutedForeground) : undefined}
                            style={{ fontSize: 12 }}
                          >
                            {tag}
                          </ThemedText>
                        </Touchable>
                      </Animated.View>
                    );
                  })}
                </View>
              )}
              {suggestError && (
                <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                  {suggestError}
                </ThemedText>
              )}

              {allTags.length > 0 && (
                // RNGH's ScrollView, not RN's, and not `Sheet.ScrollView`
                // either: the sheet wraps its scroll region in a native
                // gesture, and a plain nested ScrollView loses the horizontal
                // touch stream to it — the row rendered but never scrolled.
                // The gesture-handler-aware component registers with the same
                // system and coordinates correctly. `Sheet.ScrollView` is for
                // the region the sheet drags against; this one is a sideways
                // strip inside it and must stay out of that negotiation.
                <GestureScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: spacing[1] }}
                  contentContainerStyle={{ gap: spacing[2] }}
                  keyboardShouldPersistTaps="handled"
                >
                  {allTags.map((tag) => {
                    const isAdded = tags.some(
                      (t) => t.toLowerCase() === tag.toLowerCase(),
                    );
                    return (
                      <Touchable
                        key={tag}
                        className={cn(
                          "flex-row items-center gap-1 rounded-full border border-surface-tertiary bg-muted px-3 py-1",
                          isAdded && "opacity-50",
                        )}
                        onPress={() => !isAdded && addTag(tag)}
                      >
                        {isAdded && (
                          <Check size={11} color={asColor(mutedForeground)} />
                        )}
                        <ThemedText
                          type="labelSm"
                          color={isAdded ? asColor(mutedForeground) : undefined}
                          style={{ fontSize: 12 }}
                        >
                          {tag}
                        </ThemedText>
                      </Touchable>
                    );
                  })}
                </GestureScrollView>
              )}
          </View>

          {/* Commit group — the button and the row of entry actions are
              related controls, so 12px inside the 24px block rhythm. */}
          <View className="gap-3">
            <GoldButton
                label={editingNote ? "UPDATE NOTE" : "ADD NOTE"}
                onPress={handleSave}
              />
              <View className="flex-row justify-evenly">
                <Touchable
                  className="flex-1 items-center gap-1 py-2"
                  onPress={handleExport}
                  disabled={isExporting}
                >
                  <Share size={18} color={asColor(mutedForeground)} />
                  <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                    {isExporting ? 'EXPORTING…' : 'EXPORT'}
                  </ThemedText>
                </Touchable>
                {onStartChat && (
                  <Touchable
                    className="flex-1 items-center gap-1 py-2"
                    onPress={onStartChat}
                  >
                    <MessageSquare size={18} color={asColor(mutedForeground)} />
                    <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                      {chatSessionId ? "CHAT" : "CHAT"}
                    </ThemedText>
                  </Touchable>
                )}
                {editingNote ? (
                  <Touchable
                    className="flex-1 items-center gap-1 py-2"
                    onPress={handleCancelEdit}
                  >
                    <X size={18} color={asColor(mutedForeground)} />
                    <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                      CANCEL
                    </ThemedText>
                  </Touchable>
                ) : (
                  <Touchable
                    className="flex-1 items-center gap-1 py-2"
                    onPress={handleDelete}
                  >
                    <Trash2 size={18} color={asColor(mutedForeground)} />
                    <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                      DELETE
                    </ThemedText>
                  </Touchable>
                )}
              </View>
            </View>
        </Sheet.ScrollView>
      </Sheet>

      {/* Off-screen export card — a sibling of the sheet, not inside it: this
          is a headless capture target, never meant to be visible, and doesn't
          need the sheet's presentation at all. */}
      {showExport && (
        <View style={{ position: "absolute", left: -9999, top: -9999 }}>
          <ExportImageCard
            viewRef={exportViewRef}
            quoteText={highlightText}
            bookTitle={bookTitle}
            authorName={authorName}
            coverUri={bookCoverUri}
            category={bookCategory}
            onReady={handleExportReady}
          />
        </View>
      )}

      {wakeDialog}
    </>
  );
}
