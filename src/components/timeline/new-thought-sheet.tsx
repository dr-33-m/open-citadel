import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { ScrollView } from 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  View,
} from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { Check, Sparkles, X } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { useColors } from '@/hooks/use-colors';
import { fontFamily, spacing } from '@/constants/theme';
import { suggestTags } from '@/services/tag-suggest';

const COLORS = [
  '#f2ca50', // gold
  '#e05252', // red
  '#52b788', // green
  '#4a90d9', // blue
  '#9b72cf', // purple
];

export type ThoughtEditData = {
  id: string;
  text: string;
  color: string;
  tags: string[];
};

type NewThoughtSheetProps = {
  visible: boolean;
  allTags: string[];
  editData?: ThoughtEditData | null;
  onSave: (text: string, color: string, tags: string[]) => void;
  onClose: () => void;
};

export function NewThoughtSheet({
  visible,
  allTags,
  editData,
  onSave,
  onClose,
}: NewThoughtSheetProps) {
  const colors = useColors();
  const isEditing = !!editData;

  const [text, setText] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Populate fields when editing
  useEffect(() => {
    if (visible && editData) {
      setText(editData.text);
      setSelectedColor(editData.color || COLORS[0]);
      setTags(editData.tags);
      setTagInput('');
    } else if (visible && !editData) {
      setText('');
      setSelectedColor(COLORS[0]);
      setTags([]);
      setTagInput('');
    }
    setAiSuggestions([]);
    setSuggesting(false);
    setSuggestError(null);
  }, [visible, editData]);

  const styles = React.useMemo(() => StyleSheet.create({
    sheet: {
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[6],
      paddingTop: spacing[4],
      paddingBottom: spacing[10],
      gap: spacing[4],
    },
    textInput: {
      backgroundColor: colors.surface.mid,
      color: colors.text.primary,
      fontFamily: fontFamily.sans,
      fontSize: 16,
      padding: spacing[4],
      minHeight: 100,
      textAlignVertical: 'top',
    },
    colorRow: { flexDirection: 'row', gap: spacing[3] },
    swatch: { width: 28, height: 28, borderRadius: 14 },
    swatchSelected: { borderWidth: 3, borderColor: colors.text.primary },
    tagSection: { gap: spacing[2] },
    tagChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      backgroundColor: colors.surface.mid,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[1],
      borderRadius: 99,
    },
    chipText: { fontSize: 12 },
    tagInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface.mid,
    },
    tagInputField: {
      flex: 1,
      color: colors.text.primary,
      fontFamily: fontFamily.sans,
      fontSize: 14,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
    },
    tagInputBtn: { paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
    tagInputBtnDisabled: { opacity: 0.4 },
    suggestionsScroll: { marginTop: spacing[1] },
    suggestionsContent: { gap: spacing[2] },
    suggestionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[1],
      backgroundColor: colors.surface.mid,
      borderWidth: 1,
      borderColor: colors.surface.highest,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[1],
      borderRadius: 99,
    },
    suggestionChipAdded: { opacity: 0.5 },
    aiSuggestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing[2],
    },
    aiSuggestBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[1],
      paddingVertical: spacing[1],
    },
    aiSuggestionChip: { borderColor: colors.primary.default },
    actions: { gap: spacing[3] },
    cancel: { alignItems: 'center', paddingVertical: spacing[3] },
  }), [colors]);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
    setTags([...tags, trimmed]);
  };

  const commitTag = () => {
    addTag(tagInput.trim().replace(/,+$/, ''));
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSuggestTags = async () => {
    if (suggesting || !text.trim()) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      setAiSuggestions(await suggestTags({ text: text.trim(), existingTags: allTags }));
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Could not suggest tags.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed, selectedColor, tags);
    if (!isEditing) {
      setText('');
      setSelectedColor(COLORS[0]);
      setTags([]);
      setTagInput('');
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setText('');
    setSelectedColor(COLORS[0]);
    setTags([]);
    setTagInput('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleClose} scrollable>
      <BottomSheetScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
        <ThemedText type="headlineSm">
          {isEditing ? 'Edit Thought' : 'New Thought'}
        </ThemedText>

        <BottomSheetTextInput
          style={styles.textInput}
          placeholder="What's on your mind…"
          placeholderTextColor={colors.text.secondary}
          value={text}
          onChangeText={setText}
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
              onPress={() => setSelectedColor(c)}
            />
          ))}
        </View>

        {/* Tags */}
        <View style={styles.tagSection}>
          {tags.length > 0 && (
            <View style={styles.tagChips}>
              {tags.map((tag) => (
                <View key={tag} style={styles.chip}>
                  <ThemedText type="labelSm" color={colors.text.primary} style={styles.chipText}>
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
            <BottomSheetTextInput
              style={styles.tagInputField}
              placeholder="Add tag…"
              placeholderTextColor={colors.text.secondary}
              value={tagInput}
              onChangeText={(v) => {
                if (v.endsWith(',')) {
                  commitTag();
                } else {
                  setTagInput(v);
                }
              }}
              returnKeyType="done"
              onSubmitEditing={commitTag}
            />
            <Touchable
              style={[styles.tagInputBtn, !tagInput.trim() && styles.tagInputBtnDisabled]}
              onPress={commitTag}
              hitSlop={8}
            >
              <Check size={16} color={tagInput.trim() ? colors.primary.default : colors.text.secondary} />
            </Touchable>
          </View>

          <View style={styles.aiSuggestRow}>
            <Touchable
              style={styles.aiSuggestBtn}
              onPress={handleSuggestTags}
              disabled={suggesting || !text.trim()}
              hitSlop={6}
            >
              {suggesting ? (
                <ActivityIndicator size={14} color={colors.primary.default} />
              ) : (
                <Sparkles size={14} color={colors.primary.default} />
              )}
              <ThemedText type="labelSm" color={colors.primary.default}>
                {suggesting ? 'SUGGESTING…' : 'SUGGEST TAGS'}
              </ThemedText>
            </Touchable>
            {aiSuggestions.map((tag) => {
              const isAdded = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
              return (
                <Touchable
                  key={tag}
                  style={[
                    styles.suggestionChip,
                    styles.aiSuggestionChip,
                    isAdded && styles.suggestionChipAdded,
                  ]}
                  onPress={() => !isAdded && addTag(tag)}
                >
                  {isAdded && <Check size={11} color={colors.text.secondary} />}
                  <ThemedText
                    type="labelSm"
                    color={isAdded ? colors.text.secondary : colors.text.primary}
                    style={styles.chipText}
                  >
                    {tag}
                  </ThemedText>
                </Touchable>
              );
            })}
          </View>
          {suggestError && (
            <ThemedText type="labelSm" color={colors.text.secondary}>
              {suggestError}
            </ThemedText>
          )}

          {allTags.length > 0 && (
            // RNGH's ScrollView, not RN's: the sheet wraps its scrollable in
            // a GestureDetector, and a plain nested ScrollView loses the
            // horizontal touch stream to it — the row rendered but never
            // scrolled. The gesture-handler-aware component registers with
            // the same system and coordinates correctly.
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.suggestionsScroll}
              contentContainerStyle={styles.suggestionsContent}
              keyboardShouldPersistTaps="handled"
            >
              {allTags.map((tag) => {
                const isAdded = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
                return (
                  <Touchable
                    key={tag}
                    style={[styles.suggestionChip, isAdded && styles.suggestionChipAdded]}
                    onPress={() => !isAdded && addTag(tag)}
                  >
                    {isAdded && <Check size={11} color={colors.text.secondary} />}
                    <ThemedText
                      type="labelSm"
                      color={isAdded ? colors.text.secondary : colors.text.primary}
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
            label={isEditing ? 'SAVE CHANGES' : 'SAVE THOUGHT'}
            onPress={handleSave}
          />
          <Touchable onPress={handleClose} style={styles.cancel}>
            <ThemedText type="labelSm" color={colors.text.secondary}>CANCEL</ThemedText>
          </Touchable>
        </View>
      </BottomSheetScrollView>
    </Sheet>
  );
}
