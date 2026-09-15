import type { TextStyle } from 'react-native';
import { View } from 'react-native';
import Animated, { Easing, LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import { Search, Trash2 } from '@/components/icons';
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

/**
 * The rows below a removed brain move up into its place rather than jumping.
 * Built once at module scope: a builder made in render is rebuilt every render.
 * On-screen movement, so ease-in-out, and under 300ms.
 */
const ROW_CLOSE = LinearTransition.duration(220).easing(Easing.bezier(0.77, 0, 0.175, 1));

/** The one brain the app vouches for, marked so the reader can find it again. */
const RECOMMENDED_MODEL_ID = 'gemma-4-e2b-it';

function modelDetail(model: LocalModel): string {
  return [
    formatBytes(model.sizeBytes),
    model.isDownloaded ? 'Downloaded' : null,
    model.id === RECOMMENDED_MODEL_ID ? 'Recommended' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The brains already on this phone, with a way into the catalogue. */
export function ModelListPhase({
  sheet,
  mutedForeground,
  primary,
  onDelete,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
  /** A full swipe or the tile deletes at once: the swipe's reach point is the confirmation. */
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
        <ModelPickerHeader title="Choose Brain" primary={primary} />
        {sheet.modelsHydrated ? (
          <Swipe.Group>
            {sheet.models.map((model) => (
              <Animated.View key={model.id} layout={ROW_CLOSE}>
              <Swipe haptics removeOnCommit>
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
              </Animated.View>
            ))}
          </Swipe.Group>
        ) : (
          <ModelListSkeleton count={3} />
        )}
        <Touchable className="flex-row items-center gap-2 px-6 py-4" onPress={sheet.browse}>
          <Search size={14} color={primary} />
          <ThemedText type="labelSm" color={primary}>
            BROWSE BRAINS
          </ThemedText>
        </Touchable>
      </Sheet.ScrollView>
    </PageFade>
  );
}
