import React, {
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { View } from "react-native";
import type { Locator } from "@dr33m/react-native-readium";

import { HighlightsHeader } from "@/components/reader/toc-highlights-header";
import {
  FILL,
  parseJson,
  type Highlight,
  type RowColors,
} from "@/components/reader/toc-shared";
import { PageFade } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Item } from "@/components/ui/item";
import { Sheet } from "@/components/ui/sheet";

type HighlightRowData = {
  id: string;
  text: string;
  color: string | null;
  tags: string[];
  locator: Locator | null;
  createdAt: string;
};

function matchesHighlight(
  row: HighlightRowData,
  query: string,
  color: string | null,
): boolean {
  if (color && row.color !== color) return false;
  if (!query) return true;
  return (
    row.text.toLowerCase().includes(query) ||
    row.tags.some((t) => t.toLowerCase().includes(query))
  );
}

const HighlightRow = React.memo(function HighlightRow({
  data,
  colors,
  onPress,
}: {
  data: HighlightRowData;
  colors: RowColors;
  onPress: (locator: Locator) => void;
}) {
  return (
    <Item
      className="items-stretch border-b border-surface-tertiary px-6 py-4"
      onPress={() => data.locator && onPress(data.locator)}
    >
      <Item.Media
        className="w-1 min-h-[20px] self-stretch rounded-[2px]"
        style={{ backgroundColor: data.color ?? colors.primary }}
      />
      <Item.Content className="gap-2">
        <ThemedText type="bodySm">{data.text}</ThemedText>
        {data.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-2">
            {data.tags.map((tag) => (
              <View
                key={tag}
                className="rounded-full border border-surface-tertiary bg-muted px-3 py-[2px]"
              >
                <ThemedText type="labelSm" color={colors.mutedForeground}>
                  {tag}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </Item.Content>
    </Item>
  );
});

export function HighlightsTab({
  highlights,
  onHighlightPress,
  colors,
}: {
  highlights: Highlight[];
  onHighlightPress: (locator: Locator) => void;
  colors: RowColors;
}) {
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Filtered against the deferred query, so a burst of keystrokes re-filters
  // and re-renders the list once rather than on every letter.
  const deferredSearch = useDeferredValue(search);

  /*
   * Parse and sort once per data change, not once per row per render: tags
   * and locators arrive as JSON strings and used to be `JSON.parse`d inside
   * every row on every render of the list. Parsing is split from filtering
   * so a keystroke filters the parsed rows instead of re-parsing them.
   */
  const parsed = useMemo<HighlightRowData[]>(() => {
    const rows = highlights.map((h) => ({
      id: h.id,
      text: h.text,
      color: h.color,
      tags: parseJson<string[]>(h.tags, []),
      locator: parseJson<Locator | null>(h.locator, null),
      createdAt: h.createdAt,
    }));
    rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return rows;
  }, [highlights]);

  const rows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query && !activeColor) return parsed;
    return parsed.filter((h) => matchesHighlight(h, query, activeColor));
  }, [parsed, deferredSearch, activeColor]);

  const renderItem = useCallback(
    ({ item }: { item: HighlightRowData }) => (
      <HighlightRow data={item} colors={colors} onPress={onHighlightPress} />
    ),
    [colors, onHighlightPress],
  );

  if (highlights.length === 0) {
    return (
      <ThemedText type="bodySm" color={colors.mutedForeground} className="px-6 py-6">
        No highlights yet.
      </ThemedText>
    );
  }

  const noMatches = rows.length === 0;

  return (
    <View style={FILL}>
      <HighlightsHeader
        activeColor={activeColor}
        onSelectColor={setActiveColor}
        onSearch={setSearch}
      />

      {noMatches ? (
        <ThemedText type="bodySm" color={colors.mutedForeground} className="px-6">
          No highlights match.
        </ThemedText>
      ) : (
        <PageFade edges="both" surface="popover">
          <Sheet.FlatList
            style={FILL}
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </PageFade>
      )}
    </View>
  );
}
