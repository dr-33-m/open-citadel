import { eq } from 'drizzle-orm';
import { create } from 'zustand';

import { SAMWELL_CLOUD_BASE_URL } from '@/constants/samwell-cloud';
import { db } from '@/db/client';
import { appSettings } from '@/db/schema';
import { decideOnboarding } from '@/utils/onboarding-gate';

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

/**
 * Whether the first-run introduction has been dealt with.
 *
 * `pending` on a fresh install and after nothing else. Both doors on the
 * welcome screen close it: finishing the concierge conversation, and choosing
 * to tinker around. There is no third value for "part way through" because
 * the conversation itself is persisted as a chat session and resumes on its
 * own, so where somebody got to is a question that already has an answer
 * somewhere better than here.
 */
export type OnboardingState = 'pending' | 'done';

type SettingsState = {
  username: string;
  theme: AppTheme;
  /**
   * Read before the first paint, like everything else here: `_layout` awaits
   * `loadSettings()` behind the splash, so `app/index` can branch on this
   * without a frame of the Library showing first.
   */
  onboarding: OnboardingState;
  samwellMode: SamwellMode;
  cloudBaseUrl: string;
  /**
   * The model the reader picked, or null if they never have.
   *
   * Nullable so "not chosen yet" is a state rather than being impersonated by
   * the catalogue's first entry. It used to default to that entry, which is
   * the cheapest model in the cheapest tier - so an Archmaester's very first
   * conversation ran on a flash model unless they went looking, and nothing
   * could tell that apart from a deliberate choice to economise. Null lets
   * `healSelectedModel` adopt the plan's own default exactly once.
   *
   * Every request treats null as "unspecified" and the server answers with
   * the plan's default, so nothing has to wait for the heal.
   */
  cloudModelId: string | null;
  cloudThinkingBudget: CloudThinkingBudget;
  ttsVoice: string | null;
  ttsVoiceLanguage: string | null;
  ttsRate: number;  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setUsername: (name: string) => Promise<void>;
  /** Closes the first run. Called by both doors on the welcome screen. */
  finishOnboarding: () => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
  setSamwellMode: (mode: SamwellMode) => Promise<void>;
  setCloudModelId: (modelId: string) => Promise<void>;
  setCloudThinkingBudget: (budget: CloudThinkingBudget) => Promise<void>;
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
  // Assumed done until the read says otherwise, so a failure to load settings
  // strands nobody on a welcome screen they have already been through.
  onboarding: 'done',
  samwellMode: 'offline',
  cloudBaseUrl: defaultCloudBaseUrl(),
  cloudModelId: null,
  cloudThinkingBudget: 'medium',
  ttsVoice: null,
  ttsVoiceLanguage: null,
  ttsRate: 1.0,  isLoaded: false,

  loadSettings: async () => {
    const rows = await db.select().from(appSettings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    /*
     * Whether the first run is still ahead of them. See `decideOnboarding`,
     * which holds the reasoning and is tested against the case that matters:
     * somebody who has been reading for months updating to this build.
     */
    const gate = decideOnboarding({
      stored: map['onboarding.state'],
      booksDirectoryUri: map['booksDirectoryUri'],
    });

    set({
      username: map['username'] ?? '',
      theme: (map['theme'] as AppTheme | undefined) ?? 'dark',
      onboarding: gate.state,
      samwellMode: (map['samwell.mode'] as SamwellMode | undefined) ?? 'offline',
      cloudBaseUrl: defaultCloudBaseUrl(),
      cloudModelId: map['cloud.modelId'] ?? null,
      cloudThinkingBudget: migrateThinkingBudget(
        map['cloud.thinkingBudget'] ?? map['cloud.reasoningEffort'],
      ),
      ttsVoice: map['ttsVoice'] ?? null,
      ttsVoiceLanguage: map['ttsVoiceLanguage'] ?? null,
      ttsRate: parseFloat(map['ttsRate'] ?? '1'),      isLoaded: true,
    });

    /*
     * Written down once, so it stops being a question.
     *
     * After the `set` and not awaited by it: nothing on screen is waiting for
     * this, and a lost write costs one more pass through the same harmless
     * derivation on the next launch.
     */
    if (gate.record) {
      void saveSetting('onboarding.state', gate.state);
    }
  },

  setUsername: async (name: string) => {
    await saveSetting('username', name);
    set({ username: name });
  },

  finishOnboarding: async () => {
    // State first, write after, the same order `setTheme` uses and for the
    // same reason: this is the direct response to a tap that navigates, and it
    // must not wait on SQLite. A lost write costs one extra welcome screen.
    set({ onboarding: 'done' });
    await saveSetting('onboarding.state', 'done');
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
  },

  setCloudModelId: async (modelId: string) => {
    await saveSetting('cloud.modelId', modelId);
    set({ cloudModelId: modelId });
  },

  setCloudThinkingBudget: async (budget) => {
    await saveSetting('cloud.thinkingBudget', budget);
    set({ cloudThinkingBudget: budget });
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
