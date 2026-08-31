import React from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Swipe } from '@/components/ui/swipe';
import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { useModelStore } from '@/stores/model';
import { useCSSVariable } from 'uniwind';

import { asColor } from '@/utils/colors';
import { formatBytes, formatCount } from '@/utils/format';
import { Search, Trash2 } from 'lucide-react-native';
import type { useModelSheet } from '@/features/settings/hooks/use-model-sheet';

type SheetState = ReturnType<typeof useModelSheet>;

/**
 * The offline model picker, three phases in one scroll surface: the local
 * list, Hugging Face search, and a repo's files. One surface on purpose —
 * a sheet per phase re-registered its scrollable on every transition, which
 * is why the results would not scroll. These lists are short enough that
 * mapping beats virtualizing.
 */
export function ModelPickerSheet({
  sheet,
  mutedForeground,
  primary,
  onDeleteRequest,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
  /** Swipe-delete asks the card's confirm sheet; deletion itself stays there. */
  onDeleteRequest: (id: string) => void;
}) {
  // The colour a chat title is drawn in — see the delete tile below.
  const foreground = useCSSVariable('--color-foreground');
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const modelsHydrated = useModelStore((s) => s.modelsHydrated);
  const setActiveModel = useModelStore((s) => s.setActiveModel);

  return (
    <Sheet visible={sheet.visible} onClose={sheet.close} maxHeightRatio={0.8} scrollable>
      <Sheet.ScrollView keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center justify-between px-6 pb-6">
          {sheet.view === 'hf' ? (
            sheet.repo ? (
              <Touchable
                className="flex-1 flex-row items-center gap-2"
                onPress={sheet.backOutOfRepo}
              >
                <ThemedText type="labelSm" color={primary}>← BACK</ThemedText>
                <ThemedText type="headlineSm" numberOfLines={1} className="flex-1">
                  {sheet.repo.split('/')[1] ?? sheet.repo}
                </ThemedText>
              </Touchable>
            ) : (
              <Touchable className="flex-row items-center gap-2" onPress={sheet.backToList}>
                <ThemedText type="labelSm" color={primary}>← BACK</ThemedText>
                <ThemedText type="headlineSm">Find Models</ThemedText>
              </Touchable>
            )
          ) : (
            <ThemedText type="headlineSm">Choose Model</ThemedText>
          )}
        </View>

        {sheet.view === 'list' ? (
          !modelsHydrated ? (
            <ModelListSkeleton />
          ) : (
            <Swipe.Group>
              {models.map((m) => (
                <Swipe key={m.id}>
                  <Swipe.End>
                    {/* Red tile, app ink on top — see the note on the chat
                        history rows. */}
                    <Swipe.Action
                      icon={<Trash2 color={asColor(foreground)} />}
                      label="Delete"
                      color="destructive"
                      labelClassName="text-foreground"
                      onPress={() => onDeleteRequest(m.id)}
                    />
                  </Swipe.End>
                  <Touchable
                    className="flex-row items-center gap-3 border-b border-border bg-popover px-4 py-3"
                    onPress={() => {
                      setActiveModel(m.id);
                      sheet.close();
                    }}
                  >
                    <View className="flex-1">
                      <ThemedText type="bodyMd">{m.name}</ThemedText>
                      <ThemedText
                        type="labelSm"
                        color={mutedForeground}
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {formatBytes(m.sizeBytes)}
                        {m.isDownloaded ? ' · Downloaded' : ''}
                        {m.id === 'gemma-4-e2b-it' ? ' · Recommended' : ''}
                      </ThemedText>
                    </View>
                    {m.id === activeModelId && (
                      <ThemedText type="bodyMd" color={primary}>✓</ThemedText>
                    )}
                  </Touchable>
                </Swipe>
              ))}
              <Touchable
                className="flex-row items-center gap-2 px-4 py-3"
                onPress={() => sheet.setView('hf')}
              >
                <Search size={14} color={primary} />
                <ThemedText type="labelSm" color={primary}>
                  FIND MODELS ON HUGGING FACE
                </ThemedText>
              </Touchable>
            </Swipe.Group>
          )
        ) : sheet.repo ? (
          <RepoFileList sheet={sheet} mutedForeground={mutedForeground} />
        ) : (
          <SearchPhase sheet={sheet} mutedForeground={mutedForeground} primary={primary} />
        )}
      </Sheet.ScrollView>
    </Sheet>
  );
}

/** Row-shaped skeleton for the one known-duration load. */
function ModelListSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} className="flex-row items-center gap-3 border-b border-border bg-popover px-4 py-3">
          <View className="flex-1 gap-1">
            <Skeleton className="h-4 w-2/3" label={i === 0 ? 'Loading models' : undefined} />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

function RepoFileList({ sheet, mutedForeground }: { sheet: SheetState; mutedForeground?: string }) {
  if (sheet.loadingFiles) {
    return (
      <View className="items-center p-6">
        <Spinner size="sm" />
      </View>
    );
  }
  if (sheet.files.length === 0) {
    return (
      <View className="p-4">
        <ThemedText type="bodySm" color={mutedForeground}>
          No LiteRT-LM files found in this repo.
        </ThemedText>
      </View>
    );
  }
  return (
    <>
      {sheet.files.map((item) => (
        <Touchable
          key={item.rfilename}
          className="flex-row items-center justify-between border-b border-border px-4 py-3"
          onPress={() => sheet.pickFile(item)}
        >
          <ThemedText type="bodyMd" className="flex-1" numberOfLines={2}>
            {item.rfilename}
          </ThemedText>
          <ThemedText type="labelSm" color={mutedForeground} style={{ fontVariant: ['tabular-nums'] }}>
            {formatBytes(item.size)}
          </ThemedText>
        </Touchable>
      ))}
    </>
  );
}

function SearchPhase({
  sheet,
  mutedForeground,
  primary,
}: {
  sheet: SheetState;
  mutedForeground?: string;
  primary?: string;
}) {
  return (
    <>
      <View className="flex-row gap-2 px-4 pb-3">
        {/* Uncontrolled: the buffer is native-owned and the query state is
            only a mirror for the deferred search. Remounts (leaving the
            search view, opening a repo and coming back) re-seed the buffer
            from the mirror, so the two never disagree. */}
        <Input
          className="flex-1"
          placeholder="Search Hugging Face…"
          defaultValue={sheet.query}
          onChangeText={sheet.setQuery}
          onSubmitEditing={sheet.search}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Touchable className="flex-row items-center gap-2 bg-muted px-3 py-2" onPress={sheet.search}>
          <Search size={14} color={primary} />
          <ThemedText type="labelSm" color={primary}>SEARCH</ThemedText>
        </Touchable>
      </View>
      {sheet.searching ? (
        <View className="items-center p-6">
          <Spinner size="sm" />
        </View>
      ) : sheet.results.length === 0 ? (
        <View className="p-4">
          <ThemedText type="bodySm" color={mutedForeground}>
            Search for LiteRT-LM models to get started.
          </ThemedText>
        </View>
      ) : (
        sheet.results.map((item) => (
          <Touchable
            key={item.id}
            className="gap-1 border-b border-border px-4 py-3"
            onPress={() => sheet.openRepo(item.id)}
          >
            <ThemedText type="bodyMd" numberOfLines={1}>{item.id}</ThemedText>
            <ThemedText type="labelSm" color={mutedForeground} style={{ fontVariant: ['tabular-nums'] }}>
              {formatCount(item.downloads)} downloads
            </ThemedText>
          </Touchable>
        ))
      )}
    </>
  );
}
