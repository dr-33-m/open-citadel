import React from "react";
import { View } from "react-native";
import { useCSSVariable } from "uniwind";

import { ColorSwatch, HIGHLIGHT_COLORS } from "@/components/color-swatch";
import { ThemedText } from "@/components/themed-text";
import { SearchBar } from "@/components/ui/search-bar";
import { Touchable } from "@/components/ui/touchable";
import { cn } from "@/lib/cn";
import { asColor } from "@/utils/colors";

/**
 * The search-and-filters header, pinned above the highlights list rather
 * than scrolling inside it. As the list's header it sat in the scroll content,
 * so every keystroke that filtered the rows changed the content height under
 * the focused field and the scroll position (and the field with it) jumped.
 *
 * Memoized so a keystroke only re-renders the list — the field itself is
 * uncontrolled (no `value` round-trip: a keystroke that lands while JS is busy
 * can no longer be committed over by a stale string) and its text escapes via
 * `onSearch`.
 */
export const HighlightsHeader = React.memo(function HighlightsHeader({
  activeColor,
  onSelectColor,
  onSearch,
}: {
  activeColor: string | null;
  onSelectColor: (color: string | null) => void;
  onSearch: (text: string) => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);
  return (
    /* Search and its filters are one control, so they sit 16 apart inside
        a block that keeps 24 below it — not 8 apart with 12 below, which
        left the filter row reading as a stray strip between the field and
        the results. The swatches are the same shared control as the reader's
        own colour picker, at the same size and with the same ring. */
    <View className="mx-6 mb-6 mt-4 gap-4">
      <SearchBar
        variant="filled"
        placeholder="Search highlights or tags…"
        onChangeText={onSearch}
        returnKeyType="search"
      />

      <View className="flex-row items-center gap-3">
        <Touchable
          className={cn(
            "h-7 justify-center pr-1",
            !activeColor && "border-b border-primary",
          )}
          onPress={() => onSelectColor(null)}
        >
          <ThemedText
            type="labelSm"
            color={activeColor ? asColor(mutedForeground) : asColor(primary)}
          >
            ALL
          </ThemedText>
        </Touchable>
        {HIGHLIGHT_COLORS.map((c) => (
          <ColorSwatch
            key={c}
            color={c}
            selected={activeColor === c}
            onPress={() => onSelectColor(c)}
            accessibilityLabel={`Filter by colour ${c}`}
          />
        ))}
      </View>
    </View>
  );
});
