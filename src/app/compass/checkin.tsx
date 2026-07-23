import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useState } from 'react';
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
import type { CompassMorningAnalysis, CompassNightAnalysis } from 'samwell-shared';

import { PitWallCard } from '@/components/compass/pit-wall-card';
import { ThemedText } from '@/components/themed-text';
import { GoldButton } from '@/components/ui/gold-button';
import { Touchable } from '@/components/ui/touchable';
import { spacing, typography } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { computeFocusScore } from '@/services/compass-math';
import { useCompassStore } from '@/stores/compass';

type CheckinResult =
  | { kind: 'morning'; analysis: CompassMorningAnalysis }
  | { kind: 'night'; analysis: CompassNightAnalysis };

export default function CompassCheckinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: 'morning' | 'night' = params.kind === 'night' ? 'night' : 'morning';

  const { todayMorning, todayNight, submitting, error, submitMorning, submitNight, clearError } =
    useCompassStore();

  const [text, setText] = useState('');
  const [result, setResult] = useState<CheckinResult | null>(null);

  const replacing = kind === 'morning' ? todayMorning != null : todayNight != null;
  const busy = submitting === kind;

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
          minHeight: 160,
          textAlignVertical: 'top',
        },
        waiting: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          justifyContent: 'center',
          paddingVertical: spacing[4],
        },
        scoreBlock: { alignItems: 'center', gap: spacing[1], paddingVertical: spacing[3] },
        errorText: { color: '#e53935' },
      }),
    [colors, insets],
  );

  function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) return;
    clearError();
    if (kind === 'morning') {
      submitMorning(trimmed).then((analysis) => {
        if (analysis) setResult({ kind: 'morning', analysis });
      });
    } else {
      submitNight(trimmed).then((analysis) => {
        if (analysis) setResult({ kind: 'night', analysis });
      });
    }
  }

  function renderInput() {
    return (
      <>
        <ThemedText type="bodySm" color={colors.text.secondary}>
          {kind === 'morning'
            ? 'What are you planning to do today? Plain words — the pit wall does the sorting.'
            : 'What actually happened today? Report it straight — drift included.'}
        </ThemedText>
        {replacing && (
          <ThemedText type="labelSm" color={colors.text.secondary}>
            THIS REPLACES TODAY&apos;S {kind === 'morning' ? 'PLAN' : 'REPORT'}
          </ThemedText>
        )}
        <TextInput
          style={styles.input}
          multiline
          placeholder={
            kind === 'morning' ? 'Today I want to…' : 'Today I actually…'
          }
          placeholderTextColor={colors.text.secondary}
          value={text}
          onChangeText={setText}
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
              PIT WALL ANALYZING…
            </ThemedText>
          </View>
        ) : (
          <GoldButton
            label={kind === 'morning' ? 'ANALYZE TODAY' : 'ANALYZE EXECUTION'}
            onPress={handleSubmit}
          />
        )}
      </>
    );
  }

  function renderResult(r: CheckinResult) {
    const focusScore = computeFocusScore(r.analysis.actions);
    return (
      <>
        <View style={styles.scoreBlock}>
          <ThemedText type="labelSm" color={colors.text.secondary}>
            FOCUS SCORE
          </ThemedText>
          <ThemedText type="displayLg" color={colors.primary.default}>
            {focusScore}%
          </ThemedText>
          {r.kind === 'night' && (
            <ThemedText type="labelSm" color={colors.text.secondary}>
              +{r.analysis.effortUnitsCompleted} UNITS LOGGED
            </ThemedText>
          )}
        </View>

        {r.kind === 'morning' && (
          <View style={{ gap: spacing[2] }}>
            <ThemedText type="labelSm" color={colors.text.secondary}>
              TODAY&apos;S MISSION
            </ThemedText>
            <ThemedText type="bodyMd">{r.analysis.missionSummary}</ThemedText>
          </View>
        )}

        <PitWallCard message={r.analysis.pitWallMessage} />

        <GoldButton label="DONE" onPress={() => router.back()} />
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
          {kind === 'morning' ? 'Morning Check-in' : 'Night Check-in'}
        </ThemedText>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {result ? renderResult(result) : renderInput()}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
