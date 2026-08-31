import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { ChevronUp, Moon, Sun, type LucideIcon } from 'lucide-react-native';

import { SettingsSection } from '@/features/settings/components/settings-section';
import { useCompassTimes } from '@/features/settings/hooks/use-compass-times';
import { GoldButton } from '@/components/ui/gold-button';
import { PrefixIcon } from '@/components/ui/prefix-icon';
import { Sheet } from '@/components/ui/sheet';
import { ThemedText } from '@/components/themed-text';
import { TimePicker } from '@/components/ui/time-picker';
import { Touchable } from '@/components/ui/touchable';
import { elevation } from '@/constants/theme';
import { asColor } from '@/utils/colors';
import { padTwo } from '@/lib/time';

type Kind = 'morning' | 'night';

/**
 * The two daily check-in times. The wheel edits a draft; SET TIME commits
 * once (see the hook), so the reminder resync runs per pick, not per tick.
 * Cloud-only: check-ins run through Grand Maester Samwell on the server.
 */
export function CompassSection() {
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);
  const { morningTime, nightTime, picking, draft, setDraft, openPicker, closePicker, commit } =
    useCompassTimes();

  return (
    <SettingsSection index={4} label="COMPASS">
      <ThemedText type="bodySm" color={asColor(mutedForeground)}>
        Your morning and night check-in times with Grand Maester Samwell.
      </ThemedText>
      <TimeRow
        icon={Sun}
        label="Morning check-in"
        value={morningTime}
        onPress={() => openPicker('morning')}
        muted={asColor(mutedForeground)}
      />
      <TimeRow
        icon={Moon}
        label="Night check-in"
        value={nightTime}
        onPress={() => openPicker('night')}
        muted={asColor(mutedForeground)}
      />

      {/* `contentPanning={false}`: the wheel below is a plain scroller, and
          the sheet's own content drag is an ancestor gesture that would take
          every vertical swipe off it — the wheel would render and never turn.
          The grabber still drags the sheet. */}
      <Sheet visible={picking !== null} onClose={closePicker} contentPanning={false}>
        <View className="gap-6 px-6">
          <ThemedText type="labelSm" color={asColor(primary)}>
            {picking === 'night' ? 'NIGHT CHECK-IN' : 'MORNING CHECK-IN'}
          </ThemedText>
          <TimePicker
            presentation="inline"
            layout="wheel"
            hourCycle={24}
            minuteStep={15}
            value={draft}
            onValueChange={setDraft}
            className="self-center"
          />
          <GoldButton
            label="SET TIME"
            onPress={() => {
              if (!picking) return;
              void commit(picking, `${padTwo(draft.hour)}:${padTwo(draft.minute)}`);
              closePicker();
            }}
          />
        </View>
      </Sheet>
    </SettingsSection>
  );
}

function TimeRow({
  icon,
  label,
  value,
  onPress,
  muted,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onPress: () => void;
  muted?: string;
}) {
  return (
    <Touchable
      className="flex-row items-center justify-between bg-card p-4"
      style={elevation.soft}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        <PrefixIcon icon={icon} size={36} />
        <ThemedText type="bodyMd">{label}</ThemedText>
      </View>
      <View className="flex-row items-center gap-1">
        <ThemedText type="bodySm" color={muted}>
          {value}
        </ThemedText>
        <ChevronUp size={14} color={muted} />
      </View>
    </Touchable>
  );
}
