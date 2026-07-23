import { useFocusEffect, useRouter } from 'expo-router';
import { Compass as CompassIcon } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckinSummaryRow } from '@/components/compass/checkin-summary-row';
import { PitWallCard } from '@/components/compass/pit-wall-card';
import { TelemetryRow } from '@/components/compass/telemetry-row';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Touchable } from '@/components/ui/touchable';
import { BottomTabInset, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { computeProgress } from '@/services/compass-math';
import { useCompassStore } from '@/stores/compass';
import { useSettingsStore } from '@/stores/settings';

import type { CompassCheckinRow } from '@/stores/compass';

function latestPitWall(
  todayNight: CompassCheckinRow | null,
  todayMorning: CompassCheckinRow | null,
  recent: CompassCheckinRow[],
): string | null {
  return (
    todayNight?.pitWallMessage ?? todayMorning?.pitWallMessage ?? recent[0]?.pitWallMessage ?? null
  );
}

export default function CompassTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { samwellMode, cloudBaseUrl, compassNightTime } = useSettingsStore();
  const {
    goal,
    milestone,
    lastCompletedMilestone,
    todayMorning,
    todayNight,
    recentCheckins,
    telemetry,
    isLoaded,
    error,
    loadCompass,
    completeMilestone,
    clearError,
  } = useCompassStore();

  const cloudReady = samwellMode === 'cloud' && cloudBaseUrl.length > 0;

  useFocusEffect(
    useCallback(() => {
      if (cloudReady) loadCompass();
    }, [cloudReady, loadCompass]),
  );

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface.base },
        headerWrap: { paddingTop: insets.top },
        scrollContent: {
          paddingBottom: BottomTabInset + spacing[8],
          gap: spacing[6],
        },
        block: { paddingHorizontal: spacing[6], gap: spacing[3] },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing[8],
          gap: spacing[3],
        },
        dimIcon: { opacity: 0.3 },
        centerText: { textAlign: 'center' },
        borderedLink: {
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[2],
          borderWidth: 1,
          borderColor: colors.primary.default,
        },
        secondaryButton: {
          borderWidth: 1,
          borderColor: colors.outline.variant,
          paddingVertical: spacing[4],
          alignItems: 'center',
        },
        loggedRow: {
          paddingVertical: spacing[3],
          alignItems: 'center',
          backgroundColor: colors.surface.low,
        },
        completionBanner: {
          backgroundColor: colors.surface.low,
          padding: spacing[4],
          gap: spacing[3],
        },
        errorBanner: {
          marginHorizontal: spacing[6],
          padding: spacing[3],
          borderWidth: 1,
          borderColor: '#e53935',
          gap: spacing[2],
        },
      }),
    [colors, insets.top],
  );

  if (!cloudReady) {
    const notConfigured = cloudBaseUrl.length === 0;
    return (
      <View style={styles.container}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="COMPASS" />
        </View>
        <View style={styles.centered}>
          <CompassIcon size={48} color={colors.text.secondary} style={styles.dimIcon} />
          <ThemedText type="headlineSm" color={colors.text.secondary}>
            Compass
          </ThemedText>
          <ThemedText type="bodySm" color={colors.text.secondary} style={styles.centerText}>
            {notConfigured
              ? 'AI execution telemetry for one goal. Samwell Cloud is not configured for this build yet.'
              : 'AI execution telemetry for one goal. You report the day; the pit wall keeps you on pace. Requires Samwell Cloud.'}
          </ThemedText>
          {!notConfigured && (
            <Touchable style={styles.borderedLink} onPress={() => router.push('/settings')}>
              <ThemedText type="labelMd" color={colors.primary.default}>
                OPEN SETTINGS
              </ThemedText>
            </Touchable>
          )}
        </View>
      </View>
    );
  }

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="COMPASS" />
        </View>
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={styles.container}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="COMPASS" />
        </View>
        <View style={styles.centered}>
          <CompassIcon size={48} color={colors.text.secondary} style={styles.dimIcon} />
          <ThemedText type="headlineSm" color={colors.text.secondary}>
            One goal. Honest telemetry.
          </ThemedText>
          <ThemedText type="bodySm" color={colors.text.secondary} style={styles.centerText}>
            Describe what you want to achieve. The pit wall structures it, tracks your pace
            against the target you commit to, and tells you what matters each day.
          </ThemedText>
          <GoldButton label="SET A GOAL" onPress={() => router.push('/compass/setup')} />
        </View>
      </View>
    );
  }

  const morningDone = Boolean(todayMorning);
  const nightDone = Boolean(todayNight);
  const [nightHour, nightMinute] = compassNightTime.split(':').map(Number);
  const now = new Date();
  const afterNightTime = now.getHours() * 60 + now.getMinutes() >= nightHour * 60 + nightMinute;
  const suggested: 'morning' | 'night' = !morningDone && !afterNightTime ? 'morning' : 'night';

  const openCheckin = (kind: 'morning' | 'night') =>
    router.push({ pathname: '/compass/checkin', params: { kind } });

  const pitWall = latestPitWall(todayNight, todayMorning, recentCheckins);
  const milestoneComplete =
    milestone != null && milestone.completedEffortUnits >= milestone.estimatedEffortUnits;

  return (
    <View style={styles.container}>
      <View style={styles.headerWrap}>
        <ScreenHeader title="COMPASS" />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {error != null && (
          <View style={styles.errorBanner}>
            <ThemedText type="bodySm" color={colors.text.primary}>
              {error}
            </ThemedText>
            <Touchable onPress={clearError}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                DISMISS
              </ThemedText>
            </Touchable>
          </View>
        )}

        <SectionHeader label="GOAL" title={goal.title} />

        {milestone ? (
          <>
            <View style={styles.block}>
              <ThemedText type="labelSm" color={colors.text.secondary}>
                MILESTONE
              </ThemedText>
              <ThemedText type="headlineSm">{milestone.title}</ThemedText>
              <ProgressBar
                progress={computeProgress(
                  milestone.completedEffortUnits,
                  milestone.estimatedEffortUnits,
                )}
              />
              <ThemedText type="labelSm" color={colors.text.secondary}>
                {Math.round(milestone.completedEffortUnits * 10) / 10} /{' '}
                {milestone.estimatedEffortUnits} UNITS
              </ThemedText>
              {telemetry && (
                <TelemetryRow
                  targetDate={telemetry.targetDate}
                  projectedDate={telemetry.currentProjectedDate}
                  status={telemetry.scheduleStatus}
                  varianceDays={telemetry.varianceDays}
                />
              )}
            </View>

            {milestoneComplete && (
              <View style={styles.block}>
                <View style={styles.completionBanner}>
                  <ThemedText type="bodySm">
                    The estimate is met. Confirm the milestone is genuinely done, then log it.
                  </ThemedText>
                  <GoldButton label="MARK MILESTONE COMPLETE" onPress={() => completeMilestone()} />
                </View>
              </View>
            )}

            {pitWall != null && (
              <View style={styles.block}>
                <PitWallCard message={pitWall} />
              </View>
            )}

            {todayMorning?.missionSummary != null && (
              <View style={styles.block}>
                <ThemedText type="labelSm" color={colors.text.secondary}>
                  TODAY&apos;S MISSION
                </ThemedText>
                <ThemedText type="bodyMd">{todayMorning.missionSummary}</ThemedText>
              </View>
            )}

            <View style={styles.block}>
              {(['morning', 'night'] as const).map((kind) => {
                const done = kind === 'morning' ? morningDone : nightDone;
                const label = kind === 'morning' ? 'MORNING CHECK-IN' : 'NIGHT CHECK-IN';
                if (done) {
                  return (
                    <Touchable key={kind} style={styles.loggedRow} onPress={() => openCheckin(kind)}>
                      <ThemedText type="labelSm" color={colors.text.secondary}>
                        {label} · LOGGED
                      </ThemedText>
                    </Touchable>
                  );
                }
                if (kind === suggested) {
                  return <GoldButton key={kind} label={label} onPress={() => openCheckin(kind)} />;
                }
                return (
                  <Touchable key={kind} style={styles.secondaryButton} onPress={() => openCheckin(kind)}>
                    <ThemedText type="labelLg" color={colors.text.secondary}>
                      {label}
                    </ThemedText>
                  </Touchable>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.block}>
            <View style={styles.completionBanner}>
              <ThemedText type="labelSm" color={colors.primary.default}>
                MILESTONE COMPLETE
              </ThemedText>
              {lastCompletedMilestone && (
                <>
                  <ThemedText type="headlineSm">{lastCompletedMilestone.title}</ThemedText>
                  <ThemedText type="bodySm" color={colors.text.secondary}>
                    Estimated {lastCompletedMilestone.originalEstimateDays} days. Took{' '}
                    {lastCompletedMilestone.actualCompletedDate
                      ? lastCompletedMilestone.originalEstimateDays +
                        (lastCompletedMilestone.finalVarianceDays ?? 0)
                      : '—'}{' '}
                    days.{' '}
                    {(lastCompletedMilestone.finalVarianceDays ?? 0) === 0
                      ? 'On the original estimate.'
                      : `${Math.abs(lastCompletedMilestone.finalVarianceDays ?? 0)} days ${
                          (lastCompletedMilestone.finalVarianceDays ?? 0) > 0 ? 'over' : 'under'
                        } the original estimate.`}
                  </ThemedText>
                </>
              )}
              <GoldButton
                label="PLAN NEXT MILESTONE"
                onPress={() =>
                  router.push({ pathname: '/compass/setup', params: { mode: 'milestone' } })
                }
              />
            </View>
          </View>
        )}

        {recentCheckins.length > 0 && (
          <View style={styles.block}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              RECENT
            </ThemedText>
            {recentCheckins.slice(0, 5).map((checkin) => (
              <CheckinSummaryRow key={checkin.id} checkin={checkin} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
