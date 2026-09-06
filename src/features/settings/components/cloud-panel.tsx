import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { List, SlidersHorizontal } from '@/components/icons';
import { ActionButton } from '@/components/action-button';
import { Touchable } from '@/components/ui/touchable';
import { Progress } from '@/components/ui/progress';
import { CloudTuneSheet } from '@/features/settings/components/cloud-tune-sheet';
import { useSignedIn } from '@/stores/account';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';

/**
 * The cloud engine's panel: setup state, the chosen model, and usage. Owns
 * the cloud model picker.
 */
export function CloudPanel() {
  const [mutedForeground, primary] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary',
  ]);
  const cloudBaseUrl = useSettingsStore((s) => s.cloudBaseUrl);
  const cloudModelId = useSettingsStore((s) => s.cloudModelId);
  const cloudModels = useSettingsStore((s) => s.cloudModels);
  const cloudUsage = useSettingsStore((s) => s.cloudUsage);
  const cloudUsageError = useSettingsStore((s) => s.cloudUsageError);
  const setCloudModelId = useSettingsStore((s) => s.setCloudModelId);
  const loadCloudUsage = useSettingsStore((s) => s.loadCloudUsage);
  const loadCloudModels = useSettingsStore((s) => s.loadCloudModels);
  // Just the boolean. The panel does not draw the email, and subscribing to
  // the account itself would redraw it whenever a name or an error moved.
  const signedIn = useSignedIn();
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [tuneVisible, setTuneVisible] = React.useState(false);
  const activeModel = cloudModels.find((m) => m.id === cloudModelId);

  /*
   * Ask the server what it offers now.
   *
   * `cloudModels` starts as `CLOUD_MODEL_CATALOG`, a constant compiled into
   * the app, so without this the picker shows whatever was true on the day the
   * build was made. Models can be added, retired and re-defaulted on the
   * server without a deploy, and none of that reached a device: the loader was
   * written and never called.
   *
   * Fire and forget, and the list is only replaced on success, so a server
   * that cannot be reached leaves the picker on the built-in catalogue rather
   * than on nothing.
   */
  React.useEffect(() => {
    void loadCloudModels();
  }, [loadCloudModels]);

  return (
    <>
      <Card className="gap-3 p-4">
        {!cloudBaseUrl && (
          <ThemedText type="bodySm" color="#f97316" style={{ fontSize: 11 }}>
            Grand Maester Samwell is not set up in this build yet.
          </ThemedText>
        )}

        {/* The model and the usage below are both real and both unreachable
            without an account, so this says so once at the top rather than
            leaving two halves of the card to fail separately. The way out is
            the Profile section at the top of this same screen, which is why
            there is no button here pointing anywhere. */}
        {cloudBaseUrl && !signedIn && (
          <ThemedText type="bodySm" color="#f97316" style={{ fontSize: 11 }}>
            He works from your account. Sign in under Profile to reach him.
          </ThemedText>
        )}

        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>MODEL</ThemedText>
            <ThemedText type="bodyMd" numberOfLines={2}>
              {activeModel?.label ?? 'Choose a model'}
            </ThemedText>
          </View>
          <View className="flex-row gap-2">
            {/* Prefix icons, matching the offline card. These two were the
                only model buttons in the app without them, which made the two
                panels read as different features rather than two halves of
                one choice. */}
            <ActionButton
              icon={SlidersHorizontal}
              label="TUNE"
              tint={asColor(mutedForeground)}
              onPress={() => setTuneVisible(true)}
            />
            <ActionButton
              icon={List}
              label="CHANGE"
              tint={asColor(mutedForeground)}
              onPress={() => setPickerVisible(true)}
              accessibilityLabel="Change the model"
            />
          </View>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>USAGE</ThemedText>
            <Touchable onPress={loadCloudUsage} disabled={!signedIn}>
              <ThemedText
                type="labelSm"
                color={asColor(signedIn ? primary : mutedForeground)}
              >
                REFRESH
              </ThemedText>
            </Touchable>
          </View>
          {cloudUsage ? (
            <>
              <UsageBar label="5 HOURS" used={cloudUsage.fiveHour.used} cap={cloudUsage.fiveHour.cap} />
              <UsageBar label="WEEKLY" used={cloudUsage.weekly.used} cap={cloudUsage.weekly.cap} />
              {cloudUsage.fiveHour.resetsAt && cloudUsage.fiveHour.remaining === 0 && (
                <ThemedText type="bodySm" color="#f97316" style={{ fontSize: 11 }}>
                  5h window resets {new Date(cloudUsage.fiveHour.resetsAt).toLocaleTimeString()}
                </ThemedText>
              )}
            </>
          ) : (
            <ThemedText type="bodySm" color={asColor(mutedForeground)}>
              {!signedIn
                ? 'Usage is counted against your account.'
                : (cloudUsageError ?? 'Usage appears after the first successful server check.')}
            </ThemedText>
          )}
        </View>
      </Card>

      <CloudModelSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(id) => {
          setCloudModelId(id);
          setPickerVisible(false);
        }}
        activeId={cloudModelId}
        models={cloudModels}
        mutedForeground={asColor(mutedForeground)}
        primary={asColor(primary)}
      />

      <CloudTuneSheet visible={tuneVisible} onClose={() => setTuneVisible(false)} />
    </>
  );
}

function UsageBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const [mutedForeground] = useCSSVariable(['--color-muted-foreground']);
  const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
  return (
    <View className="gap-1">
      <ThemedText type="labelSm" color={asColor(mutedForeground)}>{label}</ThemedText>
      <Progress value={cap > 0 ? used / cap : 0} minValue={0} maxValue={1} size="sm" />
      <ThemedText
        type="bodySm"
        color={asColor(mutedForeground)}
        style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}
      >
        {pct}% used
      </ThemedText>
    </View>
  );
}

type CloudModel = { id: string; label: string; provider: string; capabilities: string[] };

/**
 * One model row, memoized on primitives: a selection change re-renders the
 * two affected rows, not every model in the list.
 */
const ModelRow = React.memo(function ModelRow({
  model,
  isActive,
  mutedForeground,
  primary,
  onSelect,
}: {
  model: CloudModel;
  isActive: boolean;
  mutedForeground?: string;
  primary?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Touchable
      className="flex-row items-center gap-3 border-b border-border px-4 py-3"
      onPress={() => onSelect(model.id)}
    >
      <View className="flex-1">
        <ThemedText type="bodyMd">{model.label}</ThemedText>
        <ThemedText type="labelSm" color={mutedForeground}>
          {model.provider} · {model.capabilities.join(', ')}
        </ThemedText>
      </View>
      {isActive && <ThemedText type="bodyMd" color={primary}>✓</ThemedText>}
    </Touchable>
  );
});

function CloudModelSheet({
  visible,
  onClose,
  onSelect,
  activeId,
  models,
  mutedForeground,
  primary,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  activeId: string | null;
  models: CloudModel[];
  mutedForeground?: string;
  primary?: string;
}) {
  /*
   * `onSelect` arrives as an inline arrow from the call site, so it cannot
   * key the memoized rows directly. It rides in through a ref instead —
   * taps land after commit, so the effect-synced ref never misses.
   */
  const onSelectRef = React.useRef(onSelect);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const handleSelect = React.useCallback((id: string) => {
    onSelectRef.current(id);
  }, []);

  const renderItem = React.useCallback(
    ({ item: m }: { item: CloudModel }) => (
      <ModelRow
        model={m}
        isActive={m.id === activeId}
        mutedForeground={mutedForeground}
        primary={primary}
        onSelect={handleSelect}
      />
    ),
    [activeId, mutedForeground, primary, handleSelect],
  );

  return (
    // `maxHeightRatio` is the cap and the only cap — the sheet measures the
    // list and stops there, so it needs no `maxHeight` of its own.
    <Sheet visible={visible} onClose={onClose} maxHeightRatio={0.8} scrollable>
      <Sheet.FlatList
        data={models}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between px-6 pb-6">
            <ThemedText type="headlineSm">Choose Model</ThemedText>
          </View>
        }
        renderItem={renderItem}
      />
    </Sheet>
  );
}
