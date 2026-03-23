import { LibraryBig } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { useColors } from '@/hooks/use-colors';
import { spacing } from '@/constants/theme';

type DirectoryPromptProps = {
  onSelectDirectory: () => void;
};

export function DirectoryPrompt({ onSelectDirectory }: DirectoryPromptProps) {
  const colors = useColors();
  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing[10],
      gap: spacing[5],
    },
    iconContainer: {
      marginBottom: spacing[4],
    },
    title: {
      textAlign: 'center',
    },
    description: {
      textAlign: 'center',
      lineHeight: 24,
    },
    buttonContainer: {
      marginTop: spacing[6],
      alignSelf: 'stretch',
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <LibraryBig size={48} color={colors.primary.default} />
      </View>

      <ThemedText type="headlineLg" style={styles.title}>
        Build Your Library
      </ThemedText>

      <ThemedText
        type="bodyMd"
        color={colors.text.secondary}
        style={styles.description}
      >
        Select the folder on your device where your ebooks are stored. The app
        will sync all .epub files from that folder.
      </ThemedText>

      <View style={styles.buttonContainer}>
        <GoldButton label="SELECT FOLDER" onPress={onSelectDirectory} />
      </View>
    </View>
  );
}
