import { eq } from 'drizzle-orm';
import { create } from 'zustand';
import { CLOUD_MODEL_CATALOG, DEFAULT_CLOUD_MODEL_ID, type CloudModelOption, type CloudUsageState } from 'samwell-shared';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { db } from '@/db/client';
import { appSettings } from '@/db/schema';

export type AppTheme = 'dark' | 'light';
export type SamwellMode = 'offline' | 'cloud';

/**
 * How hard the cloud model is asked to think, passed straight through to
 * OpenRouter's reasoning config. `'off'` disables reasoning entirely; the
 * levels map to the provider's own effort scale. `'medium'` is the default,
 * which also means "each model keeps its own default depth" server-side.
 */
export type CloudReasoningEffort = 'off' | 'low' | 'medium' | 'high';

export const CLOUD_REASONING_EFFORTS: CloudReasoningEffort[] = ['off', 'low', 'medium', 'high'];

/**
 * Cap on the tokens a cloud reply may spend. Longer is kinder to literary
 * analysis, shorter is cheaper and quicker; the reply itself still ends when
 * Samwell is done.
 */
export const CLOUD_MAX_COMPLETION_TOKENS = [600, 1200, 2400] as const;

function isCloudReasoningEffort(value: unknown): value is CloudReasoningEffort {
  return CLOUD_REASONING_EFFORTS.includes(value as CloudReasoningEffort);
}

type SettingsState = {
  username: string;
  theme: AppTheme;
  samwellMode: SamwellMode;
  cloudBaseUrl: string;
  cloudModelId: string;
  cloudReasoningEffort: CloudReasoningEffort;
  cloudMaxCompletionTokens: number;
  cloudDeviceId: string | null;
  cloudUsage: CloudUsageState | null;
  cloudUsageError: string | null;
  cloudModels: CloudModelOption[];
  cloudModelsError: string | null;
  ttsVoice: string | null;
  ttsVoiceLanguage: string | null;
  ttsRate: number;  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setUsername: (name: string) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
  setSamwellMode: (mode: SamwellMode) => Promise<void>;
  setCloudModelId: (modelId: string) => Promise<void>;
  setCloudReasoningEffort: (effort: CloudReasoningEffort) => Promise<void>;
  setCloudMaxCompletionTokens: (tokens: number) => Promise<void>;
  getCloudDeviceId: () => Promise<string>;
  loadCloudUsage: () => Promise<void>;
  loadCloudModels: () => Promise<void>;
  setTtsVoice: (voice: string | null, language?: string | null) => Promise<void>;
  setTtsRate: (rate: number) => Promise<void>;
};


async function saveSetting(key: string, value: string) {
  db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}

