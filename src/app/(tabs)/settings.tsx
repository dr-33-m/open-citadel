import * as Speech from 'expo-speech';
import { Volume2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useColors } from '@/hooks/use-colors';
import { fontFamily, spacing } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings';

const TTS_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

type VoiceItem = { identifier: string; name: string; language: string; quality: string };

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { username, theme, ttsVoice, ttsRate, setUsername, setTheme, setTtsVoice, setTtsRate } =
    useSettingsStore();
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(username);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);

  const styles = React.useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1, paddingHorizontal: spacing[6] },
    section: {
      marginTop: spacing[10],
      gap: spacing[4],
    },
    label: {
      letterSpacing: 1.2,
    },
    input: {
      backgroundColor: colors.surface.mid,
      color: colors.text.primary,
      fontFamily: fontFamily.sans,
      fontSize: 16,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[4],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface.low,
      paddingHorizontal: spacing[5],
      paddingVertical: spacing[4],
    },
    saveBtn: {
      alignSelf: 'flex-end',
      paddingVertical: spacing[2],
      paddingHorizontal: spacing[4],
    },
    divider: {
      height: 1,
      backgroundColor: colors.surface.highest,
      marginTop: spacing[10],
    },
    rateRow: {
      flexDirection: 'row',
      gap: spacing[2],
      flexWrap: 'wrap',
    },
    rateChip: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[2],
      backgroundColor: colors.surface.low,
    },
    rateChipActive: {
      backgroundColor: colors.primary.default,
    },
    // Voice modal
    modalContainer: {
      flex: 1,
      backgroundColor: colors.surface.base,
      paddingTop: insets.top,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[6],
      paddingVertical: spacing[5],
      borderBottomWidth: 1,
      borderBottomColor: colors.surface.highest,
    },
    sectionHeader: {
      backgroundColor: colors.surface.base,
      paddingHorizontal: spacing[6],
      paddingVertical: spacing[2],
    },
    voiceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing[6],
      paddingVertical: spacing[4],
      borderBottomWidth: 1,
      borderBottomColor: colors.surface.low,
      gap: spacing[4],
    },
    voiceInfo: { flex: 1, gap: spacing[1] },
    qualityBadge: {
      paddingHorizontal: spacing[2],
      paddingVertical: 2,
      backgroundColor: colors.surface.mid,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formatNote: {
      marginTop: spacing[2],
    },
  }), [colors, insets.top]);

  const handleNameBlur = () => {
    const trimmed = editingName.trim();
    if (trimmed !== username) setUsername(trimmed);
  };

  const openVoiceModal = useCallback(async () => {
    setVoiceModalVisible(true);
    setVoicesLoading(true);
    try {
      const available = await Speech.getAvailableVoicesAsync();
      setVoices(
        available.map((v) => ({
          identifier: v.identifier,
          name: v.name,
          language: v.language,
          quality: v.quality === Speech.VoiceQuality.Enhanced ? 'ENHANCED' : 'DEFAULT',
        }))
      );
    } finally {
      setVoicesLoading(false);
    }
  }, []);

  const previewVoice = useCallback((item: VoiceItem) => {
    if (previewingVoice === item.identifier) {
      Speech.stop();
      setPreviewingVoice(null);
      return;
    }
    Speech.stop();
    setPreviewingVoice(item.identifier);
    Speech.speak('Hello, this is a preview of this voice.', {
      voice: item.identifier || undefined,
      language: item.language || undefined,
      onDone: () => setPreviewingVoice(null),
      onStopped: () => setPreviewingVoice(null),
      onError: () => setPreviewingVoice(null),
    });
  }, [previewingVoice]);

  // Group voices by language for SectionList
  const voiceSections = React.useMemo(() => {
    const byLang: Record<string, VoiceItem[]> = {};
    for (const v of voices) {
      const lang = v.language.split('-')[0].toUpperCase();
      if (!byLang[lang]) byLang[lang] = [];
      byLang[lang].push(v);
    }
    const sections = Object.entries(byLang)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
    // Prepend "System default" section
    return [{ title: 'DEFAULT', data: [{ identifier: '', name: 'System default', language: '', quality: '' }] }, ...sections];
  }, [voices]);

  const currentVoiceName = React.useMemo(() => {
    if (!ttsVoice) return 'System default';
    const found = voices.find((v) => v.identifier === ttsVoice);
    return found?.name ?? ttsVoice;
  }, [ttsVoice, voices]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Settings" />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing[10] }}>
        {/* Display name */}
        <View style={styles.section}>
          <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
            PROFILE
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={colors.text.secondary}
            value={editingName}
            onChangeText={setEditingName}
            onBlur={handleNameBlur}
            onSubmitEditing={handleNameBlur}
            returnKeyType="done"
            autoCorrect={false}
          />
        </View>

        <View style={styles.divider} />

        {/* Appearance */}
        <View style={styles.section}>
          <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
            APPEARANCE
          </ThemedText>
          <Pressable
            style={styles.row}
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <ThemedText type="bodyMd">Light Mode</ThemedText>
            <Switch
              value={theme === 'light'}
              onValueChange={(val) => setTheme(val ? 'light' : 'dark')}
              trackColor={{ false: colors.surface.highest, true: colors.primary.default }}
              thumbColor={colors.surface.low}
            />
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* Format tip */}
        <View style={styles.section}>
          <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
            BOOKS
          </ThemedText>

          <ThemedText type="bodySm" color={colors.text.secondary} style={styles.formatNote}>
            Open Citadel is EPUB-only. EPUB is the best format for knowledge capture — it supports themes, custom fonts, and text-to-speech.
          </ThemedText>
        </View>

        <View style={styles.divider} />

        {/* TTS */}
        <View style={styles.section}>
          <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
            TEXT TO SPEECH
          </ThemedText>

          {/* Rate chips */}
          <ThemedText type="labelSm" color={colors.text.secondary}>READING SPEED</ThemedText>
          <View style={styles.rateRow}>
            {TTS_RATES.map((r) => {
              const active = Math.abs(ttsRate - r) < 0.01;
              return (
                <Pressable
                  key={r}
                  style={[styles.rateChip, active && styles.rateChipActive]}
                  onPress={() => setTtsRate(r)}
                >
                  <ThemedText
                    type="labelSm"
                    color={active ? colors.surface.base : colors.text.primary}
                  >
                    {r === 1 ? '1×' : `${r}×`}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Voice row */}
          <Pressable style={styles.row} onPress={openVoiceModal}>
            <ThemedText type="bodyMd">Voice</ThemedText>
            <ThemedText type="bodySm" color={colors.text.secondary}>
              {currentVoiceName} ›
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      {/* Voice picker modal */}
      <Modal
        visible={voiceModalVisible}
        animationType="slide"
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText type="headlineMd">Select Voice</ThemedText>
            <Pressable onPress={() => setVoiceModalVisible(false)} hitSlop={12}>
              <ThemedText type="bodyMd" color={colors.primary.default}>Done</ThemedText>
            </Pressable>
          </View>

          {voicesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.primary.default} />
            </View>
          ) : (
            <SectionList
              sections={voiceSections}
              keyExtractor={(item) => item.identifier || '__default__'}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <ThemedText type="labelSm" color={colors.text.secondary}>
                    {section.title}
                  </ThemedText>
                </View>
              )}
              renderItem={({ item }) => {
                const isSelected = item.identifier
                  ? ttsVoice === item.identifier
                  : ttsVoice === null;
                const isPreviewing = previewingVoice === item.identifier;
                return (
                  <Pressable
                    style={styles.voiceItem}
                    onPress={() => {
                      setTtsVoice(item.identifier || null, item.language || null);
                      setVoiceModalVisible(false);
                    }}
                  >
                    <View style={styles.voiceInfo}>
                      <ThemedText type="bodyMd">{item.name}</ThemedText>
                      {item.language ? (
                        <ThemedText type="labelSm" color={colors.text.secondary}>
                          {item.language}
                        </ThemedText>
                      ) : null}
                    </View>
                    {item.quality ? (
                      <View style={styles.qualityBadge}>
                        <ThemedText type="labelSm" color={colors.text.secondary}>
                          {item.quality}
                        </ThemedText>
                      </View>
                    ) : null}
                    {item.identifier ? (
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); previewVoice(item); }}
                        hitSlop={8}
                      >
                        <Volume2
                          size={18}
                          color={isPreviewing ? colors.primary.default : colors.text.secondary}
                        />
                      </Pressable>
                    ) : null}
                    {isSelected && (
                      <ThemedText type="bodyMd" color={colors.primary.default}>✓</ThemedText>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </ThemedView>
  );
}
