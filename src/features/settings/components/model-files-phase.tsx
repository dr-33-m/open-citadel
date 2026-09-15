import React from 'react';
import type { TextStyle } from 'react-native';
import { View } from 'react-native';

import { PageFade } from '@/components/scroll-fades';
import { ModelListSkeleton } from '@/components/skeletons/model-list-skeleton';
import { ThemedText } from '@/components/themed-text';
import { Item } from '@/components/ui/item';
import { Sheet } from '@/components/ui/sheet';
import { ModelPickerHeader } from '@/features/settings/components/model-picker-header';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';
import type { HFFile } from '@/services/huggingface';
import { formatBytes } from '@/utils/format';

type SheetState = ReturnType<typeof useModelSheet>;

const FILL = { flex: 1 } as const;
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

function RowSeparator() {
  return <Item.Separator />;
}

const FileRow = React.memo(function FileRow({
  file,
  mutedForeground,
  onPick,
}: {
  file: HFFile;
  mutedForeground?: string;
  onPick: (file: HFFile) => void;
}) {
  return (
    <Item className="px-6 py-3" onPress={() => onPick(file)}>
      <Item.Content>
        <Item.Title numberOfLines={2}>{file.rfilename}</Item.Title>
      </Item.Content>
      <Item.Actions>
        <ThemedText type="labelSm" color={mutedForeground} style={TABULAR}>
          {formatBytes(file.size)}
        </ThemedText>
      </Item.Actions>
    </Item>
  );
});

/** The versions of one catalogue brain that fit this phone. */
export function ModelFilesPhase({
  sheet,
  mutedForeground,
  primary,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
}) {
  const { files, filteredOutFiles, loadingFiles, pickFile } = sheet;
  const title = sheet.repo?.split('/')[1] ?? sheet.repo ?? '';

  const renderItem = React.useCallback(
    ({ item }: { item: HFFile }) => (
      <FileRow file={item} mutedForeground={mutedForeground} onPick={pickFile} />
    ),
    [mutedForeground, pickFile],
  );

  let body: React.ReactNode;
  if (loadingFiles) {
    body = <ModelListSkeleton count={3} label="Loading versions" />;
  } else if (files.length === 0) {
    body = (
      <View className="px-6 py-4">
        <ThemedText type="bodySm" color={mutedForeground}>
          {filteredOutFiles > 0
            ? 'Every version of this brain is too large for your phone. Try a smaller one.'
            : 'No brains found here.'}
        </ThemedText>
      </View>
    );
  } else {
    body = (
      <PageFade edges="both" surface="popover">
        <Sheet.FlatList
          style={FILL}
          data={files}
          keyExtractor={(item: HFFile) => item.rfilename}
          ItemSeparatorComponent={RowSeparator}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      </PageFade>
    );
  }

  return (
    <>
      <ModelPickerHeader title={title} onBack={sheet.backOutOfRepo} primary={primary} />
      <Sheet.Deferred skeleton={<ModelListSkeleton count={3} label="Loading versions" />}>
        {body}
      </Sheet.Deferred>
    </>
  );
}
