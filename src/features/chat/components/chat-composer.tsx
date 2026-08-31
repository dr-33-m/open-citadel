/**
 * The message box and its one button.
 *
 * The button is send or stop, never both and never neither: while a reply is
 * generating the only useful action is to call it off, so the same corner
 * holds a stop square instead of growing a second control the user has to
 * aim at.
 *
 * The placeholder is the quietest place to say why typing will not work, so
 * it carries the same reason the banner above spells out.
 */
import { Send, Square } from 'lucide-react-native';
import React from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { Touchable } from '@/components/ui/touchable';
import { fontFamily, spacing } from '@/constants/theme';
import type { SamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  /** Stop was tapped and the engine has not wound down yet. */
  isStopping: boolean;
  readiness: SamwellReadiness;
  bottomInset: number;
}

function placeholderFor({ ready, downloaded, cloudUnavailable }: SamwellReadiness): string {
  if (!downloaded) return 'Set up Samwell in Settings…';
  if (cloudUnavailable) return 'Cloud unavailable in this build…';
  if (!ready) return 'Wake up Samwell…';
  return 'Message Samwell…';
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  onStop,
  isGenerating,
  isStopping,
  readiness,
  bottomInset,
}: ChatComposerProps) {
  const [mutedForeground, foreground, primaryForeground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-foreground',
    '--color-primary-foreground',
  ]);

  const canSend = readiness.ready && value.trim().length > 0 && !isGenerating;

  return (
    <View
      className="flex-row items-end gap-2 border-t border-border bg-background px-3 pt-2"
      style={{ paddingBottom: Math.max(bottomInset, spacing[2]) }}
    >
      <TextInput
        className="max-h-[120px] min-h-[40px] flex-1 bg-muted px-3 py-2 text-[15px] text-foreground"
        style={{ fontFamily: fontFamily.sans }}
        placeholder={placeholderFor(readiness)}
        placeholderTextColor={asColor(mutedForeground)}
        value={value}
        onChangeText={onChangeText}
        multiline
        editable={readiness.ready && !isGenerating}
        onSubmitEditing={onSend}
      />

      {isGenerating ? (
        <Touchable
          className={cn(
            'h-10 w-10 items-center justify-center bg-surface-tertiary',
            isStopping && 'opacity-50',
          )}
          disabled={isStopping}
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel="Stop generating"
        >
          <Square size={16} color={asColor(foreground)} fill={asColor(foreground)} />
        </Touchable>
      ) : (
        <Touchable
          className={cn(
            'h-10 w-10 items-center justify-center bg-primary',
            !canSend && 'bg-surface-tertiary',
          )}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Send
            size={16}
            color={canSend ? asColor(primaryForeground) : asColor(mutedForeground)}
          />
        </Touchable>
      )}
    </View>
  );
}
