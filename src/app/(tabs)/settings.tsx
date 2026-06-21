import * as Speech from 'expo-speech';
import { Download, MemoryStick, Power, Search, SlidersHorizontal, Trash2, Volume2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
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
import { useLlamaStore } from '@/stores/llama';

const TTS_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

type VoiceItem = { identifier: string; name: string; language: string; quality: string };
type HFRepo = { id: string; downloads: number; likes: number };
type HFFile = { rfilename: string; size?: number };

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

  const {
    models,
    activeModelId,
    isLoaded,
    isLoading: llamaLoading,
    loadError,
    downloadProgress,
    loadModels,
    setActiveModel,
    downloadModel,
    cancelDownload,
    deleteModel,
    releaseContext,
    addCustomModel,
    inference,
    setInference,
    memoryEstimate,
    checkMemory,
    hasGpu,
  } = useLlamaStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [modelSheetVisible, setModelSheetVisible] = useState(false);
  const [modelSheetView, setModelSheetView] = useState<'list' | 'hf'>('list');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [tuneModalVisible, setTuneModalVisible] = useState(false);
  const [memoryInfoVisible, setMemoryInfoVisible] = useState(false);
  const [samwellMode, setSamwellMode] = useState<'offline' | 'cloud'>('offline');

  // HuggingFace search state (lives inside the model picker sheet)
  const [hfQuery, setHfQuery] = useState('');
  const [hfResults, setHfResults] = useState<HFRepo[]>([]);
  const [hfSearching, setHfSearching] = useState(false);
  const [hfRepo, setHfRepo] = useState<string | null>(null);
  const [hfFiles, setHfFiles] = useState<HFFile[]>([]);
  const [hfLoadingFiles, setHfLoadingFiles] = useState(false);

  useEffect(() => { loadModels(); }, []);

  const powerPulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (llamaLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(powerPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(powerPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      powerPulse.stopAnimation();
      powerPulse.setValue(1);
    }
  }, [llamaLoading]);

  const activeModel = models.find((m) => m.id === activeModelId);

  // Run memory check when active model or context size changes
  useEffect(() => {
    if (activeModel?.isDownloaded && activeModel.id) {
      checkMemory(activeModel.id);
    }
  }, [activeModel?.id, activeModel?.isDownloaded, inference.contextSize]);

  const memoryStatus = memoryEstimate?.status ?? 'fits';

  // Track if any download is active for this model
  const activeModelDownloading = activeModel ? downloadProgress[activeModel.id] !== undefined : false;


  function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return '';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }

  function formatDownloads(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  }

  async function searchHF() {
    if (!hfQuery.trim()) return;
    setHfSearching(true);
    setHfResults([]);
    try {
      const res = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(hfQuery.trim())}&filter=gguf&limit=20&sort=downloads`,
      );
      const data: HFRepo[] = await res.json();
      setHfResults(data);
    } catch { /* ignore */ } finally {
      setHfSearching(false);
    }
  }

  async function loadRepoFiles(repoId: string) {
    setHfRepo(repoId);
    setHfFiles([]);
    setHfLoadingFiles(true);
    try {
      const res = await fetch(`https://huggingface.co/api/models/${repoId}`);
      const data = await res.json();
      const gguf: HFFile[] = (data.siblings ?? []).filter(
        (f: { rfilename: string }) => f.rfilename.endsWith('.gguf'),
      );
      setHfFiles(gguf);
    } catch { /* ignore */ } finally {
      setHfLoadingFiles(false);
    }
  }

  async function pickFile(file: HFFile) {
    if (!hfRepo) return;
    const url = `https://huggingface.co/${hfRepo}/resolve/main/${file.rfilename}`;
    const name = file.rfilename.replace(/\.gguf$/i, '').replace(/-/g, ' ');
    await addCustomModel(name, url);
    resetHfState();
    setModelSheetView('list');
  }

  function resetHfState() {
    setHfQuery('');
    setHfResults([]);
    setHfRepo(null);
    setHfFiles([]);
  }

  function closeModelSheet() {
    setModelSheetVisible(false);
    setModelSheetView('list');
    resetHfState();
  }

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
    // SAMWELL / MODEL
    modelCard: {
      backgroundColor: colors.surface.low,
      padding: spacing[4],
      gap: spacing[3],
    },
    modelCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    progressBarTrack: {
      height: 4,
      backgroundColor: colors.surface.highest,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: 4,
      backgroundColor: colors.primary.default,
      borderRadius: 2,
    },
    aiActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      backgroundColor: colors.surface.mid,
    },
    modelSheetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: colors.outline.variant,
      gap: spacing[3],
    },
    modelSheetInfo: { flex: 1 },
    // Mode cards
    modeCards: {
      flexDirection: 'row',
      gap: spacing[3],
    },
    modeCard: {
      flex: 1,
      padding: spacing[4],
      gap: spacing[1],
      borderWidth: 1,
      borderColor: colors.surface.highest,
      backgroundColor: colors.surface.low,
    },
    modeCardActive: {
      borderColor: colors.primary.default,
    },
    comingSoonBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing[2],
      paddingVertical: 2,
      backgroundColor: colors.surface.highest,
      marginBottom: spacing[1],
    },
    // HF search
    hfSearchRow: {
      flexDirection: 'row',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingBottom: spacing[3],
    },
    hfInput: {
      flex: 1,
      backgroundColor: colors.surface.mid,
      color: colors.text.primary,
      fontFamily: fontFamily.sans,
      fontSize: 15,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[3],
    },
    hfResultItem: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: colors.outline.variant,
      gap: 2,
    },
    hfFileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: colors.outline.variant,
    },
    hfBackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingBottom: spacing[3],
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

        {/* SAMWELL */}
        <View style={styles.section}>
          <View style={{ gap: spacing[1] }}>
            <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
              SAMWELL
            </ThemedText>
            <ThemedText type="bodySm" color={colors.text.secondary}>
              Your AI reading companion
            </ThemedText>
          </View>

          {/* Mode cards */}
          <View style={styles.modeCards}>
            <Pressable
              style={[styles.modeCard, samwellMode === 'offline' && styles.modeCardActive]}
              onPress={() => setSamwellMode('offline')}
            >
              <ThemedText type="labelSm" color={samwellMode === 'offline' ? colors.primary.default : colors.text.primary}>
                Offline & Private
              </ThemedText>
              <ThemedText type="labelSm" color={colors.text.secondary} style={{ fontSize: 11 }}>
                Runs on your device. No internet.
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.modeCard, samwellMode === 'cloud' && styles.modeCardActive]}
              onPress={() => setSamwellMode('cloud')}
            >
              <View style={styles.comingSoonBadge}>
                <ThemedText type="labelSm" color={colors.text.secondary} style={{ fontSize: 9 }}>
                  COMING SOON
                </ThemedText>
              </View>
              <ThemedText type="labelSm" color={samwellMode === 'cloud' ? colors.primary.default : colors.text.primary}>
                Cloud
              </ThemedText>
              <ThemedText type="labelSm" color={colors.text.secondary} style={{ fontSize: 11 }}>
                Fast inference. No device limits.
              </ThemedText>
            </Pressable>
          </View>

          {samwellMode === 'cloud' ? (
            <ThemedText type="bodySm" color={colors.text.secondary}>
              Cloud support is on the way. For now, wake Samwell up with an offline model below.
            </ThemedText>
          ) : (
            <>
              {/* Active model card */}
              <View style={styles.modelCard}>
                <View style={[styles.modelCardRow, { gap: spacing[3], alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText type="bodyMd" numberOfLines={2}>{activeModel?.name ?? 'No model selected'}</ThemedText>
                    <ThemedText type="labelSm" color={colors.text.secondary}>
                      {activeModel
                        ? activeModel.isDownloaded
                          ? `${formatBytes(activeModel.sizeBytes)} · Downloaded`
                          : `${formatBytes(activeModel.sizeBytes)} · Not downloaded`
                        : 'Tap to choose a model'}
                    </ThemedText>
                    {loadError && (
                      <ThemedText type="labelSm" color="#e53935" numberOfLines={2}>
                        {loadError}
                      </ThemedText>
                    )}
                  </View>
                  <Pressable style={styles.aiActionBtn} onPress={() => setModelSheetVisible(true)}>
                    <ThemedText type="labelSm" color={colors.text.secondary}>
                      CHANGE
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Download progress */}
                {activeModel && downloadProgress[activeModel.id] !== undefined && (
                  <View style={{ gap: spacing[1] }}>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${Math.round((downloadProgress[activeModel.id] ?? 0) * 100)}%` },
                        ]}
                      />
                    </View>
                    <View style={styles.modelCardRow}>
                      <ThemedText type="labelSm" color={colors.text.secondary}>
                        {Math.round((downloadProgress[activeModel.id] ?? 0) * 100)}%
                      </ThemedText>
                      <Pressable onPress={() => cancelDownload(activeModel.id)}>
                        <ThemedText type="labelSm" color="#e53935">
                          CANCEL
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Memory warning */}
                {activeModel?.isDownloaded && memoryStatus !== 'fits' && (
                  <Pressable
                    style={[styles.aiActionBtn, { alignSelf: 'flex-start', backgroundColor: memoryStatus === 'wont_fit' ? '#e5393520' : '#f9731620' }]}
                    onPress={() => setMemoryInfoVisible(true)}
                  >
                    <MemoryStick size={14} color={memoryStatus === 'wont_fit' ? '#e53935' : '#f97316'} />
                    <ThemedText type="labelSm" color={memoryStatus === 'wont_fit' ? '#e53935' : '#f97316'}>
                      {memoryStatus === 'wont_fit' ? 'TOO LARGE' : 'TIGHT'}
                    </ThemedText>
                  </Pressable>
                )}

                {/* Action buttons */}
                {activeModel && !activeModelDownloading && (
                  <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
                    {!activeModel.isDownloaded ? (
                      <Pressable
                        style={[styles.aiActionBtn, isDownloading && { opacity: 0.5 }]}
                        disabled={isDownloading}
                        onPress={async () => {
                          setIsDownloading(true);
                          try { await downloadModel(activeModel.id); } finally { setIsDownloading(false); }
                        }}
                      >
                        <Download size={14} color={colors.primary.default} />
                        <ThemedText type="labelSm" color={colors.primary.default}>
                          DOWNLOAD
                        </ThemedText>
                      </Pressable>
                    ) : (
                      <>
                        <Pressable
                          style={[styles.aiActionBtn, (llamaLoading || isDeleting || (!isLoaded && memoryStatus === 'wont_fit')) && { opacity: 0.5 }]}
                          onPress={isLoaded ? releaseContext : () => useLlamaStore.getState().initContext()}
                          disabled={llamaLoading || isDeleting || (!isLoaded && memoryStatus === 'wont_fit')}
                        >
                          <Animated.View style={llamaLoading ? { opacity: powerPulse } : undefined}>
                            <Power size={14} color={llamaLoading ? colors.primary.default : isLoaded ? '#4caf50' : colors.text.secondary} />
                          </Animated.View>
                          <ThemedText type="labelSm" color={isLoaded ? colors.text.primary : colors.text.secondary}>
                            {isLoaded ? 'SLEEP' : 'WAKEN'}
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          style={[styles.aiActionBtn, (llamaLoading || isDeleting) && { opacity: 0.5 }]}
                          disabled={llamaLoading || isDeleting}
                          onPress={() => setTuneModalVisible(true)}
                        >
                          <SlidersHorizontal size={14} color={colors.text.primary} />
                          <ThemedText type="labelSm" color={colors.text.primary}>
                            TUNE
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          style={[styles.aiActionBtn, (llamaLoading || isDeleting) && { opacity: 0.5 }]}
                          disabled={llamaLoading || isDeleting}
                          onPress={async () => {
                            if (isLoaded) {
                              setIsDeleting(true);
                              try { await releaseContext(); } finally { setIsDeleting(false); }
                            }
                            setConfirmDeleteId(activeModel.id);
                          }}
                        >
                          <Trash2 size={14} color="#e53935" />
                          <ThemedText type="labelSm" color="#e53935">
                            DELETE
                          </ThemedText>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>

            </>
          )}
        </View>

        <View style={styles.divider} />

        {/* TTS */}
        <View style={styles.section}>
          <ThemedText type="labelMd" color={colors.primary.default} style={styles.label}>
            TEXT TO SPEECH
          </ThemedText>

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

      {/* Model picker + HuggingFace search — unified sheet */}
      <Modal
        visible={modelSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModelSheet}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
            onPress={closeModelSheet}
          />
          <KeyboardAvoidingView behavior="padding" style={{ backgroundColor: colors.surface.low, maxHeight: '80%' }}>
            <Pressable onPress={() => {}} style={{ paddingBottom: insets.bottom + spacing[4] }}>
              {/* Handle */}
              <View style={{ width: 40, height: 2, backgroundColor: colors.surface.highest, alignSelf: 'center', marginTop: spacing[2], marginBottom: spacing[3] }} />

              {/* Header */}
              <View style={[styles.modelCardRow, { paddingHorizontal: spacing[4], paddingBottom: spacing[3] }]}>
                {modelSheetView === 'hf' ? (
                  hfRepo ? (
                    <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }} onPress={() => { setHfRepo(null); setHfFiles([]); }}>
                      <ThemedText type="labelSm" color={colors.primary.default}>← BACK</ThemedText>
                      <ThemedText type="headlineSm" numberOfLines={1} style={{ flex: 1 }}>{hfRepo.split('/')[1] ?? hfRepo}</ThemedText>
                    </Pressable>
                  ) : (
                    <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }} onPress={() => { setModelSheetView('list'); resetHfState(); }}>
                      <ThemedText type="labelSm" color={colors.primary.default}>← BACK</ThemedText>
                      <ThemedText type="headlineSm">Find Models</ThemedText>
                    </Pressable>
                  )
                ) : (
                  <ThemedText type="headlineSm">Choose Model</ThemedText>
                )}
                <Pressable onPress={closeModelSheet}>
                  <X size={20} color={colors.text.secondary} />
                </Pressable>
              </View>

              {modelSheetView === 'list' ? (
                /* Model list view */
                <>
                  <FlatList
                    data={models}
                    keyExtractor={(m) => m.id}
                    style={{ maxHeight: 320 }}
                    renderItem={({ item: m }) => (
                      <Pressable
                        style={styles.modelSheetItem}
                        onPress={() => {
                          setActiveModel(m.id);
                          closeModelSheet();
                        }}
                      >
                        <View style={styles.modelSheetInfo}>
                          <ThemedText type="bodyMd">{m.name}</ThemedText>
                          <ThemedText type="labelSm" color={colors.text.secondary}>
                            {formatBytes(m.sizeBytes)}
                            {m.isDownloaded ? ' · Downloaded' : ''}
                          </ThemedText>
                        </View>
                        {m.id === activeModelId && (
                          <ThemedText type="bodyMd" color={colors.primary.default}>✓</ThemedText>
                        )}
                      </Pressable>
                    )}
                  />
                  {/* Find models entry point */}
                  <Pressable
                    style={[styles.modelSheetItem, { borderBottomWidth: 0, gap: spacing[2] }]}
                    onPress={() => setModelSheetView('hf')}
                  >
                    <Search size={14} color={colors.primary.default} />
                    <ThemedText type="labelSm" color={colors.primary.default}>FIND MODELS ON HUGGING FACE</ThemedText>
                  </Pressable>
                </>
              ) : hfRepo ? (
                /* Phase 2: file list */
                hfLoadingFiles ? (
                  <View style={{ alignItems: 'center', padding: spacing[6] }}>
                    <ActivityIndicator color={colors.primary.default} />
                  </View>
                ) : (
                  <FlatList
                    data={hfFiles}
                    keyExtractor={(f) => f.rfilename}
                    style={{ maxHeight: 320 }}
                    renderItem={({ item }) => (
                      <Pressable style={styles.hfFileItem} onPress={() => pickFile(item)}>
                        <ThemedText type="bodyMd" style={{ flex: 1 }} numberOfLines={2}>{item.rfilename}</ThemedText>
                        <ThemedText type="labelSm" color={colors.text.secondary}>{formatBytes(item.size)}</ThemedText>
                      </Pressable>
                    )}
                    ListEmptyComponent={
                      <View style={{ padding: spacing[4] }}>
                        <ThemedText type="bodySm" color={colors.text.secondary}>No GGUF files found in this repo.</ThemedText>
                      </View>
                    }
                  />
                )
              ) : (
                /* Phase 1: HF search */
                <>
                  <View style={styles.hfSearchRow}>
                    <TextInput
                      style={styles.hfInput}
                      placeholder="Search Hugging Face…"
                      placeholderTextColor={colors.text.secondary}
                      value={hfQuery}
                      onChangeText={setHfQuery}
                      onSubmitEditing={searchHF}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                    />
                    <Pressable style={styles.aiActionBtn} onPress={searchHF}>
                      <Search size={14} color={colors.primary.default} />
                      <ThemedText type="labelSm" color={colors.primary.default}>SEARCH</ThemedText>
                    </Pressable>
                  </View>
                  {hfSearching ? (
                    <View style={{ alignItems: 'center', padding: spacing[6] }}>
                      <ActivityIndicator color={colors.primary.default} />
                    </View>
                  ) : (
                    <FlatList
                      data={hfResults}
                      keyExtractor={(r) => r.id}
                      style={{ maxHeight: 280 }}
                      renderItem={({ item }) => (
                        <Pressable style={styles.hfResultItem} onPress={() => loadRepoFiles(item.id)}>
                          <ThemedText type="bodyMd" numberOfLines={1}>{item.id}</ThemedText>
                          <ThemedText type="labelSm" color={colors.text.secondary}>
                            {formatDownloads(item.downloads)} downloads
                          </ThemedText>
                        </Pressable>
                      )}
                      ListEmptyComponent={
                        <View style={{ padding: spacing[4] }}>
                          <ThemedText type="bodySm" color={colors.text.secondary}>Search for GGUF models to get started.</ThemedText>
                        </View>
                      }
                    />
                  )}
                </>
              )}
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Tune performance drawer */}
      <Modal
        visible={tuneModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTuneModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setTuneModalVisible(false)} />
          <View style={{ backgroundColor: colors.surface.low, paddingHorizontal: spacing[6], paddingTop: spacing[4], paddingBottom: spacing[10], gap: spacing[4] }}>
            <View style={{ width: 40, height: 4, backgroundColor: colors.surface.highest, alignSelf: 'center' }} />

            <ThemedText type="bodySm" color={colors.text.secondary}>PERFORMANCE</ThemedText>

            <View style={{ gap: spacing[1] }}>
              <ThemedText type="bodySm" color={colors.text.primary}>Context Window</ThemedText>
              <View style={styles.rateRow}>
                {[2048, 4096, 8192].map((size) => {
                  const active = inference.contextSize === size;
                  return (
                    <Pressable
                      key={size}
                      style={[styles.rateChip, { backgroundColor: colors.surface.mid }, active && styles.rateChipActive]}
                      onPress={() => setInference({ contextSize: size })}
                    >
                      <ThemedText type="labelSm" color={active ? colors.surface.base : colors.text.primary}>
                        {size >= 1024 ? `${size / 1024}K` : String(size)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <ThemedText type="bodySm" color={colors.text.secondary} style={{ fontSize: 11 }}>
                Lower = faster & less RAM. Raise for longer conversations.
              </ThemedText>
            </View>

            <View style={{ gap: spacing[1] }}>
              <ThemedText type="bodySm" color={colors.text.primary}>CPU Threads</ThemedText>
              <View style={styles.rateRow}>
                {[2, 4, 6, 8].map((threads) => {
                  const active = inference.cpuThreads === threads;
                  return (
                    <Pressable
                      key={threads}
                      style={[styles.rateChip, { backgroundColor: colors.surface.mid }, active && styles.rateChipActive]}
                      onPress={() => setInference({ cpuThreads: threads })}
                    >
                      <ThemedText type="labelSm" color={active ? colors.surface.base : colors.text.primary}>
                        {threads}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <ThemedText type="bodySm" color={colors.text.secondary} style={{ fontSize: 11 }}>
                Match your CPU's big cores. 4 is a safe default.
              </ThemedText>
            </View>

            <View style={{ gap: spacing[1] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <ThemedText type="bodySm" color={colors.text.primary}>GPU Offload</ThemedText>
                {!hasGpu && (
                  <ThemedText type="bodySm" color="#f97316" style={{ fontSize: 11 }}>No GPU detected</ThemedText>
                )}
              </View>
              <View style={styles.rateRow}>
                {([
                  { value: 0, label: 'Off' },
                  { value: 99, label: 'Full' },
                ] as const).map(({ value, label }) => {
                  const active = inference.gpuLayers === value;
                  return (
                    <Pressable
                      key={value}
                      style={[styles.rateChip, { backgroundColor: colors.surface.mid }, active && styles.rateChipActive, !hasGpu && !active && { opacity: 0.4 }]}
                      onPress={() => setInference({ gpuLayers: value })}
                      disabled={!hasGpu}
                    >
                      <ThemedText type="labelSm" color={active ? colors.surface.base : colors.text.primary}>
                        {label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <ThemedText type="bodySm" color={colors.text.secondary} style={{ fontSize: 11 }}>
                Offload layers to GPU if supported.
              </ThemedText>
            </View>

            {isLoaded && (
              <ThemedText type="bodySm" color={colors.primary.default}>
                Power down and wake up Samwell to apply changes.
              </ThemedText>
            )}
          </View>
        </View>
      </Modal>

      {/* Confirm delete drawer */}
      <Modal
        visible={confirmDeleteId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmDeleteId(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setConfirmDeleteId(null)} />
          <View style={{ backgroundColor: colors.surface.low, paddingHorizontal: spacing[6], paddingTop: spacing[4], paddingBottom: spacing[10], gap: spacing[4] }}>
            <View style={{ width: 40, height: 4, backgroundColor: colors.surface.highest, alignSelf: 'center' }} />
            <ThemedText type="headlineSm">Delete model file?</ThemedText>
            <ThemedText type="bodySm" color={colors.text.secondary}>
              The model will be removed from your device. You can re-download it later.
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <Pressable style={styles.aiActionBtn} onPress={() => setConfirmDeleteId(null)}>
                <ThemedText type="labelSm" color={colors.text.secondary}>CANCEL</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.aiActionBtn, { backgroundColor: '#e53935' }]}
                onPress={() => {
                  if (confirmDeleteId) deleteModel(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                <ThemedText type="labelSm" color="#fff">DELETE</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* Memory info drawer */}
      <Modal
        visible={memoryInfoVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMemoryInfoVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setMemoryInfoVisible(false)} />
          <View style={{ backgroundColor: colors.surface.low, paddingHorizontal: spacing[6], paddingTop: spacing[4], paddingBottom: spacing[10], gap: spacing[3] }}>
            <View style={{ width: 40, height: 4, backgroundColor: colors.surface.highest, alignSelf: 'center' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <MemoryStick size={18} color={memoryStatus === 'wont_fit' ? '#e53935' : '#f97316'} />
              <ThemedText type="headlineSm">
                {memoryStatus === 'wont_fit' ? 'Too Large' : 'Memory Tight'}
              </ThemedText>
            </View>
            <ThemedText type="bodySm" color={colors.text.secondary}>
              {memoryStatus === 'wont_fit'
                ? 'This model needs more RAM than your device has. Loading it will likely crash the app. Try a smaller or more quantized model.'
                : 'This model may run slowly or fail to wake up. Free up RAM by closing other apps, or try a smaller model.'}
            </ThemedText>
            {memoryEstimate && (
              <View style={{ gap: spacing[1] }}>
                <ThemedText type="labelSm" color={colors.text.secondary}>
                  Estimated: ~{(memoryEstimate.estimatedBytes / 1024 / 1024 / 1024).toFixed(1)} GB
                </ThemedText>
                <ThemedText type="labelSm" color={colors.text.secondary}>
                  Available: ~{(memoryEstimate.availableBytes / 1024 / 1024 / 1024).toFixed(1)} GB
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
