import { Plus, SquareLibrary } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Touchable } from "@/components/ui/touchable";

import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import type { CollectionWithCount } from "@/stores/collections";

type CollectionGridProps = {
  collections: CollectionWithCount[];
  onPress: (collectionId: string) => void;
  onCreateCollection?: () => void;
};

const CELL_WIDTH = 140;

export function CollectionGrid({
  collections,
  onPress,
  onCreateCollection,
}: CollectionGridProps) {
  const colors = useColors();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        scroll: { flexGrow: 0 },
        content: {
          flexDirection: "row",
          paddingHorizontal: spacing[6],
          gap: spacing[4],
        },
        cell: {
          width: CELL_WIDTH,
          backgroundColor: colors.surface.low,
          padding: spacing[5],
          gap: spacing[2],
        },
        createCell: {
          width: CELL_WIDTH,
          aspectRatio: 1,
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.surface.highest,
          borderStyle: "dashed",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing[2],
        },
      }),
    [colors],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {collections.map((collection) => (
        <Touchable
          key={collection.id}
          style={styles.cell}
          onPress={() => onPress(collection.id)}
        >
          <SquareLibrary size={22} color={colors.primary.default} />
          <ThemedText type="bodyMd" numberOfLines={2}>
            {collection.name}
          </ThemedText>
          <ThemedText type="labelSm" color={colors.primary.default}>
            {collection.count} {collection.count === 1 ? "BOOK" : "BOOKS"}
          </ThemedText>
        </Touchable>
      ))}

      {onCreateCollection && (
        <Touchable style={styles.createCell} onPress={onCreateCollection}>
          <Plus size={22} color={colors.text.secondary} />
          <ThemedText type="labelSm" color={colors.text.secondary}>
            NEW
          </ThemedText>
        </Touchable>
      )}
    </ScrollView>
  );
}
