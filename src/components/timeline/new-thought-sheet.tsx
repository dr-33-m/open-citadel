import { ScrollView } from 'react-native-gesture-handler';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, View, type TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Chip } from '@/components/ui/chip';
import { spacing } from '@/constants/theme';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { Check, Sparkles } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { ColorSwatch, ColorSwatchRow, HIGHLIGHT_COLORS } from '@/components/color-swatch';
import { GoldButton } from '@/components/ui/gold-button';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';
import { useSamwellWake } from '@/hooks/use-samwell-wake';
import { suggestTags } from '@/services/tag-suggest';

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
  // Literal colours for the consumers a className can't reach: ThemedText's
  // `color` prop and the lucide icons'.
  const [mutedForeground, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary',
  ]);
  const isEditing = !!editData;

  const [text, setText] = useState('');
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const { ensureAwake, wakeDialog } = useSamwellWake();
  const [suggestError, setSuggestError] = useState<string | null>(null);
  /*
   * The fields are uncontrolled: the text lives in the native buffer and
   * React only mirrors it out (`onChangeText`), never back in. Every
   * controlled commit re-sets the field from JS state, and a keystroke that
   * lands while the JS thread is busy — these sheets re-render their colour
   * rows, tag chips and suggestions on every letter — gets committed over
   * by a stale string: the letter drops, or the IME re-inserts it and the
   * word duplicates. Resets go through the refs (`clear()` empties the
   * buffer where it actually lives); the one case that must *populate* the
   * field (editing an existing thought) remounts it via `key` with
   * `defaultValue`, which is why that key names the thought being edited.
   */
  const textFieldRef = useRef<TextInput>(null);
  const tagFieldRef = useRef<TextInput>(null);
  const [fieldEpoch, setFieldEpoch] = useState(0);

  // Populate fields when editing
  useEffect(() => {
    if (visible && editData) {
      setText(editData.text);
      setSelectedColor(editData.color || HIGHLIGHT_COLORS[0]);
      setTags(editData.tags);
      setTagInput('');
    } else if (visible && !editData) {
      setText('');
      setSelectedColor(HIGHLIGHT_COLORS[0]);
      setTags([]);
      setTagInput('');
    }
    setAiSuggestions([]);
    setSuggesting(false);
    setSuggestError(null);
  }, [visible, editData]);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
    setTags([...tags, trimmed]);
  };

  /*
   * Commits from the *event* value, never the mirror: keystrokes can land
   * faster than renders, so `tagInput` can lag the buffer — committing from
   * it would clip the tag's tail ("history f" for "history fiction"). The
   * ✓ button and the keyboard action fire long after the render settled, so
   * the mirror is current there. `clear()` empties the native buffer; if an
   * IME batch re-applies text across it, the re-applied value arrives as
   * another `onChangeText` ending in a comma and commits (deduped) again,
   * so the field always converges on empty.
   */
  const commitTag = (raw: string) => {
    addTag(raw.trim().replace(/,+$/, ''));
    setTagInput('');
    tagFieldRef.current?.clear();
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSuggestTags = async () => {
    if (suggesting || !text.trim()) return;
    // Offline Samwell has to be awake to answer. Ask before starting rather
    // than failing afterwards with an instruction to go to Settings.
    if (!(await ensureAwake())) return;
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
      setSelectedColor(HIGHLIGHT_COLORS[0]);
      setTags([]);
      setTagInput('');
      textFieldRef.current?.clear();
      tagFieldRef.current?.clear();
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setText('');
    setSelectedColor(HIGHLIGHT_COLORS[0]);
    setTags([]);
    setTagInput('');
    setFieldEpoch((epoch) => epoch + 1);
    onClose();
  };

  return (
    <>
    {/* Dynamic sizing, same as the highlight menu — that one is stable with
        the same growing-field pattern. A fixed-ratio sheet was tried here
        instead and made things worse: it left dead space below short content
        (the sheet forced to a height taller than what's in it) and, on
        Android, fought with the keyboard badly enough to corrupt typed text.
        Root cause of the *original* jitter was the text field itself growing
        with `minHeight` — see the field below. `scrollable` because the
        scroll region IS the sheet: it reports its own content height, which
        is what the sheet sizes itself from, and the sheet lifts as a whole
        for whichever field takes focus. */}
    <Sheet visible={visible} onClose={handleClose} scrollable>
      <Sheet.ScrollView
        // `contentContainerStyle`, not `contentContainerClassName`: Uniwind
        // auto-instruments React Native's own components, and this scroll
        // region is the library's, so a class name on it has nothing to
        // resolve it.
        contentContainerStyle={{ gap: spacing[6], paddingHorizontal: spacing[6] }}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type="headlineSm">
          {isEditing ? 'Edit Thought' : 'New Thought'}
        </ThemedText>

        {/* Fixed, not `minHeight`: a growing box changes the sheet's own
            measured content height on every line wrap, and a dynamically-
            sized sheet re-measures and re-snaps in response — the jitter. A
            constant height means the sheet measures once and never needs to
            move again; the field scrolls internally past that, same as any
            bounded multiline input. */}
        <Input
          ref={textFieldRef}
          // The key remounts the field so its buffer matches what this open
          // is for: empty for a new thought, the edited text otherwise. The
          // buffer is native-owned, so a state reset alone cannot reach it.
          key={`${fieldEpoch}-${editData?.id ?? 'new'}`}
          style={{ height: 120, textAlignVertical: 'top' }}
          placeholder="What's on your mind…"
          defaultValue={editData?.text ?? ''}
          onChangeText={setText}
          multiline
        />

        {/* Colour and tags are two facets of the thought, not one cluster.
            Unlabelled and 24 below the field but only 12 above the tag box,
            the swatches read as belonging to the tags — so each is now its
            own labelled block on the sheet's 24 rhythm, 12 within. */}
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
                onPress={() => setSelectedColor(c)}
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
                <Chip key={tag} size="sm" onClose={() => removeTag(tag)}>
                  {tag}
                </Chip>
              ))}
            </View>
          )}
          {/* The commit button is the field's own `endContent`, not a sibling
              beside it. As a sibling it needed the field to give up width to
              it — and `className` on `Input` styles the *field*, not the
              container, so the `flex-1` never reached the box that had to
              shrink: the field took the full row and pushed the button off
              the right edge of the screen. Inside, it cannot overflow, and it
              sits where a suffix belongs. */}
          <Input
            ref={tagFieldRef}
            placeholder="Add tag…"
            onChangeText={(v) => {
              if (v.endsWith(',')) {
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
                className={cn(!tagInput.trim() && 'opacity-40')}
              >
                <Check
                  size={18}
                  color={tagInput.trim() ? asColor(primary) : asColor(mutedForeground)}
                />
              </Touchable>
            }
          />

          <View className="flex-row flex-wrap items-center gap-2">
            <Touchable
              className="flex-row items-center gap-1 py-1"
              onPress={handleSuggestTags}
              disabled={suggesting || !text.trim()}
              hitSlop={6}
            >
              {suggesting ? (
                <Spinner size="sm" className="h-3.5 w-3.5" />
              ) : (
                <Sparkles size={14} color={asColor(primary)} />
              )}
              <ThemedText type="labelSm" color={asColor(primary)}>
                {suggesting ? 'SUGGESTING…' : 'SUGGEST TAGS'}
              </ThemedText>
            </Touchable>
            {aiSuggestions.map((tag) => {
              const isAdded = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
              return (
                <Touchable
                  key={tag}
                  className={cn(
                    'flex-row items-center gap-1 rounded-full border border-primary bg-muted px-3 py-1',
                    isAdded && 'opacity-50',
                  )}
                  onPress={() => !isAdded && addTag(tag)}
                >
                  {isAdded && <Check size={11} color={asColor(mutedForeground)} />}
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
          </View>
          {suggestError && (
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              {suggestError}
            </ThemedText>
          )}

          {allTags.length > 0 && (
            // RNGH's ScrollView, not RN's, and not `Sheet.ScrollView` either:
            // the sheet wraps its scroll region in a native gesture, and a
            // plain nested ScrollView loses the horizontal touch stream to it
            // — the row rendered but never scrolled. `Sheet.ScrollView` is
            // for the region the sheet drags against; this one is a sideways
            // strip inside it and must stay out of that negotiation.
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-1"
              contentContainerClassName="gap-2"
              keyboardShouldPersistTaps="handled"
            >
              {allTags.map((tag) => {
                const isAdded = tags.some((t) => t.toLowerCase() === tag.toLowerCase());
                return (
                  <Touchable
                    key={tag}
                    className={cn(
                      'flex-row items-center gap-1 rounded-full border border-surface-tertiary bg-muted px-3 py-1',
                      isAdded && 'opacity-50',
                    )}
                    onPress={() => !isAdded && addTag(tag)}
                  >
                    {isAdded && <Check size={11} color={asColor(mutedForeground)} />}
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
            </ScrollView>
          )}
        </View>

        <View className="gap-3">
          <GoldButton
            label={isEditing ? 'SAVE CHANGES' : 'SAVE THOUGHT'}
            onPress={handleSave}
          />
          <Touchable onPress={handleClose} className="items-center py-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>CANCEL</ThemedText>
          </Touchable>
        </View>
      </Sheet.ScrollView>
    </Sheet>

    {/* A sibling of the sheet, not a child: it must not be laid out or
        clipped by the sheet it is asking a question on behalf of. */}
    {wakeDialog}
    </>
  );
}
