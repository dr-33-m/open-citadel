import React from 'react';
import { View } from 'react-native';

import type { EngineMode } from '@/components/settings/engine-info-sheet';
import { PodcastSettings } from '@/features/podcasts/components/podcast-settings-section';
import { SamwellMemoryPane } from '@/features/samwell-memory/components/samwell-memory-pane';
import { AccountCard } from '@/features/settings/components/account-card';
import { DisplayNameCard } from '@/features/settings/components/display-name-card';
import { SamwellSection } from '@/features/settings/components/samwell-section';
import type { SettingsPane } from '@/features/settings/utils/panes';
import { TtsSettingsPanel } from '@/features/tts/components/tts-settings-panel';

type SettingsPaneBodyProps = {
  pane: SettingsPane;
  /** Samwell's page: where it sends someone with no account yet. */
  onRequestAccount: () => void;
  /** Samwell's page: the panel a deep link asked for. */
  initialMode?: EngineMode;
};

/** What one page of Settings holds. */
export function SettingsPaneBody({ pane, onRequestAccount, initialMode }: SettingsPaneBodyProps) {
  switch (pane) {
    case 'profile':
      return (
        // The display name first because everyone has one and it needs
        // nothing; the account under it because it is optional.
        <View className="gap-4">
          <DisplayNameCard />
          <AccountCard />
        </View>
      );
    case 'samwell':
      return <SamwellSection onRequestAccount={onRequestAccount} initialMode={initialMode} />;
    case 'voice':
      return <TtsSettingsPanel warm />;
    case 'podcasts':
      return <PodcastSettings />;
    case 'memory':
      return <SamwellMemoryPane />;
  }
}
