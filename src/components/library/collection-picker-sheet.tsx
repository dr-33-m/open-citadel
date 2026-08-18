import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import React from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';

import { ThemedText } from '@/components/themed-text';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';
import type { CollectionWithCount } from '@/stores/collections';

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
  const colors = useColors();

  const styles = React.useMemo(() => StyleSheet.create({
    sheet: {
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[6],
      paddingTop: spacing[4],
      paddingBottom: spacing[10],
    },
    title: { marginBottom: spacing[4] },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing[4],
      borderBottomWidth: 1,
      borderBottomColor: colors.surface.highest,
    },
    rowLeft: { flex: 1, gap: spacing[1] },
    checkCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: { paddingVertical: spacing[6] },
  }), [colors]);

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.6} scrollable>
      <BottomSheetScrollView
        contentContainerStyle={styles.sheet}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="headlineSm" style={styles.title}>
          Add to Collection
        </ThemedText>

        {collections.length === 0 ? (
          <ThemedText type="bodySm" color={colors.text.secondary} style={styles.empty}>
            No collections yet. Create one first.
          </ThemedText>
        ) : (
          <>
            {collections.map((col) => {
              const isAdded = bookCollectionIds.includes(col.id);
              return (
                <Touchable
                  key={col.id}
                  style={styles.row}
                  onPress={() => onToggle(col.id, isAdded)}
                >
                  <View style={styles.rowLeft}>
                    <ThemedText type="bodyMd" color={colors.text.primary}>
                      {col.name}
                    </ThemedText>
                    <ThemedText type="labelSm" color={colors.text.secondary}>
                      {col.count} {col.count === 1 ? 'book' : 'books'}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.checkCircle,
                      {
                        backgroundColor: isAdded
                          ? colors.primary.default
                          : colors.surface.mid,
                      },
                    ]}
                  >
                    {isAdded && <Check size={14} color={colors.text.inverse} />}
                  </View>
                </Touchable>
              );
            })}
          </>
        )}
      </BottomSheetScrollView>
    </Sheet>
  );
}
