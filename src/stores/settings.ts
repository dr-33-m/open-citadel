import { eq } from 'drizzle-orm';
import { create } from 'zustand';

import { db } from '@/db/client';
import { appSettings } from '@/db/schema';

export type AppTheme = 'dark' | 'light';

type SettingsState = {
  username: string;
  theme: AppTheme;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setUsername: (name: string) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
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
  isLoaded: false,

  loadSettings: async () => {
    const rows = await db.select().from(appSettings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    set({
      username: map['username'] ?? '',
      theme: (map['theme'] as AppTheme | undefined) ?? 'dark',
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
}));
