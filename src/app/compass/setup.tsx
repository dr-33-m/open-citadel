import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CompassChatMessage, CompassSetupProposal } from 'samwell-shared';

import { CompassChat } from '@/components/compass/compass-chat';
import { SetupDraftCard } from '@/components/compass/draft-cards';
import { formatCompassDate } from '@/components/compass/format';
import { TimePickerSheet } from '@/components/compass/time-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { CalendarPicker } from '@/components/timeline/calendar-picker';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { addDaysYmd, todayLocalYmd } from '@/services/compass-math';
import { useCompassStore } from '@/stores/compass';
import { useSettingsStore } from '@/stores/settings';

export default function CompassSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const milestoneMode = mode === 'milestone';

  const { submitting, error, sendSetupTurn, finalizeSetup } = useCompassStore();
  const { compassMorningTime, compassNightTime, setCompassTimes } = useSettingsStore();
  const inputRef = useRef<TextInput | null>(null);

  const [messages, setMessages] = useState<CompassChatMessage[]>([]);
  const [draft, setDraft] = useState<CompassSetupProposal | null>(null);
  const [committing, setCommitting] = useState<CompassSetupProposal | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [timeEditing, setTimeEditing] = useState<'morning' | 'night' | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface.base, paddingTop: insets.top },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
        },
        backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
        headerTitle: { flex: 1, textAlign: 'center', marginRight: 32 },
        content: {
          paddingHorizontal: spacing[6],
          paddingBottom: insets.bottom + spacing[8],
          gap: spacing[5],
        },
        field: { gap: spacing[2] },
        rationale: {
          fontFamily: fontFamily.serif,
          fontSize: 16,
          lineHeight: 24,
          color: colors.text.secondary,
        },
        pickerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          padding: spacing[3],
        },
        keepRefining: { alignItems: 'center', paddingVertical: spacing[3] },
        errorText: { color: '#e53935' },
      }),
    [colors, insets],
  );

  async function runTurn(msgs: CompassChatMessage[]) {
    const turn = await sendSetupTurn(msgs);
    if (turn) {
      setMessages([...msgs, { role: 'assistant', content: turn.reply }]);
      setDraft(turn.draft);
    }
  }

  async function handleSend(text: string) {
    const next: CompassChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setDraft(null);
    await runTurn(next);
  }

  function handleRetry() {
    if (messages.length === 0) return;
    setDraft(null);
    void runTurn(messages);
  }

  async function handleConfirm() {
    if (!committing) return;
    if (!targetDate) {
      setCalendarVisible(true);
      return;
    }
    setFinalizing(true);
    const ok = await finalizeSetup({ proposal: committing, targetDate });
    setFinalizing(false);
    if (ok) router.back();
  }

  // Commit phase: the driver approved the draft and now sets the date and times.
  if (committing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Touchable onPress={() => setCommitting(null)} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.text.primary} />
          </Touchable>
          <ThemedText type="headlineSm" style={styles.headerTitle}>
            Commit
          </ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              GOAL
            </ThemedText>
            <ThemedText type="headlineSm">{committing.goalTitle}</ThemedText>
          </View>

          <View style={styles.field}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              FIRST MILESTONE
            </ThemedText>
            <ThemedText type="bodyMd">{committing.milestoneTitle}</ThemedText>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              {committing.estimatedEffortUnits} STEPS · {committing.effortUnitDefinition}
            </ThemedText>
          </View>

          <ThemedText style={styles.rationale}>{committing.rationale}</ThemedText>

          <View style={styles.field}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              TARGET DATE
            </ThemedText>
            <Touchable style={styles.pickerRow} onPress={() => setCalendarVisible(true)}>
              <ThemedText type="bodyMd">
                {targetDate ? formatCompassDate(targetDate) : 'Pick a date'}
              </ThemedText>
              <ThemedText type="labelSm" color={colors.primary.default}>
                CHANGE
              </ThemedText>
            </Touchable>
          </View>

          <View style={styles.field}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              CHECK-IN TIMES
            </ThemedText>
            <Touchable style={styles.pickerRow} onPress={() => setTimeEditing('morning')}>
              <ThemedText type="bodyMd">Morning · {compassMorningTime}</ThemedText>
              <ThemedText type="labelSm" color={colors.primary.default}>
                CHANGE
              </ThemedText>
            </Touchable>
            <Touchable style={styles.pickerRow} onPress={() => setTimeEditing('night')}>
              <ThemedText type="bodyMd">Night · {compassNightTime}</ThemedText>
              <ThemedText type="labelSm" color={colors.primary.default}>
                CHANGE
              </ThemedText>
            </Touchable>
          </View>

          {error != null && (
            <ThemedText type="bodySm" style={styles.errorText}>
              {error}
            </ThemedText>
          )}

          <GoldButton
            label={finalizing ? 'SETTING UP…' : 'CONFIRM GOAL'}
            onPress={finalizing ? undefined : handleConfirm}
          />
          <Touchable style={styles.keepRefining} onPress={() => setCommitting(null)}>
            <ThemedText type="labelMd" color={colors.text.secondary}>
              KEEP REFINING
            </ThemedText>
          </Touchable>
        </ScrollView>

        <CalendarPicker
          visible={calendarVisible}
          selectedDate={targetDate ?? ''}
          minDate={addDaysYmd(todayLocalYmd(), 1)}
          onSelectDate={(date) => {
            setTargetDate(date);
            setCalendarVisible(false);
          }}
          onClose={() => setCalendarVisible(false)}
        />

        <TimePickerSheet
          visible={timeEditing !== null}
          label={timeEditing === 'night' ? 'NIGHT CHECK-IN' : 'MORNING CHECK-IN'}
          value={timeEditing === 'night' ? compassNightTime : compassMorningTime}
          onSelect={(nextTime) => {
            if (timeEditing === 'night') setCompassTimes(compassMorningTime, nextTime);
            else setCompassTimes(nextTime, compassNightTime);
          }}
          onClose={() => setTimeEditing(null)}
        />
      </View>
    );
  }

  // Chat phase: shape the goal together.
  return (
    <CompassChat
      title={milestoneMode ? 'Next Milestone' : 'Set a Goal'}
      opener={
        milestoneMode
          ? "What is the next milestone for this goal? Tell me where you are now and we will size it up together."
          : "Tell me what you want to achieve. It does not have to be about building something; a skill, a habit, a change, anything. We will sharpen it together."
      }
      messages={messages}
      submitting={submitting === 'setup'}
      draftCard={
        draft ? (
          <SetupDraftCard
            proposal={draft}
            onApprove={() => setCommitting(draft)}
            onRefine={() => inputRef.current?.focus()}
          />
        ) : null
      }
      placeholder={milestoneMode ? 'The next milestone is…' : 'I want to…'}
      error={error}
      onSend={handleSend}
      onRetry={handleRetry}
      onBack={() => router.back()}
      inputRef={inputRef}
    />
  );
}
