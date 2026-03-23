import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { colors, spacing } from '@/constants/theme';
import type { Collection } from '@/data/mock';

type CollectionGridProps = {
  collections: Collection[];
};

export function CollectionGrid({ collections }: CollectionGridProps) {
  return (
    <View style={styles.grid}>
      {collections.map((collection) => (
        <View key={collection.id} style={styles.cell}>
          <Text style={styles.icon}>{collection.icon}</Text>
          <ThemedText type="bodyMd">{collection.name}</ThemedText>
          <ThemedText type="labelSm" color={colors.primary.default}>
            {collection.count} MANUSCRIPTS
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing[6],
    gap: spacing[4],
  },
  cell: {
    width: '47%',
    backgroundColor: colors.surface.low,
    padding: spacing[5],
    gap: spacing[2],
  },
  icon: {
    fontSize: 28,
    marginBottom: spacing[2],
  },
});
