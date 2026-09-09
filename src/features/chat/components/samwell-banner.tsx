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

import { LogIn, Power, RefreshCw, Settings, type LucideIcon } from '@/components/icons';
import { SamwellText } from '@/components/samwell-text';
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

  const { ready, downloaded, loading, loadError, initContext, mode, cloudBlocker } = readiness;

  // Both gated on cloud mode: `cloudBlocker` names a missing account even in
  // offline mode now (Compass needs that), and offline chat does not care.
  if (mode === 'cloud' && cloudBlocker === 'notConfigured') {
    return <Banner message="Grand Maester Samwell is not set up in this build yet." color={asColor(mutedForeground)} />;
  }

  if (mode === 'cloud' && cloudBlocker === 'needsAccount') {
    return (
      <Banner
        message="Grand Maester Samwell works with your Cloud Account. Sign in to talk to him."
        color={asColor(mutedForeground)}
        action={{ label: 'SIGN IN', icon: LogIn, onPress: onOpenSettings }}
      />
    );
  }

  if (mode === 'cloud' && cloudBlocker === 'needsPlan') {
    return (
      <Banner
        message="Choose a plan to talk with Grand Maester Samwell."
        color={asColor(mutedForeground)}
        action={{ label: 'SEE PLANS', icon: Settings, onPress: onOpenSettings }}
      />
    );
  }

  // Past the two branches above, cloud has nothing left to report: there is no
  // local model to wake and no local failure to explain.
  if (mode === 'cloud') return null;

  if (!downloaded) {
    return (
      <Banner
        message="Samwell needs a model to run. Set one up in Settings."
        color={asColor(mutedForeground)}
        action={{ label: 'SET UP SAMWELL', icon: Settings, onPress: onOpenSettings }}
      />
    );
  }

  if (loadError) {
    return (
      <Banner
        message={loadError}
        color={asColor(destructive)}
        action={{ label: 'RETRY', icon: RefreshCw, onPress: initContext, disabled: loading }}
      />
    );
  }

  if (!ready && !loading) {
    return (
      <Banner
        message="Samwell is offline. Wake him up to chat."
        color={asColor(mutedForeground)}
        action={{ label: 'WAKE UP', icon: Power, onPress: initContext, disabled: loading }}
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
  action?: { label: string; onPress: () => void; disabled?: boolean; icon?: LucideIcon };
}) {
  const primaryForeground = useCSSVariable('--color-primary-foreground');

  return (
    <View className="m-3 gap-2 border border-surface-tertiary bg-muted p-3">
      {/* His name in gold wherever it lands in the sentence. `color` still
          drives the rest of the line, so an error banner stays destructive
          around it. */}
      <SamwellText type="bodySm" color={color}>
        {message}
      </SamwellText>
      {action ? (
        <Touchable
          className={cn('self-start bg-primary px-3 py-1', action.disabled && 'opacity-50')}
          disabled={action.disabled}
          onPress={action.onPress}
          accessibilityRole="button"
        >
          {/* The same 14pt mark the rest of the app's buttons lead with. */}
          <View className="flex-row items-center gap-2">
            {action.icon ? <action.icon size={14} color={asColor(primaryForeground)} /> : null}
            <ThemedText type="labelSm" color={asColor(primaryForeground)}>
              {action.label}
            </ThemedText>
          </View>
        </Touchable>
      ) : null}
    </View>
  );
}
