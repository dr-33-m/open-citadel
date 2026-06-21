import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Touchable } from "@/components/ui/touchable";
import { fontFamily, spacing } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import type { TimelineItem } from "@/stores/timeline";

type TimelineEntryProps = {
  entry: TimelineItem;
  isLast?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function TimelineEntry({ entry, isLast, onPress, onLongPress }: TimelineEntryProps) {
  const colors = useColors();
  const [noteIndex, setNoteIndex] = useState(0);
  const { noteTexts } = entry;
  const hasNotes = noteTexts.length > 0;
  const hasMultiple = noteTexts.length > 1;

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: spacing[6],
          paddingTop: spacing[8],
        },
        metaRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[3],
          marginBottom: spacing[4],
        },
        indicator: {
          width: 10,
          height: 10,
        },
        bookTitle: {
          flex: 1,
        },
        quoteCard: {
          backgroundColor: colors.surface.low,
          padding: spacing[6],
          paddingLeft: spacing[8],
          paddingRight: spacing[5],
        },
        noteContainer: {
          flexDirection: "row",
          gap: spacing[2],
          marginTop: spacing[4],
          paddingLeft: spacing[4],
        },
        quoteIcon: {
          fontSize: 20,
          lineHeight: 24,
        },
        noteBody: {
          flex: 1,
          gap: spacing[2],
        },
        noteRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: spacing[2],
        },
        arrow: {
          padding: spacing[1],
        },
        noteText: {
          flex: 1,
        },
        pageIndicator: {
          textAlign: "right",
        },
        connector: {
          width: 1,
          height: spacing[10],
          backgroundColor: colors.surface.highest,
          marginLeft: 4,
          marginTop: spacing[5],
        },
        tagRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing[2],
          marginTop: spacing[4],
        },
        tagChip: {
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.surface.highest,
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[1],
          borderRadius: 99,
        },
        tagChipText: {
          fontSize: 11,
        },
      }),
    [colors],
  );

  const prev = () => setNoteIndex((i) => Math.max(0, i - 1));
  const next = () => setNoteIndex((i) => Math.min(noteTexts.length - 1, i + 1));

  return (
    <View style={styles.container}>
      {/* Indicator + metadata row */}
      <View style={styles.metaRow}>
        <View
          style={[styles.indicator, { backgroundColor: entry.colorIndicator }]}
        />
        <ThemedText
          type="labelSm"
          color={colors.text.secondary}
          style={styles.bookTitle}
        >
          {entry.bookTitle}
        </ThemedText>
        {entry.type === "thought" && !!entry.updatedAt && (
          <ThemedText
            type="labelSm"
            color={colors.text.secondary}
            style={{ fontStyle: "italic" }}
          >
            edited
          </ThemedText>
        )}
        <ThemedText type="bodySm" color={colors.text.secondary}>
          {entry.timestamp}
        </ThemedText>
      </View>

      {/* Quote card */}
      <Touchable onPress={onPress} onLongPress={onLongPress} delayLongPress={400}>
        <View style={styles.quoteCard}>
          <ThemedText
            type="bodyLg"
            style={
              entry.type !== "thought"
                ? { fontFamily: fontFamily.serifItalic }
                : undefined
            }
          >
            {entry.highlightText}
          </ThemedText>

          {entry.tags.length > 0 && (
            <View style={styles.tagRow}>
              {entry.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <ThemedText
                    type="labelSm"
                    color={colors.text.secondary}
                    style={styles.tagChipText}
                  >
                    {tag}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>
      </Touchable>

      {/* Notes — single or carousel */}
      {hasNotes && (
        <View style={styles.noteContainer}>
          <ThemedText
            type="bodySm"
            color={colors.text.secondary}
            style={styles.quoteIcon}
          >
            ❝
          </ThemedText>

          <View style={styles.noteBody}>
            <View style={styles.noteRow}>
              {hasMultiple && (
                <Touchable
                  onPress={prev}
                  disabled={noteIndex === 0}
                  hitSlop={8}
                  style={styles.arrow}
                >
                  <ChevronLeft
                    size={16}
                    color={
                      noteIndex === 0
                        ? colors.surface.highest
                        : colors.text.secondary
                    }
                  />
                </Touchable>
              )}

              <ThemedText
                type="bodySm"
                color={colors.text.secondary}
                style={styles.noteText}
              >
                {noteTexts[noteIndex]}
              </ThemedText>

              {hasMultiple && (
                <Touchable
                  onPress={next}
                  disabled={noteIndex === noteTexts.length - 1}
                  hitSlop={8}
                  style={styles.arrow}
                >
                  <ChevronRight
                    size={16}
                    color={
                      noteIndex === noteTexts.length - 1
                        ? colors.surface.highest
                        : colors.text.secondary
                    }
                  />
                </Touchable>
              )}
            </View>

            {hasMultiple && (
              <ThemedText
                type="labelSm"
                color={colors.text.secondary}
                style={styles.pageIndicator}
              >
                {noteIndex + 1} / {noteTexts.length}
              </ThemedText>
            )}
          </View>
        </View>
      )}

      {/* Vertical connector */}
      {!isLast && <View style={styles.connector} />}
    </View>
  );
}
