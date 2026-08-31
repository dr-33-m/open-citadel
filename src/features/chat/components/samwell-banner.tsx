/**
 * Why you cannot talk to Samwell yet, and the one action that fixes it.
 *
 * Renders nothing in the ordinary case. The states are ordered by how early
 * they stop you: no model at all comes before a model that failed to load,
 * which comes before one that simply is not awake — each is a precondition of
 * the next, so testing them in any other order shows the wrong sentence.
 */
import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import type { SamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

interface SamwellBannerProps {
  readiness: SamwellReadiness;
  onOpenSettings: () => void;
}

export function SamwellBanner({ readiness, onOpenSettings }: SamwellBannerProps) {
  const [mutedForeground, destructive] = useCSSVariable([
    '--color-muted-foreground',
    '--color-destructive',
  ]);

  const { ready, downloaded, loading, loadError, initContext, mode, cloudUnavailable } = readiness;

  if (cloudUnavailable) {
    return <Banner message="Grand Maester Samwell is not set up in this build yet." color={asColor(mutedForeground)} />;
  }

  // Cloud is either configured or it is not; there is nothing local to wake.
  if (mode === 'cloud') return null;

  if (!downloaded) {
    return (
      <Banner
        message="Samwell needs a model to run. Set one up in Settings."
        color={asColor(mutedForeground)}
        action={{ label: 'SET UP SAMWELL', onPress: onOpenSettings }}
      />
    );
  }

  if (loadError) {
    return (
      <Banner
        message={loadError}
        color={asColor(destructive)}
        action={{ label: 'RETRY', onPress: initContext, disabled: loading }}
      />
    );
  }

  if (!ready && !loading) {
    return (
      <Banner
        message="Samwell is offline. Wake him up to chat."
        color={asColor(mutedForeground)}
        action={{ label: 'WAKE UP', onPress: initContext, disabled: loading }}
      />
    );
  }

  return null;
}

function Banner({
  message,
  color,
  action,
}: {
  message: string;
  color: string | undefined;
  action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  const primaryForeground = useCSSVariable('--color-primary-foreground');

  return (
    <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
      <ThemedText type="bodySm" color={color}>
        {message}
      </ThemedText>
      {action ? (
        <Touchable
          className={cn('self-start bg-primary px-3 py-1', action.disabled && 'opacity-50')}
          disabled={action.disabled}
          onPress={action.onPress}
          accessibilityRole="button"
        >
          <ThemedText type="labelSm" color={asColor(primaryForeground)}>
            {action.label}
          </ThemedText>
        </Touchable>
      ) : null}
    </View>
  );
}
