import { View, useWindowDimensions } from "react-native";
import { useCSSVariable } from "uniwind";

import { ThemedText } from "@/components/themed-text";
import { useSheetResting } from "@/components/ui/sheet";
import { VoiceListItem } from "@/features/tts/components/voice-list-item";
import { useStagedVoiceRows } from "@/features/tts/hooks/use-staged-voice-rows";
import { asColor } from "@/utils/colors";
import { estimatedRowsHeight, type DeviceVoice, type DeviceVoiceRow } from "@/utils/device-voices";

export interface VoiceListRowsProps {
  rows: DeviceVoiceRow[];
  /** The saved voice's identifier, '' for the system default. */
  selected: string;
  previewing: string | null;
  /** The voice whose sample is being made and cannot be heard yet. */
  preparing?: string | null;
  /** The list has been scrolled, so the rows past the first few are worth drawing. */
  scrolled?: boolean;
  onSelect: (voice: DeviceVoice) => void;
  onPreview: (voice: DeviceVoice) => void;
}

/**
 * The voice list's rows: headings and the voices under them. The first
 * screenful is drawn with the sheet and the rest when the list is scrolled
 * (`useStagedVoiceRows`), in room kept for them from the start.
 */
export function VoiceListRows({
  rows,
  selected,
  previewing,
  preparing = null,
  scrolled = true,
  onSelect,
  onPreview,
}: VoiceListRowsProps) {
  // The first screenful rises with the sheet; the rest wait for it to land,
  // and wait again whenever it is dragged. Rows committed under a finger that
  // is dragging the sheet make it stutter and jump back.
  const drawn = useStagedVoiceRows(rows, !useSheetResting(), scrolled);
  // Room for the rows still to come, so the list is its whole length to
  // scroll into from the first frame. Gone once they are all drawn.
  const { fontScale } = useWindowDimensions();
  const room = drawn.length < rows.length ? { minHeight: estimatedRowsHeight(rows, fontScale) } : undefined;
  const [primaryVar, mutedVar] = useCSSVariable([
    "--color-primary",
    "--color-muted-foreground",
  ]);
  const primary = asColor(primaryVar);
  const mutedForeground = asColor(mutedVar);

  const renderRow = (row: DeviceVoiceRow) => {
    switch (row.kind) {
      case "header":
        return (
          <View key={row.key} className="bg-popover px-6 py-2">
            <ThemedText type="labelSm" color={mutedForeground}>
              {row.title}
            </ThemedText>
          </View>
        );
      case "voice":
        return (
          <VoiceListItem
            key={row.key}
            voice={row.voice}
            isSelected={row.voice.identifier === selected}
            isPreviewing={previewing === row.voice.identifier}
            isPreparing={preparing === row.voice.identifier}
            primary={primary}
            mutedForeground={mutedForeground}
            onSelect={onSelect}
            onPreview={onPreview}
          />
        );
    }
  };

  return <View style={room}>{drawn.map(renderRow)}</View>;
}
