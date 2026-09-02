import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { Download, MemoryStick, Power, SlidersHorizontal, Trash2 } from 'lucide-react-native';

import { useModelSheet } from '@/features/settings/hooks/use-model-sheet';
import { ModelPickerSheet } from '@/features/settings/components/model-picker-sheet';
import { TuneSheet } from '@/features/settings/components/tune-sheet';
import { ConfirmDeleteSheet } from '@/features/settings/components/confirm-delete-sheet';
import { MemoryInfoSheet } from '@/features/settings/components/memory-info-sheet';
import { ThemedText } from '@/components/themed-text';
import { usePulse } from '@/hooks/use-pulse';
import { Card } from '@/components/ui/card';
import { Touchable } from '@/components/ui/touchable';
import { useModelStore } from '@/stores/model';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/utils/format';

/**
 * The offline engine's active-model card: identity, download progress,
 * memory posture, and the four actions. Owns every sheet it opens.
 */
export function OfflineModelCard() {
  const [primary, mutedForeground, foreground, destructive] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
    '--color-foreground',
    '--color-destructive',
  ]);
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const isLoaded = useModelStore((s) => s.isLoaded);
  const modelLoading = useModelStore((s) => s.isLoading);
  const loadError = useModelStore((s) => s.loadError);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const cancelDownload = useModelStore((s) => s.cancelDownload);
  const downloadModel = useModelStore((s) => s.downloadModel);
  const releaseContext = useModelStore((s) => s.releaseContext);
  const memoryEstimate = useModelStore((s) => s.memoryEstimate);
  const checkMemory = useModelStore((s) => s.checkMemory);
  const inference = useModelStore((s) => s.inference);
  const activeModel = models.find((m) => m.id === activeModelId);

  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [tuneVisible, setTuneVisible] = React.useState(false);
  const [memoryVisible, setMemoryVisible] = React.useState(false);
  const modelSheet = useModelSheet();

  // The power action's heartbeat: pulses only while the engine is loading.
  const powerPulseStyle = usePulse(modelLoading);

  // Run when the active model or context size changes — after the sheet is
  // up, never in the same pass as its first paint.
  React.useEffect(() => {
    if (activeModel?.isDownloaded && activeModel.id) checkMemory(activeModel.id);
  }, [activeModel?.id, activeModel?.isDownloaded, inference.contextSize, checkMemory]);

  const memoryStatus = memoryEstimate?.status ?? 'fits';
  const downloading = activeModel ? downloadProgress[activeModel.id] !== undefined : false;
  const busy = modelLoading || isDeleting;
  if (!activeModel) return null;

  return (
    <>
      <Card className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>MODEL</ThemedText>
            <ThemedText type="bodyMd" numberOfLines={2}>{activeModel.name}</ThemedText>
            <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontVariant: ['tabular-nums'] }}>
              {activeModel.isDownloaded
                ? `${formatBytes(activeModel.sizeBytes)} · Downloaded`
                : `${formatBytes(activeModel.sizeBytes)} · Not downloaded`}
            </ThemedText>
            {loadError && (
              <ThemedText type="labelSm" color={asColor(destructive)} numberOfLines={2}>
                {loadError}
              </ThemedText>
            )}
          </View>
          <Touchable
            className="flex-row items-center gap-2 bg-muted px-3 py-2"
            onPress={modelSheet.open}
          >
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>CHANGE</ThemedText>
          </Touchable>
        </View>

        {downloadProgress[activeModel.id] !== undefined && (
          <View className="gap-1">
            <View className="h-1 overflow-hidden rounded-[2px] bg-surface-tertiary">
              <View
                className="h-1 rounded-[2px] bg-primary"
                style={{ width: `${Math.round((downloadProgress[activeModel.id] ?? 0) * 100)}%` }}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <ThemedText type="labelSm" color={asColor(mutedForeground)} style={{ fontVariant: ['tabular-nums'] }}>
                {Math.round((downloadProgress[activeModel.id] ?? 0) * 100)}%
              </ThemedText>
              <Touchable onPress={() => cancelDownload(activeModel.id)}>
                <ThemedText type="labelSm" color={asColor(destructive)}>CANCEL</ThemedText>
              </Touchable>
            </View>
          </View>
        )}

        {activeModel.isDownloaded && memoryStatus !== 'fits' && (
          <Touchable
            className="flex-row items-center gap-2 bg-muted px-3 py-2 self-start"
            style={{ backgroundColor: memoryStatus === 'wont_fit' ? '#e5393520' : '#f9731620' }}
            onPress={() => setMemoryVisible(true)}
          >
            <MemoryStick size={14} color={memoryStatus === 'wont_fit' ? asColor(destructive) : '#f97316'} />
            <ThemedText type="labelSm" color={memoryStatus === 'wont_fit' ? asColor(destructive) : '#f97316'}>
              {memoryStatus === 'wont_fit' ? 'TOO LARGE' : 'TIGHT'}
            </ThemedText>
          </Touchable>
        )}

        {!downloading && (
          <View className="flex-row flex-wrap gap-2">
            {!activeModel.isDownloaded && (
              <Touchable
                className={cn('flex-row items-center gap-2 bg-muted px-3 py-2', isDownloading && 'opacity-50')}
                disabled={isDownloading}
                onPress={async () => {
                  setIsDownloading(true);
                  try { await downloadModel(activeModel.id); } finally { setIsDownloading(false); }
                }}
              >
                <Download size={14} color={asColor(primary)} />
                <ThemedText type="labelSm" color={asColor(primary)}>DOWNLOAD</ThemedText>
              </Touchable>
            )}
            {activeModel.isDownloaded && (
              <>
                <Touchable
                  className={cn('flex-row items-center gap-2 bg-muted px-3 py-2', busy && 'opacity-50')}
                  onPress={isLoaded ? releaseContext : () => useModelStore.getState().initContext()}
                  disabled={busy}
                >
                  <Animated.View style={powerPulseStyle}>
                    <Power size={14} color={modelLoading ? asColor(primary) : isLoaded ? '#4caf50' : asColor(mutedForeground)} />
                  </Animated.View>
                  <ThemedText type="labelSm" color={isLoaded ? undefined : asColor(mutedForeground)}>
                    {isLoaded ? 'SLEEP' : 'WAKEN'}
                  </ThemedText>
                </Touchable>
                <Touchable
                  className={cn('flex-row items-center gap-2 bg-muted px-3 py-2', busy && 'opacity-50')}
                  disabled={busy}
                  onPress={() => setTuneVisible(true)}
                >
                  <SlidersHorizontal size={14} color={asColor(foreground)} />
                  <ThemedText type="labelSm">TUNE</ThemedText>
                </Touchable>
              </>
            )}
            <Touchable
              className={cn('flex-row items-center gap-2 bg-muted px-3 py-2', busy && 'opacity-50')}
              disabled={busy}
              onPress={async () => {
                if (isLoaded) {
                  setIsDeleting(true);
                  try { await releaseContext(); } finally { setIsDeleting(false); }
                }
                setConfirmDeleteId(activeModel.id);
              }}
            >
              <Trash2 size={14} color={asColor(destructive)} />
              <ThemedText type="labelSm" color={asColor(destructive)}>DELETE</ThemedText>
            </Touchable>
          </View>
        )}
      </Card>

      <ModelPickerSheet
        sheet={modelSheet}
        mutedForeground={asColor(mutedForeground)}
        primary={asColor(primary)}
        onDeleteRequest={setConfirmDeleteId}
      />
      <TuneSheet visible={tuneVisible} onClose={() => setTuneVisible(false)} activeModel={activeModel} />
      <ConfirmDeleteSheet modelId={confirmDeleteId} onClose={() => setConfirmDeleteId(null)} />
      <MemoryInfoSheet
        visible={memoryVisible}
        onClose={() => setMemoryVisible(false)}
        status={memoryStatus}
        estimate={memoryEstimate}
      />
    </>
  );
}
