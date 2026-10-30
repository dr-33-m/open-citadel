import React from 'react';
import { View } from 'react-native';

import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Item } from '@/components/ui/item';
import { SearchBar } from '@/components/ui/search-bar';
import { Sheet } from '@/components/ui/sheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export interface AttachmentPickerSheetProps<T> {
  visible: boolean;
  onClose: () => void;
  /** "Pick a book", "Pick a post", "Pick an episode". */
  title: string;
  /** "Search books…". */
  placeholder: string;
  /** Undefined until the list has been read: the skeleton shows. */
  items: readonly T[] | undefined;
  /** Whether an item answers the search. Only asked with something typed. */
  matches: (item: T, query: string) => boolean;
  keyOf: (item: T) => string;
  /** A memoised row; stable, so a keystroke re-renders the sheet and not the list. */
  renderItem: (info: { item: T }) => React.ReactElement;
  skeleton: React.ReactNode;
  /** Said when there is nothing to pick at all. */
  emptyText: string;
  /** Said when the search finds nothing. */
  noMatchText: string;
  /** Pinned between the title and the search field: a switch of windows, say. */
  filter?: React.ReactNode;
}

function RowSeparator() {
  return <Item.Separator />;
}

const FILL = { flex: 1 } as const;

/**
 * Attaching something to a chat: a title, a search, and a list of what can
 * be attached, one tap each. One sheet for every kind (a book, a blog post, a
 * podcast episode), so each picker is only its rows and what a pick does.
 *
 * Fixed height, because the list is the whole sheet: one that is two rows
 * tall for a short list and full screen for a long one moves the search
 * field every time it opens. The title, any filter and the field are pinned
 * above the list and never scroll.
 *
 * The field is uncontrolled: its text lives in the native buffer and
 * `onChangeText` mirrors it out, so a keystroke landing while the JS thread
 * is busy is never committed over by a stale value (what once made typing
 * here drop and repeat letters). The list filters on the deferred query, so
 * a burst of keystrokes never re-filters on every letter. Every dismissal
 * passes through `close`, which remounts the field so nothing typed survives
 * to the next opening.
 */
export function AttachmentPickerSheet<T>({
  visible,
  onClose,
  title,
  placeholder,
  items,
  matches,
  keyOf,
  renderItem,
  skeleton,
  emptyText,
  noMatchText,
  filter,
}: AttachmentPickerSheetProps<T>) {
  const tokens = useThemeTokens();
  const [query, setQuery] = React.useState('');
  const deferred = React.useDeferredValue(query);
  const [fieldEpoch, setFieldEpoch] = React.useState(0);

  const filtered = React.useMemo(() => {
    const typed = deferred.trim();
    return typed && items ? items.filter((item) => matches(item, typed)) : (items ?? []);
  }, [deferred, items, matches]);

  const close = () => {
    setFieldEpoch((epoch) => epoch + 1);
    setQuery('');
    onClose();
  };

  const loaded = items !== undefined;
  const empty = loaded && filtered.length === 0 ? (items.length === 0 ? emptyText : noMatchText) : null;

  return (
    <Sheet visible={visible} onClose={close} fixedHeightRatio={0.7}>
      <View className="flex-row items-center justify-between px-6 pb-3">
        <ThemedText type="headlineSm">{title}</ThemedText>
      </View>
      {filter ? <View className="mx-6 mb-3">{filter}</View> : null}
      {/* Wrapped: SearchBar's own container prop lands on an inner view. No
          `avoidKeyboard`, since the sheet itself lifts off the keyboard. */}
      <View className="mx-6 mb-3">
        <SearchBar key={fieldEpoch} variant="filled" placeholder={placeholder} onChangeText={setQuery} />
      </View>
      {/* Only the list waits for the rise: rows carry a picture each. */}
      <Sheet.Deferred skeleton={skeleton}>
        {!loaded ? (
          skeleton
        ) : empty ? (
          <View className="flex-1 items-center px-6 pt-4">
            <ThemedText type="bodySm" color={tokens['--color-muted-foreground']} className="text-center">
              {empty}
            </ThemedText>
          </View>
        ) : (
          <PageFade edges="both" surface="popover">
            <Sheet.FlatList
              style={FILL}
              data={filtered}
              keyExtractor={keyOf}
              ItemSeparatorComponent={RowSeparator}
              // A row tapped with the keyboard up picks it, rather than only closing the keyboard.
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={renderItem}
            />
          </PageFade>
        )}
      </Sheet.Deferred>
    </Sheet>
  );
}
