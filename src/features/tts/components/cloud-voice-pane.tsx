import React from 'react';
import { View } from 'react-native';

import { InfoSheet } from '@/components/info-sheet';
import { SwitchPanes } from '@/components/switch-panes';
import { TextSwitch } from '@/components/text-switch';
import { ThemedText } from '@/components/themed-text';
import { CloudBoxPane } from '@/features/tts/components/cloud-box-pane';
import { CloudFigures } from '@/features/tts/components/cloud-figures';
import type { BoxContent, VersionInfo, VoiceBox } from '@/features/tts/utils/cloud-voice-cards';
import type { CloudSelection } from '@/features/tts/utils/cloud-voices';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

export interface CloudVoicePaneProps {
  selection: CloudSelection | null;
  /** Every voice box, the ones out of reach locked. */
  boxes: VoiceBox[];
  /** What each open box's pane shows. */
  contents: BoxContent[];
  /** What the "i" of each version the plan reaches opens, by model id. */
  info: Record<string, VersionInfo>;
  /** Whose plan a version's figures are on. The reader's own unless a plan is being sampled. */
  figuresLabel?: string;
  /** "GRAND MAESTER SAMPLES", beside the label, while a plan is heard before it is bought. */
  sampleLabel?: string | null;
  /** Build the boxes not showing while they are hidden. See `KeptAlive`. */
  warm?: boolean;
  onMaker: (maker: string) => void;
  onModel: (modelId: string) => void;
  onVoice: (voice: string) => void;
}

/**
 * Everything that belongs to the cloud voices, built as the on-device panes
 * are: the voice boxes on one switch (as Lite and Enhanced are), and under it
 * each box's own pane (`CloudBoxPane`), trading places when the switch moves
 * with the same short cross-fade (`SwitchPanes`). Panes drawn once are kept,
 * so going back to a box is a reveal.
 *
 * What a version costs is one tap deeper, behind the circled "i" on its
 * chip (or on its box's tab, for a box with one version): hours a month and
 * Neurons a chapter, on the reader's plan.
 */
export function CloudVoicePane({ selection, boxes, contents, info, figuresLabel, sampleLabel = null, warm = false, onMaker, onModel, onVoice }: CloudVoicePaneProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];
  // Which version's sheet, kept while it slides away so its words do not vanish.
  const [sheet, setSheet] = React.useState<{ id: string; open: boolean } | null>(null);
  const openInfo = React.useCallback((id: string) => setSheet({ id, open: true }), []);
  const closeInfo = React.useCallback(() => setSheet((shown) => (shown ? { ...shown, open: false } : shown)), []);
  if (!selection) return null;

  const chosen = selection.model.maker;
  // A box with one version has no chip to carry its "i", so its tab does.
  const singleModel = new Map(contents.filter((content) => content.versions.length === 0).map((content) => [content.maker, content.model.id]));
  const tabs = boxes.map((box) => {
    const modelId = box.locked ? undefined : singleModel.get(box.maker);
    return {
      value: box.maker,
      label: box.label,
      locked: box.locked !== null,
      accessibilityLabel: box.locked ? `${box.maker}, with ${box.locked}` : `${box.maker} voices`,
      onInfo: modelId ? () => openInfo(modelId) : undefined,
    };
  });
  const panes: Record<string, React.ReactNode> = {};
  for (const content of contents) {
    panes[content.maker] = (
      <CloudBoxPane active={content.maker === chosen} content={content} onModel={onModel} onVoice={onVoice} onInfo={openInfo} />
    );
  }
  const shown = sheet ? (info[sheet.id] ?? null) : null;

  return (
    // The switch and what it shows are one group, as under Lite and Enhanced.
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <ThemedText type="labelSm" color={muted}>
          VOICE BOX
        </ThemedText>
        {sampleLabel ? (
          <ThemedText type="labelSm" color={tokens['--color-primary']} numberOfLines={1}>
            {sampleLabel}
          </ThemedText>
        ) : null}
      </View>
      <TextSwitch options={tabs} value={chosen} onChange={onMaker} />
      <SwitchPanes order={tabs.map((tab) => tab.value)} value={chosen} warm={warm} panes={panes} />
      {/* `nested`: in the reader this opens from inside the voice sheet. */}
      <InfoSheet visible={sheet?.open ?? false} onClose={closeInfo} info={shown} nested>
        {shown ? <CloudFigures figures={shown.figures} label={figuresLabel} /> : null}
      </InfoSheet>
    </View>
  );
}
