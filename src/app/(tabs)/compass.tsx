import { useFocusEffect, useRouter } from 'expo-router';
import {
  Check,
  ChevronRight,
  Compass as CompassIcon,
  Flag,
  Target,
} from 'lucide-react-native';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompassMorningAnalysisSchema, type CompassMissionStep } from 'samwell-shared';

import { paceVerdict, scoreColor } from '@/components/compass/format';
import { MissionStep } from '@/components/compass/mission-step';
import { ProgressRing } from '@/components/compass/progress-ring';
import { ProgressSheet } from '@/components/compass/progress-sheet';
import { RecentSheet } from '@/components/compass/recent-sheet';
import { SamwellMarkdown } from '@/components/compass/samwell-markdown';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Touchable } from '@/components/ui/touchable';
import { BottomTabInset, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { activeCheckin, computeProgress } from '@/services/compass-math';
import { useCompassStore } from '@/stores/compass';
import { useSettingsStore } from '@/stores/settings';

import type { CompassCheckinRow } from '@/stores/compass';

function latestCheckin(
  todayNight: CompassCheckinRow | null,
  todayMorning: CompassCheckinRow | null,
  recent: CompassCheckinRow[],
): CompassCheckinRow | null {
  return todayNight ?? todayMorning ?? recent[0] ?? null;
}

function parseHeadline(row: CompassCheckinRow | null): string | null {
  if (!row) return null;
  try {
    const obj = JSON.parse(row.analysisJson);
    return typeof obj?.headline === 'string' && obj.headline.length > 0 ? obj.headline : null;
  } catch {
    return null;
  }
}

function parseMission(row: CompassCheckinRow | null): CompassMissionStep[] | null {
  if (!row) return null;
  try {
    const parsed = CompassMorningAnalysisSchema.safeParse(JSON.parse(row.analysisJson));
    return parsed.success ? parsed.data.mission : null;
  } catch {
    return null;
  }
}

/** Older check-ins predate structured mission steps; render their text summary instead. */
function fallbackMission(text: string | null | undefined): CompassMissionStep[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .map((title) => ({ title, detail: '', icon: 'circle' as const }));
}

function stepNum(n: number): number {
  return Math.round(n * 10) / 10;
}

function cadenceText(required: number | undefined): string {
  if (!required || required <= 0) return 'on pace';
  if (required >= 1) {
    const n = Math.round(required);
    return `~${n} step${n === 1 ? '' : 's'} / day`;
  }
  return `~1 every ${Math.round(1 / required)} days`;
}

export default function CompassTab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { samwellMode, cloudBaseUrl, compassMorningTime, compassNightTime } = useSettingsStore();
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

  const [showProgress, setShowProgress] = React.useState(false);
  const [showRecent, setShowRecent] = React.useState(false);

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
        appHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing[6],
          paddingTop: insets.top + spacing[3],
          paddingBottom: spacing[4],
        },
        headerIcon: {
          width: 40,
          height: 40,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          alignItems: 'center',
          justifyContent: 'center',
        },
        scrollContent: {
          paddingHorizontal: spacing[6],
          paddingBottom: BottomTabInset + spacing[6],
          gap: spacing[5],
        },
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

        // Focus card
        focusCard: {
          backgroundColor: colors.surface.low,
          borderLeftWidth: 2,
          padding: spacing[5],
          gap: spacing[4],
        },
        eyebrow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
        focusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[4],
        },
        focusLeft: { flex: 1, gap: spacing[2] },
        ringBlock: { alignItems: 'center', gap: spacing[1] },
        ringCenter: { alignItems: 'center' },
        focusDivider: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.outline.variant,
        },
        loggedRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[3],
        },
        loggedInline: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexShrink: 1 },

        // Mission card
        missionCard: {
          backgroundColor: colors.surface.low,
          padding: spacing[5],
          gap: spacing[4],
        },
        missionList: { gap: spacing[2] },

        // Bottom stat cards
        bottomRow: { flexDirection: 'row', gap: spacing[4] },
        statCard: {
          flex: 1,
          backgroundColor: colors.surface.low,
          padding: spacing[4],
          gap: spacing[3],
          justifyContent: 'space-between',
          minHeight: 128,
        },
        recentBottom: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[2],
        },

        completionBanner: {
          backgroundColor: colors.surface.low,
          padding: spacing[4],
          gap: spacing[3],
        },
        errorBanner: {
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
          <ScreenHeader title="Compass" />
        </View>
        <View style={styles.centered}>
          <CompassIcon size={48} color={colors.text.secondary} style={styles.dimIcon} />
          <ThemedText type="headlineSm" color={colors.text.secondary}>
            Compass
          </ThemedText>
          <ThemedText type="bodySm" color={colors.text.secondary} style={styles.centerText}>
            {notConfigured
              ? 'Set one goal and reach it, with Grand Maester Samwell helping you stay on track. He is not set up in this build yet.'
              : 'Set one goal and reach it. Grand Maester Samwell breaks it into a plan, tracks your progress, and tells you what to focus on each day. Switch to Cloud to begin.'}
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
          <ScreenHeader title="Compass" />
        </View>
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={styles.container}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="Compass" />
        </View>
        <View style={styles.centered}>
          <CompassIcon size={48} color={colors.text.secondary} style={styles.dimIcon} />
          <ThemedText type="headlineSm" color={colors.text.secondary}>
            One goal at a time.
          </ThemedText>
          <ThemedText type="bodySm" color={colors.text.secondary} style={styles.centerText}>
            Tell Grand Maester Samwell what you want to achieve. He shapes it into a plan, tracks
            your progress, and tells you what matters each day. You just check in, morning and
            night.
          </ThemedText>
          <GoldButton label="SET A GOAL" onPress={() => router.push('/compass/setup')} />
        </View>
      </View>
    );
  }

  const errorBanner = error != null && (
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
  );

  const appHeader = (
    <View style={styles.appHeader}>
      <View>
        <ThemedText type="headlineLg">Compass</ThemedText>
        <ThemedText type="bodySm" color={colors.text.secondary}>
          Stay aligned. Take the right action.
        </ThemedText>
      </View>
      <View style={styles.headerIcon}>
        <CompassIcon size={20} color={colors.primary.default} />
      </View>
    </View>
  );

  // No active milestone: the previous one is done, invite the next.
  if (!milestone) {
    const variance = lastCompletedMilestone?.finalVarianceDays ?? 0;
    return (
      <View style={styles.container}>
        {appHeader}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {errorBanner}
          <View style={styles.completionBanner}>
            <ThemedText type="labelSm" color={colors.primary.default}>
              MILESTONE COMPLETE
            </ThemedText>
            {lastCompletedMilestone && (
              <>
                <ThemedText type="headlineSm">{lastCompletedMilestone.title}</ThemedText>
                <ThemedText type="bodySm" color={colors.text.secondary}>
                  Estimated {lastCompletedMilestone.originalEstimateDays} days.{' '}
                  {variance === 0
                    ? 'Finished on the original estimate.'
                    : `Finished ${Math.abs(variance)} ${
                        Math.abs(variance) === 1 ? 'day' : 'days'
                      } ${variance > 0 ? 'over' : 'under'} it.`}
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
        </ScrollView>
      </View>
    );
  }

  const due = activeCheckin(new Date(), compassMorningTime, compassNightTime);
  const dueCheckin = due === 'morning' ? todayMorning : todayNight;
  const dueDone = dueCheckin != null;

  const openCheckin = (kind: 'morning' | 'night') =>
    router.push({ pathname: '/compass/checkin', params: { kind } });

  const latest = latestCheckin(todayNight, todayMorning, recentCheckins);
  const heroMessage = latest?.pitWallMessage ?? null;
  const headline = parseHeadline(latest);
  const focusColor = scoreColor(latest?.focusScore, colors.primary.default);
  const structuredMission = parseMission(todayMorning);
  const mission = structuredMission ?? fallbackMission(todayMorning?.missionSummary);

  const milestoneComplete = milestone.completedEffortUnits >= milestone.estimatedEffortUnits;
  const progress = computeProgress(
    milestone.completedEffortUnits,
    milestone.estimatedEffortUnits,
  );
  const percent = Math.round(progress * 100);
  const status = telemetry?.scheduleStatus ?? 'unknown';
  const variance = telemetry?.varianceDays ?? null;
  const paceColor =
    status === 'behind'
      ? '#e53935'
      : status === 'ahead'
        ? '#4caf50'
        : status === 'unknown'
          ? colors.text.secondary
          : colors.primary.default;

  return (
    <View style={styles.container}>
      {appHeader}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {errorBanner}

        {/* Focus card: Samwell's read + the milestone ring. */}
        <View style={[styles.focusCard, { borderLeftColor: focusColor }]}>
          <View style={styles.eyebrow}>
            <Target size={16} color={focusColor} />
            <ThemedText type="labelSm" color={focusColor}>
              TODAY&apos;S FOCUS
            </ThemedText>
          </View>

          <View style={styles.focusRow}>
            <View style={styles.focusLeft}>
              {headline && <ThemedText type="headlineSm">{headline}</ThemedText>}
              {heroMessage ? (
                <SamwellMarkdown
                  content={heroMessage}
                  fontSize={14}
                  lineHeight={21}
                  color={colors.text.secondary}
                />
              ) : (
                <ThemedText type="bodyMd" color={colors.text.secondary}>
                  {due === 'morning'
                    ? 'Start with the morning check-in and Grand Maester Samwell will shape today into a clear mission.'
                    : 'Close the day with the night check-in and Grand Maester Samwell will read your pace.'}
                </ThemedText>
              )}
            </View>
            <View style={styles.ringBlock}>
              <ProgressRing progress={progress} size={104}>
                <View style={styles.ringCenter}>
                  <ThemedText type="headlineSm">
                    {stepNum(milestone.completedEffortUnits)}/{milestone.estimatedEffortUnits}
                  </ThemedText>
                  <ThemedText type="labelSm" color={colors.text.secondary}>
                    STEPS
                  </ThemedText>
                </View>
              </ProgressRing>
              <ThemedText type="bodySm">{telemetry?.daysRemaining ?? 0} days left</ThemedText>
              <ThemedText type="bodySm" color={colors.text.secondary}>
                {cadenceText(telemetry?.requiredDailyUnits)}
              </ThemedText>
            </View>
          </View>

          <View style={styles.focusDivider} />

          {milestoneComplete ? (
            <GoldButton label="MARK MILESTONE COMPLETE" onPress={() => completeMilestone()} />
          ) : dueDone ? (
            <View style={styles.loggedRow}>
              <View style={styles.loggedInline}>
                <Check size={16} color={scoreColor(dueCheckin?.focusScore, colors.primary.default)} />
                <ThemedText type="bodySm" color={colors.text.secondary}>
                  {due === 'morning' ? 'Morning' : 'Night'} check-in logged
                </ThemedText>
              </View>
              <Touchable onPress={() => openCheckin(due)}>
                <ThemedText type="labelSm" color={colors.primary.default}>
                  REDO
                </ThemedText>
              </Touchable>
            </View>
          ) : (
            <GoldButton
              label={due === 'morning' ? 'MORNING CHECK-IN' : 'NIGHT CHECK-IN'}
              onPress={() => openCheckin(due)}
            />
          )}
        </View>

        {/* Mission card: Samwell's ordered steps for today. */}
        {mission && mission.length > 0 && (
          <View style={styles.missionCard}>
            <View style={styles.eyebrow}>
              <Flag size={16} color={colors.primary.default} />
              <ThemedText type="labelSm" color={colors.primary.default}>
                TODAY&apos;S MISSION
              </ThemedText>
            </View>
            <View style={styles.missionList}>
              {mission.map((step, i) => (
                <MissionStep
                  key={i}
                  index={i + 1}
                  step={step}
                  showIcon={structuredMission != null}
                />
              ))}
            </View>
          </View>
        )}

        {/* Bottom row: progress + recent, side by side. */}
        <View style={styles.bottomRow}>
          <Touchable style={styles.statCard} onPress={() => setShowProgress(true)}>
            <ThemedText type="labelSm" color={colors.text.secondary} numberOfLines={2}>
              {milestone.title}
            </ThemedText>
            <View>
              <ThemedText type="displayMd" color={colors.primary.default}>
                {percent}%
              </ThemedText>
              <ThemedText type="labelSm" color={paceColor}>
                {paceVerdict(status, variance)}
              </ThemedText>
            </View>
          </Touchable>

          <Touchable style={styles.statCard} onPress={() => setShowRecent(true)}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              RECENT CHECK-INS
            </ThemedText>
            <View style={styles.recentBottom}>
              <ThemedText type="bodySm">View your activity</ThemedText>
              <ChevronRight size={16} color={colors.text.secondary} />
            </View>
          </Touchable>
        </View>
      </ScrollView>

      <ProgressSheet
        visible={showProgress}
        onClose={() => setShowProgress(false)}
        goalTitle={goal.title}
        milestone={milestone}
        telemetry={telemetry}
      />
      <RecentSheet
        visible={showRecent}
        onClose={() => setShowRecent(false)}
        checkins={recentCheckins}
      />
    </View>
  );
}
