import React from 'react';

import { AccountCard } from '@/features/settings/components/account-card';
import { DisplayNameCard } from '@/features/settings/components/display-name-card';
import { SettingsSection } from '@/features/settings/components/settings-section';

/**
 * Who you are, in two parts and in this order.
 *
 * The display name first because everyone has one and it needs nothing; the
 * account under it because it is optional and most of what it unlocks is
 * elsewhere. Each card owns its own state, so editing a name does not draw
 * the account and signing in does not draw the name.
 */
export function ProfileSection() {
  return (
    <SettingsSection label="PROFILE" divider={false} className="mt-6 gap-4">
      <DisplayNameCard />
      <AccountCard />
    </SettingsSection>
  );
}
