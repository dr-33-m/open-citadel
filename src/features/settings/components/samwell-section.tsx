import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { Cloud, Info, Smartphone, type LucideIcon } from '@/components/icons';

import { SettingsSection } from '@/features/settings/components/settings-section';
import { CloudPanel } from '@/features/settings/components/cloud-panel';
import { OfflineModelCard } from '@/features/settings/components/offline-model-card';
import { EngineInfoSheet, type EngineMode } from '@/components/settings/engine-info-sheet';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { SamwellText } from '@/components/samwell-text';
import { Touchable } from '@/components/ui/touchable';
import { isNativeAvailable } from '@/services/inference';
import { useSettingsStore } from '@/stores/settings';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

/**
 * The Samwell group: which engine answers, and its controls. Each panel
 * owns its own sheets — this component only decides which panel exists.
 */
export const SamwellSection = React.memo(function SamwellSection() {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const samwellMode = useSettingsStore((s) => s.samwellMode);
  const setSamwellMode = useSettingsStore((s) => s.setSamwellMode);
  const [infoSheet, setInfoSheet] = React.useState<EngineMode | null>(null);
  const nativeAvailable = React.useMemo(() => isNativeAvailable(), []);

  return (
    <SettingsSection>
      <View className="gap-1">
        <ThemedText type="labelMd" color={asColor(primary)} className="tracking-[1.2px]">
          {samwellMode === 'cloud' ? 'GRAND MAESTER SAMWELL' : 'SAMWELL'}
        </ThemedText>
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          {samwellMode === 'cloud' ? 'Puts your knowledge to work.' : 'Your reading companion'}
        </ThemedText>
      </View>

      {/* Mode cards */}
      <View className="flex-row gap-3">
        <ModeCard
          active={samwellMode === 'offline'}
          icon={Smartphone}
          label="Offline"
          description="Samwell on your device."
          onSelect={() => setSamwellMode('offline')}
          onInfo={() => setInfoSheet('offline')}
        />
        <ModeCard
          active={samwellMode === 'cloud'}
          icon={Cloud}
          label="Cloud"
          description="Grand Maester Samwell in the cloud."
          onSelect={() => setSamwellMode('cloud')}
          onInfo={() => setInfoSheet('cloud')}
        />
      </View>

      {samwellMode === 'cloud' ? (
        <CloudPanel />
      ) : !nativeAvailable ? (
        <ThemedText type="bodySm" color={asColor(mutedForeground)}>
          On-device AI is not supported on this device. Grand Maester Samwell is on the way. Check
          back soon.
        </ThemedText>
      ) : (
        <OfflineModelCard />
      )}

      <EngineInfoSheet mode={infoSheet} onClose={() => setInfoSheet(null)} />
    </SettingsSection>
  );
});

function ModeCard({
  active,
  icon,
  label,
  description,
  onSelect,
  onInfo,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  description: string;
  onSelect: () => void;
  onInfo: () => void;
}) {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  return (
    <Touchable className="flex-1" onPress={onSelect}>
      {/* `flex-1` on the card, not just on the Touchable around it. The row
          stretches both Touchables to the taller of the two, but the card
          inside still sized to its own text, so the one-line description left
          a card visibly shorter than the two-line one beside it. */}
      <Card className={cn('flex-1 gap-2 p-4', active && 'border-primary')}>
        <View className="flex-row items-center gap-3">
          <PrefixIcon icon={icon} size={36} color={active ? asColor(primary) : undefined} />
          <ThemedText type="bodyMd" color={active ? asColor(primary) : undefined}>
            {label}
          </ThemedText>
        </View>
        {/* His name in gold here as everywhere else. These two lines were
            missed by the first sweep because they arrive as a prop rather than
            as literal text in the JSX. */}
        <SamwellText type="bodySm" color={asColor(mutedForeground)}>
          {description}
        </SamwellText>
        <Touchable className="absolute right-2 top-2" onPress={onInfo} hitSlop={10}>
          <Info size={15} color={asColor(mutedForeground)} />
        </Touchable>
      </Card>
    </Touchable>
  );
}
