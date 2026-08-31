import { Check } from 'lucide-react-native';
import { Fragment } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { spacing } from '@/constants/theme';
import { Item } from '@/components/ui/item';
import { Sheet } from '@/components/ui/sheet';

import { ThemedText } from '@/components/themed-text';
import { cn } from '@/lib/cn';
import type { CollectionWithCount } from '@/stores/collections';

import { asColor } from '@/utils/colors';

type CollectionPickerSheetProps = {
  visible: boolean;
  collections: CollectionWithCount[];
  bookCollectionIds: string[];
  onToggle: (collectionId: string, isAdded: boolean) => void;
  onClose: () => void;
};

export function CollectionPickerSheet({
  visible,
  collections,
  bookCollectionIds,
  onToggle,
  onClose,
}: CollectionPickerSheetProps) {
  const [mutedForeground, primaryForeground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary-foreground',
  ]);
  return (
    // `maxHeightRatio` is the cap and the ONLY cap: the sheet measures the
    // list and stops there, so the scroll region needs no `maxHeight` of its
    // own — it used to carry one because the old shell could not bound it.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.6} scrollable>
      <Sheet.ScrollView
        // `contentContainerStyle`, not `contentContainerClassName`: Uniwind
        // auto-instruments React Native's own components, and this scroll
        // region is the library's, so a class name on it has nothing to
        // resolve it.
        contentContainerStyle={{ gap: spacing[6], paddingHorizontal: spacing[6] }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="headlineSm">
          Add to Collection
        </ThemedText>

        {collections.length === 0 ? (
          <ThemedText
            type="bodySm"
            color={asColor(mutedForeground)}
            className="py-6"
          >
            No collections yet. Create one first.
          </ThemedText>
        ) : (
          <>
            {collections.map((col, index) => {
              const isAdded = bookCollectionIds.includes(col.id);
              return (
                <Fragment key={col.id}>
                  {/* Hairline between rows via Item's own separator, replacing
                      the old per-row `border-b` (which doubled as the last
                      row's bottom rule — the separator sits between rows
                      only, so that trailing line is gone). */}
                  {index > 0 && <Item.Separator />}
                  {/* `px-0`: the horizontal inset comes from the ScrollView's
                      `px-6` container, and Item's own `p-4` would double it. */}
                  <Item className="px-0 py-4" onPress={() => onToggle(col.id, isAdded)}>
                    <Item.Content className="gap-1">
                      <Item.Title>{col.name}</Item.Title>
                      <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                        {col.count} {col.count === 1 ? 'book' : 'books'}
                      </ThemedText>
                    </Item.Content>
                    <Item.Actions>
                      <View
                        className={cn(
                          'h-6 w-6 items-center justify-center rounded-full',
                          isAdded ? 'bg-primary' : 'bg-muted',
                        )}
                      >
                        {isAdded && (
                          <Check size={14} color={asColor(primaryForeground)} />
                        )}
                      </View>
                    </Item.Actions>
                  </Item>
                </Fragment>
              );
            })}
          </>
        )}
      </Sheet.ScrollView>
    </Sheet>
  );
}
