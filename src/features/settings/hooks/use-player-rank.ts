import React from 'react';

import { desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { compassGoals } from '@/db/schema';
import { useScreenSettled } from '@/navigation/use-screen-settled';

export type PlayerRank = 'A' | 'B' | 'C';

/**
 * The letter rank shown beside the display name — earned through archived
 * Compass goals, so it is a read, not a subscription. Settle-gated: the DB
 * has no place in the drawer's rise (see the hook).
 */
export function usePlayerRank(): PlayerRank | null {
  const settled = useScreenSettled();
  const [rank, setRank] = React.useState<PlayerRank | null>(null);

  React.useEffect(() => {
    if (!settled) return;
    const row = db
      .select({ rank: compassGoals.rank })
      .from(compassGoals)
      .where(eq(compassGoals.status, 'archived'))
      .orderBy(desc(compassGoals.completedAt))
      .limit(1)
      .get();
    setRank((row?.rank as PlayerRank | undefined) ?? null);
  }, [settled]);

  return rank;
}
