import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimePickerSheet } from '@/components/compass/time-picker-sheet';
import { formatCompassDate } from '@/components/compass/format';
import { ThemedText } from '@/components/themed-text';
import { CalendarPicker } from '@/components/timeline/calendar-picker';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, spacing, typography } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useCompassStore } from '@/stores/compass';
import { useSettingsStore } from '@/stores/settings';

export default function CompassSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const milestoneMode = mode === 'milestone';

  const {
    setupProposal,
    submitting,
    error,
    requestSetupProposal,
    clearSetupProposal,
    confirmSetup,
    clearError,
  } = useCompassStore();
  const { compassMorningTime, compassNightTime, setCompassTimes } = useSettingsStore();

  const [description, setDescription] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [units, setUnits] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [timeEditing, setTimeEditing] = useState<'morning' | 'night' | null>(null);

  useEffect(() => {
    if (setupProposal) {
      setGoalTitle(setupProposal.goalTitle);
      setMilestoneTitle(setupProposal.milestoneTitle);
      setUnits(String(setupProposal.estimatedEffortUnits));
    }
  }, [setupProposal]);

  useEffect(() => {
    return () => {
      clearSetupProposal();
      clearError();
    };
  }, [clearSetupProposal, clearError]);

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
        backButton: {
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerTitle: { flex: 1, textAlign: 'center', marginRight: 32 },
        content: {
          paddingHorizontal: spacing[6],
          paddingBottom: insets.bottom + spacing[8],
          gap: spacing[5],
        },
        input: {
          ...typography.bodyMd,
          color: colors.text.primary,
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          padding: spacing[4],
          minHeight: 140,
          textAlignVertical: 'top',
        },
        fieldInput: {
          ...typography.bodyMd,
          color: colors.text.primary,
          backgroundColor: colors.surface.low,
          borderWidth: 1,
          borderColor: colors.outline.variant,
          padding: spacing[3],
        },
        field: { gap: spacing[2] },
        rationale: {
          fontFamily: fontFamily.serifItalic,
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
        errorText: { color: '#e53935' },
        waiting: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          justifyContent: 'center',
          paddingVertical: spacing[4],
        },
      }),
    [colors, insets],
  );

  const busy = submitting === 'setup';

  function renderDescribeStep() {
    return (
      <>
        <ThemedText type="bodySm" color={colors.text.secondary}>
          {milestoneMode
            ? 'Describe the next checkpoint you want to reach for this goal. The pit wall will size it.'
            : 'Describe what you want to achieve and where you are now. The pit wall structures it — you commit to the date.'}
        </ThemedText>
        <TextInput
          style={styles.input}
          multiline
          placeholder={
            milestoneMode ? 'What does the next milestone look like?' : 'What are you building, and why?'
          }
          placeholderTextColor={colors.text.secondary}
          value={description}
          onChangeText={setDescription}
          editable={!busy}
        />
        {error != null && (
          <ThemedText type="bodySm" style={styles.errorText}>
            {error}
          </ThemedText>
        )}
        {busy ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.primary.default} />
            <ThemedText type="labelMd" color={colors.text.secondary}>
              STRUCTURING…
            </ThemedText>
          </View>
        ) : (
          <GoldButton
            label={milestoneMode ? 'PROPOSE MILESTONE' : 'REQUEST PROPOSAL'}
            onPress={() => {
              if (description.trim().length > 0) requestSetupProposal(description.trim());
            }}
          />
        )}
      </>
    );
  }

  function renderReviewStep() {
    if (!setupProposal) return null;
    return (
      <>
        {!milestoneMode && (
          <View style={styles.field}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              GOAL
            </ThemedText>
            <TextInput style={styles.fieldInput} value={goalTitle} onChangeText={setGoalTitle} />
          </View>
        )}

        <View style={styles.field}>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            MILESTONE
          </ThemedText>
          <TextInput
            style={styles.fieldInput}
            value={milestoneTitle}
            onChangeText={setMilestoneTitle}
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            ESTIMATED EFFORT (UNITS)
          </ThemedText>
          <TextInput
            style={styles.fieldInput}
            value={units}
            onChangeText={setUnits}
            keyboardType="numeric"
          />
          <ThemedText type="bodySm" color={colors.text.secondary}>
            {setupProposal.effortUnitDefinition}
          </ThemedText>
        </View>

        <ThemedText style={styles.rationale}>{setupProposal.rationale}</ThemedText>

        <View style={styles.field}>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            TARGET DATE — YOUR COMMITMENT
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
          label="CONFIRM"
          onPress={async () => {
            if (!targetDate) {
              setCalendarVisible(true);
              return;
            }
            const confirmed = await confirmSetup({
              targetDate,
              goalTitle,
              milestoneTitle,
              estimatedEffortUnits: Number.parseFloat(units) > 0 ? Number.parseFloat(units) : undefined,
            });
            if (confirmed) router.back();
          }}
        />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Touchable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text.primary} />
        </Touchable>
        <ThemedText type="headlineSm" style={styles.headerTitle}>
          {milestoneMode ? 'Next Milestone' : 'Set a Goal'}
        </ThemedText>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {setupProposal ? renderReviewStep() : renderDescribeStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      <CalendarPicker
        visible={calendarVisible}
        selectedDate={targetDate ?? ''}
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
        onSelect={(next) => {
          if (timeEditing === 'night') setCompassTimes(compassMorningTime, next);
          else setCompassTimes(next, compassNightTime);
        }}
        onClose={() => setTimeEditing(null)}
      />
    </View>
  );
}
