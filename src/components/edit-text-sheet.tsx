import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import type { z } from 'zod';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { isFilled } from '@/lib/text-fields';

export type EditTextSheetProps = {
  visible: boolean;
  /** What is being edited. Opening on a different one starts the field again. */
  editKey: string | null;
  heading: string;
  /** One line under the heading, when the edit needs saying what it does. */
  line?: string;
  placeholder: string;
  initialText: string;
  /** What counts as something to save: `TitleText`, `NoteText`. */
  schema: z.ZodType<string>;
  multiline?: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
};

/**
 * A sheet that edits one piece of text and saves it: a book's title, one of
 * Samwell's notes in the reader's own words.
 *
 * Lifted out of the book's Edit Title sheet when the notes became the second
 * thing edited this way, so both have the same field, the same SAVE and the
 * same way out.
 */
export function EditTextSheet({
  visible,
  editKey,
  heading,
  line,
  placeholder,
  initialText,
  schema,
  multiline,
  onClose,
  onSave,
}: EditTextSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  const [text, setText] = useState('');
  /*
   * Uncontrolled field: the text lives in the native buffer and React only
   * mirrors it out, never back in — a keystroke landing while JS is busy
   * can no longer be committed over by a stale `value` (dropped letters,
   * duplicated words). The field is keyed per open so the buffer starts
   * from the text as it is (`defaultValue`); the state mirror exists for
   * `handleSave` and is fed by `onChangeText` alone.
   */
  const fieldRef = useRef<TextInput>(null);
  const [openEpoch, setOpenEpoch] = useState(0);
  /*
   * Seeded on the edge where the sheet opens on something, not in an effect.
   *
   * setState during render for a prop change is React's sanctioned reset and
   * does not cascade. An effect gets there a render late, so the first frame
   * of the sheet shows the mirror left over from the last thing it was opened
   * on. Keyed on what is edited rather than on `visible` alone, because
   * opening it on a different one while it is already up is the same event.
   */
  const openedOn = visible ? editKey : null;
  const [seededFor, setSeededFor] = useState(openedOn);
  if (openedOn !== seededFor) {
    setSeededFor(openedOn);
    if (openedOn) setText(initialText);
  }

  const canSave = isFilled(schema, text);

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed || !editKey) return;
    onSave(trimmed);
    onClose();
  };

  const handleClose = () => {
    setText('');
    setOpenEpoch((epoch) => epoch + 1);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleClose}>
      {/* No `flex-1`: a dynamically-sized sheet has no height for a child
          to flex into — it takes its height FROM this column. */}
      <View className="gap-6 px-6">
        <View className="gap-1">
          <ThemedText type="headlineSm">{heading}</ThemedText>
          {line ? (
            <ThemedText type="bodySm" color={muted}>
              {line}
            </ThemedText>
          ) : null}
        </View>
        <Input
          ref={fieldRef}
          key={`${openEpoch}-${editKey ?? 'none'}`}
          placeholder={placeholder}
          defaultValue={initialText}
          onChangeText={setText}
          multiline={multiline}
          returnKeyType={multiline ? 'default' : 'done'}
          onSubmitEditing={multiline ? undefined : handleSave}
        />
        <View className="gap-3">
          <GoldButton label="SAVE" size="compact" onPress={handleSave} disabled={!canSave} />
          <Touchable onPress={handleClose} className="items-center py-3">
            <ThemedText type="labelSm" color={muted}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
