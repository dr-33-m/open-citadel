import { Plus, SquareLibrary } from "@/components/icons";
import React from "react";
import { ScrollView } from "react-native";
import { useCSSVariable } from "uniwind";

import { RowFade } from "@/components/scroll-fades";
import { Touchable } from "@/components/ui/touchable";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import type { CollectionWithCount } from "@/stores/collections";

type CollectionGridProps = {
  collections: CollectionWithCount[];
  onPress: (collectionId: string) => void;
  onCreateCollection?: () => void;
};

/** ThemedText/lucide icons take a literal color, not a className. */
function asColor(value: string | number | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function CollectionGrid({
  collections,
  onPress,
  onCreateCollection,
}: CollectionGridProps) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);

  // The fade is the affordance: it says there is more past the edge, and
  // it shows only when there actually is.
  return (
    <RowFade>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="grow-0"
        contentContainerClassName="flex-row gap-4 px-6"
      >
        {collections.map((collection) => (
          <Touchable key={collection.id} onPress={() => onPress(collection.id)}>
            <Card className="h-[140px] w-[140px] justify-between gap-2 p-4">
              <SquareLibrary size={22} color={asColor(primary)} />
              <ThemedText type="bodyMd" numberOfLines={2}>
                {collection.name}
              </ThemedText>
              <ThemedText type="labelSm" color={asColor(primary)}>
                {collection.count} {collection.count === 1 ? "BOOK" : "BOOKS"}
              </ThemedText>
            </Card>
          </Touchable>
        ))}

        {onCreateCollection && (
          <Touchable onPress={onCreateCollection}>
            <Card className="h-[140px] w-[140px] items-center justify-center gap-2 border-dashed shadow-none">
              <Plus size={22} color={asColor(mutedForeground)} />
              <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                NEW
              </ThemedText>
            </Card>
          </Touchable>
        )}
      </ScrollView>
    </RowFade>
  );
}
