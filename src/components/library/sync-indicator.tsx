import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Loader } from '@/components/ui/loader';
import type { SyncState } from '@/stores/books';
import { asColor } from '@/utils/colors';

/**
 * What the scan is doing, in the two words it takes to say it.
 *
 * A pure function and not a ternary in JSX because there are four phases, each
 * with a counted and an uncounted form, and written inline that is a five-deep
 * conditional nobody can read — which is what it was.
 *
 * The counts are only shown once there is a total to count against. A scan
 * that has not finished listing the folder knows how many files it has walked
 * past and not how many there are, and "SCANNING 7/0" is worse than saying
 * nothing about the number at all.
 */
function stepLabel(sync: SyncState): string {
  const counted = (verb: string) =>
    sync.total > 0 ? `${verb} ${sync.done}/${sync.total}` : `${verb}…`;

  switch (sync.phase) {
    case 'scanning':
      return counted('SCANNING');
    case 'importing':
      return counted('IMPORTING');
    case 'preparing':
      return counted('PREPARING');
    case 'finalizing':
      return 'FINALIZING…';
    default:
      return 'SYNCING BOOKS…';
  }
}

/**
 * The scan, while it runs: the loader, and the step underneath it.
 *
 * ## Why the loader is above the step and not beside it
 *
 * It was beside it, and side by side the two read as one line of chrome — a
 * spinner acting as a bullet point for a label. Stacked, the loader is the
 * thing and the step is a caption on it, which is what they actually are: the
 * animation says work is happening at all, the step says which part of it.
 * That is also the only arrangement that survives the pull, where the pair sit
 * in a gap the reader opened and there is height to use but no width.
 *
 * ## Why `bar-cascade`
 *
 * PanelUI's loaders are interchangeable by design, so this is a house choice
 * and not a per-screen one: five bars, squared off, matching an app that has
 * no rounded corners anywhere else. It replaced `Spinner`, whose circle was
 * the one round thing on the Library.
 *
 * ## Shared on purpose
 *
 * The inline row and the pull-to-sync header draw the same thing, because they
 * ARE the same thing — one scan, reported from two places. Two copies is how
 * the phase labels drift, which this codebase has already paid for twice.
 */
export const SyncIndicator = React.memo(function SyncIndicator({
  sync,
  label,
  className,
}: {
  sync: SyncState;
  /**
   * Said instead of the step, for the moment before a scan exists: the pull
   * asking to be let go of. The phase label is the right answer everywhere
   * else, so this is an override and not a required prop.
   */
  label?: string;
  /** Spacing for where it sits. The stack itself never varies. */
  className?: string;
}) {
  // Only the caption needs a literal: `ThemedText` takes a colour, while the
  // loader resolves the token itself.
  const mutedForeground = useCSSVariable('--color-muted-foreground');

  return (
    <View className={className}>
      <View className="items-center gap-2">
        {/* Gold: a scan is Samwell's work on your shelf, and the gold is what
            the app already uses to say so. */}
        <Loader variant="bar-cascade" size="sm" color="--color-primary" label="Syncing books" />
        <ThemedText type="labelSm" color={asColor(mutedForeground)}>
          {label ?? stepLabel(sync)}
        </ThemedText>
      </View>
    </View>
  );
});
