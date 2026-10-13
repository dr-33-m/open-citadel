import React from "react";
import { View } from "react-native";

import { PageFade } from "@/components/scroll-fades";
import { VoiceListSkeleton } from "@/components/skeletons/voice-list-skeleton";
import { ThemedText } from "@/components/themed-text";
import { Sheet } from "@/components/ui/sheet";
import {
    VoiceListRows,
    type VoiceListRowsProps,
} from "@/features/tts/components/voice-list-rows";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import {
    voiceTotalLabel,
    type DeviceVoice,
    type DeviceVoiceRow,
} from "@/utils/device-voices";

export interface VoiceListSheetProps {
  visible: boolean;
  onClose: () => void;
  rows: DeviceVoiceRow[];
  loading: boolean;
  /** The saved voice's identifier, '' for the system default. */
  selected: string;
  previewing: string | null;
  /** The voice whose sample is being made and cannot be heard yet. */
  preparing?: string | null;
  /** Something a sample has to say for itself: it is still loading, or it failed. */
  note?: string | null;
  onSelect: (voice: DeviceVoice) => void;
  onPreview: (voice: DeviceVoice) => void;
}

/** The list of voices to choose from, opened from the voice row: the phone's own, or a voice box's. */
export function VoiceListSheet({
  visible,
  onClose,
  rows,
  loading,
  selected,
  previewing,
  preparing,
  note,
  onSelect,
  onPreview,
}: VoiceListSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens["--color-muted-foreground"];
  // Nothing to count while the phone has not answered yet.
  const total = loading ? null : voiceTotalLabel(rows);
  return (
    // Fixed height, one detent, and a plain `Sheet.ScrollView` rather than
    // `Sheet.FlatList` — the same shape `PlanInfoSheet` uses, which is the
    // one other sheet in the app genuinely nested inside another open sheet
    // (via `stackBehavior="push"`, same as here). FlashList's gesture
    // registration (`Sheet.FlatList`'s `useBottomSheetScrollableCreator`) is
    // what every *other* nested-in-a-sheet picker in this codebase avoids —
    // `Select`'s own sheet presentation isn't used inside a sheet either, in
    // favour of its plain-`ScrollView` overlay presentation. Scrolling this
    // list while it sat behind a second, independently-gestured `BottomSheetModal`
    // is what made the drawer behind it jump/expand and made a plain pan hard
    // to close: two live gesture recognizers over the same list, not the
    // detents or the stack behavior.
    //
    // A plain scroll view draws every row it is given, so the rows arrive a
    // screenful at a time (`VoiceListRows`).
    <Sheet
      visible={visible}
      onClose={onClose}
      stackBehavior="push"
      fixedHeightRatio={0.75}
    >
      <View className="gap-1 px-6 pb-3 pt-2">
        <View className="flex-row items-baseline justify-between gap-3">
          <ThemedText type="headlineSm">Select voice</ThemedText>
          {total ? (
            <ThemedText type="bodySm" color={muted}>
              {total}
            </ThemedText>
          ) : null}
        </View>
        {note ? (
          <ThemedText type="bodySm" color={muted}>
            {note}
          </ThemedText>
        ) : null}
      </View>

      {/* A placeholder only for a real wait: the phone has not answered yet.
          It is asked ahead (when Settings opens), so the usual case is a list
          already in hand, and that is drawn with the sheet as it rises: its
          first screenful at once, the rest in steps after the sheet lands
          (`VoiceListRows`). It used to rise onto the placeholder every time
          and swap to the list after, which read as the voices loading again
          on each open. */}
      {loading ? (
        <VoiceListSkeleton />
      ) : (
        <VoiceList
          rows={rows}
          selected={selected}
          previewing={previewing}
          preparing={preparing}
          onSelect={onSelect}
          onPreview={onPreview}
        />
      )}
    </Sheet>
  );
}

/**
 * The scrolling list itself. Its own component so that "has this been
 * scrolled" lives and dies with one opening of the sheet: the body is
 * unmounted when the sheet closes, and the next opening starts again from
 * the first few rows.
 */
function VoiceList(props: Omit<VoiceListRowsProps, "scrolled">) {
  const [scrolled, setScrolled] = React.useState(false);
  const markScrolled = React.useCallback(() => setScrolled(true), []);
  return (
    <PageFade edges="both" surface="popover">
      <Sheet.ScrollView onScrollBeginDrag={markScrolled}>
        <VoiceListRows {...props} scrolled={scrolled} />
      </Sheet.ScrollView>
    </PageFade>
  );
}
