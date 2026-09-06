import { eq } from 'drizzle-orm';
import { create } from 'zustand';
import { CLOUD_MODEL_CATALOG, DEFAULT_CLOUD_MODEL_ID, type CloudModelOption, type CloudUsageState } from 'samwell-shared';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { cloudHeaders } from '@/services/cloud-identity';
import { db } from '@/db/client';
import { appSettings } from '@/db/schema';

export type AppTheme = 'dark' | 'light';
export type SamwellMode = 'offline' | 'cloud';

/**
 * How much room Samwell is given to think on the cloud, in plain terms rather
 * than token counts.
 *
 * One knob, three levels. Each one sets both how hard the model reasons *and*
 * how much of a reply it may write afterwards, coupled server-side so a deep
 * think can never spend the whole budget and leave nothing for the answer —
 * which is what produced the "Samwell got stuck mid-response" report. The
 * server owns the mapping to real token limits; the app only ever sends the
 * word.
 */
export type CloudThinkingBudget = 'low' | 'medium' | 'high';

export const CLOUD_THINKING_BUDGETS: CloudThinkingBudget[] = ['low', 'medium', 'high'];

function isCloudThinkingBudget(value: unknown): value is CloudThinkingBudget {
  return CLOUD_THINKING_BUDGETS.includes(value as CloudThinkingBudget);
}

/**
 * The thinking budget from whatever an older build persisted.
 *
 * This setting used to be a four-way reasoning effort (`off`/`low`/`medium`/
 * `high`) alongside a separate response-length cap. `off` folds into `low`
 * (the floor now always reasons a little), and the response cap is gone.
 */
function migrateThinkingBudget(raw: string | undefined): CloudThinkingBudget {
  if (isCloudThinkingBudget(raw)) return raw;
  if (raw === 'off') return 'low';
  return 'medium';
}

type SettingsState = {
  username: string;
  theme: AppTheme;
  samwellMode: SamwellMode;
  cloudBaseUrl: string;
  cloudModelId: string;
  cloudThinkingBudget: CloudThinkingBudget;
  cloudUsage: CloudUsageState | null;
  cloudUsageError: string | null;
  /** A usage read is in flight. The panel shows it instead of REFRESH. */
  cloudUsageLoading: boolean;
  cloudModels: CloudModelOption[];
  cloudModelsError: string | null;
  /**
   * The catalogue is being read from the server.
   *
   * Which model is active cannot be answered until it lands, and "Choose a
   * model" is an answer — the wrong one, given nobody has been asked to
   * choose anything. The panel shows the wait instead.
   */
  cloudModelsLoading: boolean;
  ttsVoice: string | null;
  ttsVoiceLanguage: string | null;
  ttsRate: number;  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setUsername: (name: string) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
  setSamwellMode: (mode: SamwellMode) => Promise<void>;
  setCloudModelId: (modelId: string) => Promise<void>;
  setCloudThinkingBudget: (budget: CloudThinkingBudget) => Promise<void>;
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

function defaultCloudBaseUrl(): string {
  return SAMWELL_CLOUD_BASE_URL.trim().replace(/\/+$/, '');
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  username: '',
  theme: 'dark',
  samwellMode: 'offline',
  cloudBaseUrl: defaultCloudBaseUrl(),
  cloudModelId: DEFAULT_CLOUD_MODEL_ID,
  cloudThinkingBudget: 'medium',
  cloudUsage: null,
  cloudUsageError: null,
  cloudUsageLoading: false,
  cloudModels: CLOUD_MODEL_CATALOG,
  cloudModelsError: null,
  cloudModelsLoading: false,
  ttsVoice: null,
  ttsVoiceLanguage: null,
  ttsRate: 1.0,  isLoaded: false,

  loadSettings: async () => {
    const rows = await db.select().from(appSettings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    set({
      username: map['username'] ?? '',
      theme: (map['theme'] as AppTheme | undefined) ?? 'dark',
      samwellMode: (map['samwell.mode'] as SamwellMode | undefined) ?? 'offline',
      cloudBaseUrl: defaultCloudBaseUrl(),
      cloudModelId: map['cloud.modelId'] ?? DEFAULT_CLOUD_MODEL_ID,
      cloudThinkingBudget: migrateThinkingBudget(
        map['cloud.thinkingBudget'] ?? map['cloud.reasoningEffort'],
      ),
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

  setCloudThinkingBudget: async (budget) => {
    await saveSetting('cloud.thinkingBudget', budget);
    set({ cloudThinkingBudget: budget });
  },

  loadCloudUsage: async () => {
    const { cloudBaseUrl } = get();
    if (!cloudBaseUrl) {
      set({ cloudUsage: null, cloudUsageError: 'Samwell Cloud is not configured for this build.' });
      return;
    }

    set({ cloudUsageLoading: true });
    try {
      const res = await fetch(`${cloudBaseUrl}/usage`, {
        headers: await cloudHeaders(),
      });
      if (!res.ok) throw new Error(`Usage request failed (${res.status})`);
      const usage = (await res.json()) as CloudUsageState;
      set({ cloudUsage: usage, cloudUsageError: null });
    } catch (err) {
      // `NotSignedIn` reads correctly as it stands ("Sign in to use Grand
      // Maester Samwell"), so it needs no special case here: the panel draws
      // whatever this says in place of the bars.
      set({
        cloudUsage: null,
        cloudUsageError: err instanceof Error ? err.message : 'Could not load cloud usage.',
      });
    } finally {
      set({ cloudUsageLoading: false });
    }
  },

  loadCloudModels: async () => {
    const { cloudBaseUrl, cloudModelId } = get();
    if (!cloudBaseUrl) return;

    set({ cloudModelsLoading: true });
    try {
      const res = await fetch(`${cloudBaseUrl}/models`);
      if (!res.ok) throw new Error(`Models request failed (${res.status})`);
      const data = (await res.json()) as { models: CloudModelOption[]; defaultModelId: string };
      if (Array.isArray(data.models) && data.models.length > 0) {
        /*
         * The list and the ID land in ONE `set`, and that is the whole point.
         *
         * A model retired on the server must not keep being requested by a
         * device that still holds its ID, so it falls back to the server's
         * default. That healing used to happen after the list had already
         * been published, and behind an `await` on a SQLite write — which
         * left a window where the store held the new catalogue and an ID
         * missing from it. Anything doing `models.find(m => m.id === id)`
         * during that window got `undefined`, and the settings panel read
         * that as "Choose a model" and said so, about a choice nobody had
         * been asked to make.
         *
         * Writing both at once means the pair is never observably out of
         * step. The persistence is fire-and-forget after the fact: losing it
         * costs the healing its memory across a restart, where the next
         * refresh does it again, and that is worth less than the flash.
         */
        const healed = data.models.some((m) => m.id === cloudModelId)
          ? cloudModelId
          : data.defaultModelId;

        set({ cloudModels: data.models, cloudModelsError: null, cloudModelId: healed });
        if (healed !== cloudModelId) void saveSetting('cloud.modelId', healed);
      }
    } catch (err) {
      set({
        cloudModelsError: err instanceof Error ? err.message : 'Could not load cloud models.',
      });
    } finally {
      set({ cloudModelsLoading: false });
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
