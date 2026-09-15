import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { TitleText, isFilled } from '@/lib/text-fields';
import type { books as booksTable } from '@/db/schema';

import { asColor } from '@/utils/colors';

type Book = typeof booksTable.$inferSelect;

type EditTitleSheetProps = {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onSave: (bookId: string, title: string) => void;
};

export function EditTitleSheet({
  visible,
  book,
  onClose,
  onSave,
}: EditTitleSheetProps) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const [title, setTitle] = useState('');
  /*
   * Uncontrolled field: the text lives in the native buffer and React only
   * mirrors it out, never back in — a keystroke landing while JS is busy
   * can no longer be committed over by a stale `value` (dropped letters,
   * duplicated words). The field is keyed per open so the buffer starts
   * from the book's actual title (`defaultValue`); the state mirror exists
   * for `handleSave` and is fed by `onChangeText` alone.
   */
  const fieldRef = useRef<TextInput>(null);
  const [openEpoch, setOpenEpoch] = useState(0);

  /*
   * Seeded on the edge where the sheet opens on a book, not in an effect.
   *
   * setState during render for a prop change is React's sanctioned reset and
   * does not cascade — the same shape `SamwellControlCenter` uses for its Stop
   * button. An effect gets there a render late, so the first frame of the
   * sheet shows the mirror left over from the last book it was opened on.
   *
   * Keyed on the book's id rather than on `visible` alone, because opening it
   * on a different book while it is already up is the same event.
   */
  const openedOn = visible && book ? book.id : null;
  const [seededFor, setSeededFor] = useState(openedOn);
  if (openedOn !== seededFor) {
    setSeededFor(openedOn);
    if (book && openedOn) setTitle(book.title);
  }

  const canSave = isFilled(TitleText, title);

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed || !book) return;
    onSave(book.id, trimmed);
    onClose();
  };

  const handleClose = () => {
    setTitle('');
    setOpenEpoch((epoch) => epoch + 1);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={handleClose}>
      {/* No `flex-1`: a dynamically-sized sheet has no height for a child
          to flex into — it takes its height FROM this column. */}
      <View className="gap-6 px-6">
        <ThemedText type="headlineSm">Edit Title</ThemedText>
        <Input
          ref={fieldRef}
          key={`${openEpoch}-${book?.id ?? 'none'}`}
          placeholder="Book title…"
          defaultValue={book?.title ?? ''}
          onChangeText={setTitle}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <View className="gap-3">
          <GoldButton label="SAVE" onPress={handleSave} disabled={!canSave} />
          <Touchable onPress={handleClose} className="items-center py-3">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
