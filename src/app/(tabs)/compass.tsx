import { useFocusEffect, useRouter } from 'expo-router';
import {
  Check,
  ChevronUp,
  Compass as CompassIcon,
  Flag,
  Gauge,
  History,
  ListChecks,
  Target,
} from 'lucide-react-native';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CompassMorningAnalysisSchema,
  type CompassMissionStep,
  type CompassScheduleStatus,
} from 'samwell-shared';

import { paceVerdict, scoreColor } from '@/components/compass/format';
import { MissionStep } from '@/components/compass/mission-step';
import { ProgressRing } from '@/components/compass/progress-ring';
import { ProgressSheet } from '@/components/compass/progress-sheet';
import { RecentSheet } from '@/components/compass/recent-sheet';
import { SamwellMarkdown } from '@/components/compass/samwell-markdown';
import { ThemedText } from '@/components/themed-text';
import { CalendarPicker } from '@/components/timeline/calendar-picker';
import { GoldButton } from '@/components/ui/gold-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Touchable } from '@/components/ui/touchable';
import { BottomTabInset, elevation, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import {
  activeCheckin,
  addDaysYmd,
  computeProgress,
  todayLocalYmd,
} from '@/services/compass-math';
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
    updateTargetDates,
    archiveGoal,
    clearError,
  } = useCompassStore();

  const [showProgress, setShowProgress] = React.useState(false);
  const [showRecent, setShowRecent] = React.useState(false);
  const [editingDate, setEditingDate] = React.useState<'milestone' | 'goal' | null>(null);
  const [page, setPage] = React.useState(0);
  const { width } = useWindowDimensions();

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
          ...elevation.card,
        },
        eyebrow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
        focusRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing[4],
        },
        focusLeft: { flex: 1, gap: spacing[2] },
        ringBlock: { alignItems: 'center', gap: spacing[1], paddingTop: spacing[1] },
        dots: {
          flexDirection: 'row',
          justifyContent: 'center',
          gap: spacing[2],
          paddingTop: spacing[4],
        },
        dot: { width: 6, height: 6, backgroundColor: colors.outline.variant },
        dotActive: { backgroundColor: colors.primary.default },
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
        missionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        loggedChip: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
        missionList: { gap: spacing[2] },
        missionListDone: { gap: spacing[2], opacity: 0.55 },

        // Bottom telemetry strips (bordered cards)
        strips: { gap: spacing[4] },
        strip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[4],
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          padding: spacing[4],
        },
        stripIcon: {
          width: 44,
          height: 44,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          alignItems: 'center',
          justifyContent: 'center',
        },
        stripBody: { flex: 1, gap: spacing[1] },
        stripMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
        stripDot: { width: 3, height: 3, backgroundColor: colors.text.secondary },

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
  const nightLogged = todayNight != null;
  const nightColor = scoreColor(todayNight?.focusScore, colors.primary.default);

  const milestoneComplete = milestone.completedEffortUnits >= milestone.estimatedEffortUnits;
  const progress = computeProgress(
    milestone.completedEffortUnits,
    milestone.estimatedEffortUnits,
  );
  const percent = Math.round(progress * 100);
  const status = telemetry?.scheduleStatus ?? 'unknown';
  const variance = telemetry?.varianceDays ?? null;
  const paceTint = (s: CompassScheduleStatus) =>
    s === 'behind'
      ? '#e53935'
      : s === 'ahead'
        ? '#4caf50'
        : s === 'unknown'
          ? colors.text.secondary
          : colors.primary.default;
  const paceColor = paceTint(status);

  const goalTrack = telemetry?.goalTrack ?? null;
  const goalPercent = goalTrack
    ? Math.round((goalTrack.milestonesDone / goalTrack.estimatedMilestones) * 100)
    : 0;
  const goalPaceColor = paceTint(goalTrack?.scheduleStatus ?? 'unknown');

  const pageWidth = width - spacing[6] * 2;
  const paragraphs = heroMessage
    ? heroMessage
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    : [];
  const firstPara = paragraphs[0] ?? '';
  const restParas = paragraphs.slice(1).join('\n\n');

  return (
    <View style={styles.container}>
      {appHeader}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {errorBanner}

        {/* Focus + Tasks as a swipeable carousel. */}
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPage(Math.round(e.nativeEvent.contentOffset.x / pageWidth))
            }
          >
            {/* Focus page */}
            <View style={{ width: pageWidth }}>
              <View style={[styles.focusCard, { borderLeftColor: focusColor }]}>
                <View style={styles.focusRow}>
                  <View style={styles.focusLeft}>
                    <View style={styles.eyebrow}>
                      <Target size={16} color={focusColor} />
                      <ThemedText type="labelSm" color={focusColor}>
                        TODAY&apos;S FOCUS
                      </ThemedText>
                    </View>
                    {headline && <ThemedText type="headlineSm">{headline}</ThemedText>}
                    {heroMessage ? (
                      <SamwellMarkdown
                        content={firstPara}
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
                    <ThemedText type="bodySm">
                      {telemetry?.daysRemaining ?? 0} days left
                    </ThemedText>
                    <ThemedText type="bodySm" color={colors.text.secondary}>
                      {cadenceText(telemetry?.requiredDailyUnits)}
                    </ThemedText>
                  </View>
                </View>

                {heroMessage && restParas.length > 0 && (
                  <SamwellMarkdown
                    content={restParas}
                    fontSize={14}
                    lineHeight={21}
                    color={colors.text.secondary}
                  />
                )}

                <View style={styles.focusDivider} />

                {milestoneComplete ? (
                  <GoldButton label="MARK MILESTONE COMPLETE" onPress={() => completeMilestone()} />
                ) : dueDone ? (
                  <View style={styles.loggedRow}>
                    <View style={styles.loggedInline}>
                      <Check
                        size={16}
                        color={scoreColor(dueCheckin?.focusScore, colors.primary.default)}
                      />
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
            </View>

            {/* Tasks page */}
            {mission.length > 0 && (
              <View style={{ width: pageWidth }}>
                <View style={styles.missionCard}>
                  <View style={styles.missionHeader}>
                    <View style={styles.eyebrow}>
                      <ListChecks
                        size={16}
                        color={nightLogged ? colors.text.secondary : colors.primary.default}
                      />
                      <ThemedText
                        type="labelSm"
                        color={nightLogged ? colors.text.secondary : colors.primary.default}
                      >
                        TODAY&apos;S TASKS
                      </ThemedText>
                    </View>
                    {nightLogged && (
                      <View style={styles.loggedChip}>
                        <Check size={14} color={nightColor} />
                        <ThemedText type="labelSm" color={nightColor}>
                          LOGGED
                        </ThemedText>
                      </View>
                    )}
                  </View>
                  <View style={nightLogged ? styles.missionListDone : styles.missionList}>
                    {mission.map((step, i) => (
                      <MissionStep
                        key={i}
                        index={i + 1}
                        step={step}
                        showIcon={structuredMission != null}
                      />
                    ))}
                  </View>
                  {nightLogged && (
                    <ThemedText type="bodySm" color={colors.text.secondary}>
                      Day logged. New tasks after tomorrow&apos;s morning check-in.
                    </ThemedText>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {mission.length > 0 && (
            <View style={styles.dots}>
              <View style={[styles.dot, page === 0 && styles.dotActive]} />
              <View style={[styles.dot, page === 1 && styles.dotActive]} />
            </View>
          )}
        </View>

        {/* Goal, milestone and recent as bordered telemetry cards. The goal card is
            what stops a well-paced milestone from hiding a goal that lands late. */}
        <View style={styles.strips}>
          {goalTrack && (
            <Touchable style={styles.strip} onPress={() => setShowProgress(true)}>
              <View style={styles.stripIcon}>
                <Flag size={20} color={colors.primary.default} />
              </View>
              <View style={styles.stripBody}>
                <ThemedText type="labelSm" color={colors.text.secondary}>
                  GOAL
                </ThemedText>
                <ThemedText type="bodyMd">{goal.title}</ThemedText>
                <View style={styles.stripMeta}>
                  <ThemedText type="labelSm" color={colors.text.secondary}>
                    {goalPercent}%
                  </ThemedText>
                  <View style={styles.stripDot} />
                  <ThemedText type="labelSm" color={goalPaceColor}>
                    {paceVerdict(goalTrack.scheduleStatus, goalTrack.varianceDays).toUpperCase()}
                  </ThemedText>
                </View>
              </View>
              <ChevronUp size={18} color={colors.text.secondary} />
            </Touchable>
          )}

          <Touchable style={styles.strip} onPress={() => setShowProgress(true)}>
            <View style={styles.stripIcon}>
              <Gauge size={20} color={colors.primary.default} />
            </View>
            <View style={styles.stripBody}>
              {goalTrack && (
                <ThemedText type="labelSm" color={colors.text.secondary}>
                  MILESTONE
                </ThemedText>
              )}
              <ThemedText type="bodyMd">{milestone.title}</ThemedText>
              <View style={styles.stripMeta}>
                <ThemedText type="labelSm" color={colors.text.secondary}>
                  {percent}%
                </ThemedText>
                <View style={styles.stripDot} />
                <ThemedText type="labelSm" color={paceColor}>
                  {paceVerdict(status, variance).toUpperCase()}
                </ThemedText>
              </View>
            </View>
            <ChevronUp size={18} color={colors.text.secondary} />
          </Touchable>

          <Touchable style={styles.strip} onPress={() => setShowRecent(true)}>
            <View style={styles.stripIcon}>
              <History size={20} color={colors.primary.default} />
            </View>
            <View style={styles.stripBody}>
              <ThemedText type="bodyMd">Recent check-ins</ThemedText>
              <ThemedText type="bodySm" color={colors.text.secondary}>
                View your past check-ins
              </ThemedText>
            </View>
            <ChevronUp size={18} color={colors.text.secondary} />
          </Touchable>
        </View>
      </ScrollView>

      <ProgressSheet
        visible={showProgress}
        onClose={() => setShowProgress(false)}
        goalTitle={goal.title}
        milestone={milestone}
        telemetry={telemetry}
        onAdjustDates={(which) => {
          setShowProgress(false);
          setEditingDate(which);
        }}
        onArchiveGoal={() => {
          setShowProgress(false);
          void archiveGoal();
        }}
      />
      <CalendarPicker
        visible={editingDate !== null}
        selectedDate={
          (editingDate === 'goal' ? goalTrack?.targetDate : milestone.targetDate) ?? ''
        }
        minDate={addDaysYmd(todayLocalYmd(), 1)}
        onSelectDate={(date) => {
          const which = editingDate;
          setEditingDate(null);
          if (which === 'goal') void updateTargetDates({ goalTargetDate: date });
          else if (which === 'milestone') void updateTargetDates({ milestoneTargetDate: date });
        }}
        onClose={() => setEditingDate(null)}
      />
      <RecentSheet
        visible={showRecent}
        onClose={() => setShowRecent(false)}
        checkins={recentCheckins}
      />
    </View>
  );
}
