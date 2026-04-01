import { eq } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';

export type AppTheme = 'dark' | 'light';

type SettingsState = {
  username: string;
  theme: AppTheme;
  ttsVoice: string | null;
  ttsVoiceLanguage: string | null;
  ttsRate: number;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setUsername: (name: string) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
  setTtsVoice: (voice: string | null, language?: string | null) => Promise<void>;
  setTtsRate: (rate: number) => Promise<void>;
};

async function saveSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

export const useSettingsStore = create<SettingsState>((set) => ({
  username: '',
  theme: 'dark',
  ttsVoice: null,
  ttsVoiceLanguage: null,
  ttsRate: 1.0,
  isLoaded: false,

  loadSettings: async () => {
    const rows = await db.select().from(appSettings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    set({
      username: map['username'] ?? '',
      theme: (map['theme'] as AppTheme | undefined) ?? 'dark',
      ttsVoice: map['ttsVoice'] ?? null,
      ttsVoiceLanguage: map['ttsVoiceLanguage'] ?? null,
      ttsRate: parseFloat(map['ttsRate'] ?? '1'),
      isLoaded: true,
    });
  },

  setUsername: async (name: string) => {
    await saveSetting('username', name);
    set({ username: name });
  },

  setTheme: async (theme: AppTheme) => {
    await saveSetting('theme', theme);
    set({ theme });
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