function createDeviceId(): string {
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function defaultCloudBaseUrl(): string {
  return SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  username: '',
  theme: 'dark',
  samwellMode: 'offline',
  cloudBaseUrl: defaultCloudBaseUrl(),
  cloudModelId: DEFAULT_CLOUD_MODEL_ID,
  cloudReasoningEffort: 'medium',
  cloudMaxCompletionTokens: 1200,
  cloudDeviceId: null,
  cloudUsage: null,
  cloudUsageError: null,
  cloudModels: CLOUD_MODEL_CATALOG,
  cloudModelsError: null,
  ttsVoice: null,
  ttsVoiceLanguage: null,
  ttsRate: 1.0,  isLoaded: false,

  loadSettings: async () => {
    const rows = await db.select().from(appSettings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    let cloudDeviceId = map['cloud.deviceId'] ?? null;
    if (!cloudDeviceId) {
      cloudDeviceId = createDeviceId();
      await saveSetting('cloud.deviceId', cloudDeviceId);
    }

    set({
      username: map['username'] ?? '',
      theme: (map['theme'] as AppTheme | undefined) ?? 'dark',
      samwellMode: (map['samwell.mode'] as SamwellMode | undefined) ?? 'offline',
      cloudBaseUrl: defaultCloudBaseUrl(),
      cloudModelId: map['cloud.modelId'] ?? DEFAULT_CLOUD_MODEL_ID,
      cloudReasoningEffort: isCloudReasoningEffort(map['cloud.reasoningEffort'])
        ? map['cloud.reasoningEffort']
        : 'medium',
      cloudMaxCompletionTokens: CLOUD_MAX_COMPLETION_TOKENS.includes(
        Number(map['cloud.maxCompletionTokens']) as (typeof CLOUD_MAX_COMPLETION_TOKENS)[number],
      )
        ? Number(map['cloud.maxCompletionTokens'])
        : 1200,
      cloudDeviceId,
      ttsVoice: map['ttsVoice'] ?? null,
      ttsVoiceLanguage: map['ttsVoiceLanguage'] ?? null,
      ttsRate: parseFloat(map['ttsRate'] ?? '1'),      isLoaded: true,
    });
  },

  setUsername: async (name: string) => {
    await saveSetting('username', name);
    set({ username: name });
  },

  setTheme: async (theme: AppTheme) => {
    // State first, persist after. A theme flip is the direct response to a tap
    // and must not wait on a SQLite write to land — the bridge in
    // `app/_layout.tsx` reacts to this `set`, and a failed write only costs the
    // choice its persistence across a restart, which is silent and recoverable.
    set({ theme });
    void saveSetting('theme', theme);
  },

  setSamwellMode: async (mode: SamwellMode) => {
    await saveSetting('samwell.mode', mode);
    set({ samwellMode: mode });
    /*
     * Switching to cloud is the moment the server's model list starts to
     * matter, and the moment a device is most likely to be holding a stale
     * one. Fire and forget: the list already has a value, so a failed refresh
     * leaves the picker on what it had rather than emptying it.
     */
    if (mode === 'cloud') void get().loadCloudModels();
  },

  setCloudModelId: async (modelId: string) => {
    await saveSetting('cloud.modelId', modelId);
    set({ cloudModelId: modelId });
  },

  setCloudReasoningEffort: async (effort) => {
    await saveSetting('cloud.reasoningEffort', effort);
    set({ cloudReasoningEffort: effort });
  },

  setCloudMaxCompletionTokens: async (tokens) => {
    await saveSetting('cloud.maxCompletionTokens', String(tokens));
    set({ cloudMaxCompletionTokens: tokens });
  },

  getCloudDeviceId: async () => {
    const existing = get().cloudDeviceId;
    if (existing) return existing;

    const row = db.select().from(appSettings).where(eq(appSettings.key, 'cloud.deviceId')).get();
    if (row?.value) {
      set({ cloudDeviceId: row.value });
      return row.value;
    }

    const next = createDeviceId();
    await saveSetting('cloud.deviceId', next);
    set({ cloudDeviceId: next });
    return next;
  },

  loadCloudUsage: async () => {
    const { cloudBaseUrl, getCloudDeviceId } = get();
    if (!cloudBaseUrl) {
      set({ cloudUsage: null, cloudUsageError: 'Samwell Cloud is not configured for this build.' });
      return;
    }

    try {
      const deviceId = await getCloudDeviceId();
      const res = await fetch(`${cloudBaseUrl}/usage`, {
        headers: { 'x-samwell-device-id': deviceId },
      });
      if (!res.ok) throw new Error(`Usage request failed (${res.status})`);
      const usage = (await res.json()) as CloudUsageState;
      set({ cloudUsage: usage, cloudUsageError: null });
    } catch (err) {
      set({
        cloudUsageError: err instanceof Error ? err.message : 'Could not load cloud usage.',
      });
    }
  },

  loadCloudModels: async () => {
    const { cloudBaseUrl, cloudModelId } = get();
    if (!cloudBaseUrl) return;

    try {
      const res = await fetch(`${cloudBaseUrl}/models`);
      if (!res.ok) throw new Error(`Models request failed (${res.status})`);
      const data = (await res.json()) as { models: CloudModelOption[]; defaultModelId: string };
      if (Array.isArray(data.models) && data.models.length > 0) {
        set({ cloudModels: data.models, cloudModelsError: null });

        // A model retired on the server must not keep being requested by a
        // device that still holds its ID: fall back to what the server now
        // considers the default, and persist the healing so it sticks.
        if (!data.models.some((m) => m.id === cloudModelId)) {
          await get().setCloudModelId(data.defaultModelId);
        }
      }
    } catch (err) {
      set({
        cloudModelsError: err instanceof Error ? err.message : 'Could not load cloud models.',
      });
    }
  },

  setTtsVoice: async (voice: string | null, language: string | null = null) => {
    if (voice === null) {
      await db.delete(appSettings).where(eq(appSettings.key, 'ttsVoice'));
      await db.delete(appSettings).where(eq(appSettings.key, 'ttsVoiceLanguage'));
    } else {
      await saveSetting('ttsVoice', voice);
      if (language) await saveSetting('ttsVoiceLanguage', language);
    }
    set({ ttsVoice: voice, ttsVoiceLanguage: language });
  },

  setTtsRate: async (rate: number) => {
    await saveSetting('ttsRate', String(rate));
    set({ ttsRate: rate });
  },

}));
