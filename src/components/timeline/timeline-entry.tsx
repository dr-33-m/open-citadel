import { ChevronLeft, ChevronRight } from "@/components/icons";
import React, { useState } from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui/card";
import { Touchable } from "@/components/ui/touchable";
import { easing, fontFamily, motion } from "@/constants/theme";
import { asColor } from "@/utils/colors";
import type { TimelineItem } from "@/stores/timeline";

type TimelineEntryProps = {
  entry: TimelineItem;
  isLast?: boolean;
  onPress?: () => void;
  /** Opens the entry's action sheet — edit, chat, export, delete. */
  onLongPress?: () => void;
};

export function TimelineEntry({ entry, isLast, onPress, onLongPress }: TimelineEntryProps) {
  // Literal colours for the consumers a className can't reach: ThemedText's
  // `color` prop and the lucide chevrons'.
  const [mutedForeground, surfaceTertiary] = useCSSVariable([
    "--color-muted-foreground",
    "--color-surface-tertiary",
  ]);
  const [noteIndex, setNoteIndex] = useState(0);
  const { noteTexts } = entry;
  const hasNotes = noteTexts.length > 0;
  const hasMultiple = noteTexts.length > 1;

  const prev = () => setNoteIndex((i) => Math.max(0, i - 1));
  const next = () => setNoteIndex((i) => Math.min(noteTexts.length - 1, i + 1));

  return (
    <View className="px-6 pt-4">
      {/* Indicator + metadata row */}
      <View className="mb-4 flex-row items-center gap-3">
        <View
          className="h-2.5 w-2.5"
          style={{ backgroundColor: entry.colorIndicator }}
        />
        <ThemedText
          type="labelSm"
          color={asColor(mutedForeground)}
          className="flex-1"
        >
          {entry.bookTitle}
        </ThemedText>
        {entry.type === "thought" && !!entry.updatedAt && (
          <ThemedText
            type="labelSm"
            color={asColor(mutedForeground)}
            style={{ fontStyle: "italic" }}
          >
            edited
          </ThemedText>
        )}
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {entry.timestamp}
        </ThemedText>
      </View>

      {/* Quote card */}
      <Touchable onPress={onPress} onLongPress={onLongPress}>
        <Card className="py-6 pl-8 pr-5">
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
            <View className="mt-4 flex-row flex-wrap gap-2">
              {entry.tags.map((tag) => (
                <View
                  key={tag}
                  className="rounded-full border border-surface-tertiary bg-card px-3 py-1"
                >
                  <ThemedText type="labelSm" color={asColor(mutedForeground)}>
                    {tag}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </Card>
      </Touchable>

      {/* Notes — single or carousel */}
      {hasNotes && (
        <View className="mt-4 flex-row gap-2 pl-4">
          <ThemedText
            type="bodySm"
            color={asColor(mutedForeground)}
            style={{ fontSize: 20, lineHeight: 24 }}
          >
            ❝
          </ThemedText>

          <View className="flex-1 gap-2">
            <View className="flex-row items-center gap-2">
              {hasMultiple && (
                <Touchable
                  onPress={prev}
                  disabled={noteIndex === 0}
                  haptic="tap"
                  hitSlop={8}
                  className="p-1"
                >
                  <ChevronLeft
                    size={16}
                    color={
                      noteIndex === 0
                        ? asColor(surfaceTertiary)
                        : asColor(mutedForeground)
                    }
                  />
                </Touchable>
              )}

              {/* Keyed on index: the outgoing note fades out while the next
                  one fades in, instead of the text swapping instantly. */}
              {/* Reanimated `Animated.*` takes `style=`, not a className. */}
              <Animated.View
                key={noteIndex}
                entering={FadeIn.duration(motion.fast).easing(easing)}
                exiting={FadeOut.duration(motion.fast).easing(easing)}
                style={{ flex: 1 }}
              >
                <ThemedText type="bodySm" color={asColor(mutedForeground)}>
                  {noteTexts[noteIndex]}
                </ThemedText>
              </Animated.View>

              {hasMultiple && (
                <Touchable
                  onPress={next}
                  disabled={noteIndex === noteTexts.length - 1}
                  haptic="tap"
                  hitSlop={8}
                  className="p-1"
                >
                  <ChevronRight
                    size={16}
                    color={
                      noteIndex === noteTexts.length - 1
                        ? asColor(surfaceTertiary)
                        : asColor(mutedForeground)
                    }
                  />
                </Touchable>
              )}
            </View>

            {hasMultiple && (
              <ThemedText
                type="labelSm"
                color={asColor(mutedForeground)}
                style={{ textAlign: "right" }}
              >
                {noteIndex + 1} / {noteTexts.length}
              </ThemedText>
            )}
          </View>
        </View>
      )}

      {/* Vertical connector — the thread between two entries, so it has to
          read as spanning the gap rather than floating in the middle of one.
          It used to be 20 above + 40 of line + 32 of the next entry's top
          padding: 92dp between cards, with a short rule stranded in it. */}
      {!isLast && <View className="ml-1 mt-3 h-6 w-px bg-surface-tertiary" />}
    </View>
  );
}
