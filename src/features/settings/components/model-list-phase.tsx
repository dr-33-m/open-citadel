import type { TextStyle } from 'react-native';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Trash2 } from '@/components/icons';
import { PageFade } from '@/components/scroll-fades';
import { ModelListSkeleton } from '@/components/skeletons/model-list-skeleton';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Swipe } from '@/components/ui/swipe';
import { Touchable } from '@/components/ui/touchable';
import { ModelPickerHeader } from '@/features/settings/components/model-picker-header';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';
import type { LocalModel } from '@/stores/model';
import { asColor } from '@/utils/colors';
import { formatBytes } from '@/utils/format';

type SheetState = ReturnType<typeof useModelSheet>;

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

function modelDetail(model: LocalModel): string {
  return [
    formatBytes(model.sizeBytes),
    model.isDownloaded ? 'Downloaded' : null,
    model.recommended ? 'Recommended' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Every brain Samwell offers that this phone could run. */
export function ModelListPhase({
  sheet,
  mutedForeground,
  primary,
  onDelete,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
  /** A full swipe or the tile deletes the download at once: the swipe's reach point is the confirmation. */
  onDelete: (id: string) => void;
}) {
  const foreground = useCSSVariable('--color-foreground');

  /*
   * The title rides inside the scroll content, the way `cloud-model-sheet` does
   * it: this sheet measures its content to set its height, and a header beside
   * the scroll region would sit outside that measurement. For the same reason
   * there is no `Sheet.Deferred` here; its placeholder would set the height and
   * the real list would then jump it.
   */
  return (
    <PageFade edges="both" surface="popover">
      <Sheet.ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ModelPickerHeader title="Choose Brain" />
        {sheet.modelsHydrated ? (
          <Swipe.Group>
            {sheet.models.map((model) => (
              // Only a download can be deleted. The brain itself stays listed,
              // ready to download again, so the row does not leave.
              <Swipe key={model.id} haptics disabled={!model.isDownloaded}>
                <Swipe.End>
                  <Swipe.Action
                    icon={<Trash2 color={asColor(foreground)} />}
                    label="Delete"
                    color="destructive"
                    labelClassName="text-foreground"
                    onPress={() => onDelete(model.id)}
                  />
                </Swipe.End>
                <Touchable
                  className="flex-row items-center gap-3 border-b border-border bg-popover px-6 py-3"
                  onPress={() => sheet.chooseModel(model.id)}
                >
                  <View className="flex-1 gap-1">
                    <ThemedText type="bodyMd">{model.name}</ThemedText>
                    <ThemedText type="labelSm" color={mutedForeground} style={TABULAR}>
                      {modelDetail(model)}
                    </ThemedText>
                  </View>
                  {model.id === sheet.activeModelId && (
                    <ThemedText type="bodyMd" color={primary}>
                      ✓
                    </ThemedText>
                  )}
                </Touchable>
              </Swipe>
            ))}
          </Swipe.Group>
        ) : (
          <ModelListSkeleton count={3} />
        )}
      </Sheet.ScrollView>
    </PageFade>
  );
}
