import React from 'react';
import { View } from 'react-native';

import { Info } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Alert } from '@/components/ui/alert';
import { Sheet } from '@/components/ui/sheet';
import { useThemeTokens } from '@/hooks/use-theme-tokens';

/** What an info sheet says: the thing's kind, what it is, and what is worth knowing. */
export type InfoContent = {
  /** The kicker over the title, in gold: "CLOUD", "GOOGLE". */
  label: string;
  title: string;
  /** One line under the title, saying what the thing is like. */
  line?: string;
  points: string[];
  /** A caution drawn after the points, for what this is not good at. */
  notice?: { title: string; body: string };
};

export interface InfoSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Null draws an empty sheet; keep the content while it slides away. */
  info: InfoContent | null;
  /** Between the title and the points: figures, where the thing has some. */
  children?: React.ReactNode;
  /** Opened from inside another sheet: it rises over that one instead of replacing it. */
  nested?: boolean;
}

/**
 * What the circled "i" on a choice opens: the choice's kind and name, then
 * the few things worth knowing as points, each on a small gold square.
 *
 * One sheet for every "i" in the app (Samwell on-device and cloud, the cloud
 * reading voices, a voice box's version), so a reader who has opened one
 * knows how to read the next.
 */
export function InfoSheet({ visible, onClose, info, children, nested = false }: InfoSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];

  return (
    <Sheet visible={visible} onClose={onClose} stackBehavior={nested ? 'push' : undefined}>
      {info ? (
        <View className="gap-6 px-6">
          <View className="gap-1">
            <ThemedText type="labelSm" color={tokens['--color-primary']}>
              {info.label}
            </ThemedText>
            <ThemedText type="headlineSm">{info.title}</ThemedText>
            {info.line ? (
              <ThemedText type="bodyMd" color={muted} className="pt-1">
                {info.line}
              </ThemedText>
            ) : null}
          </View>
          {children}
          {info.points.length > 0 ? (
            <View className="gap-3">
              {info.points.map((point) => (
                <View key={point} className="flex-row gap-3">
                  <View className="mt-2 h-1 w-1 bg-primary" />
                  <ThemedText type="bodySm" color={muted} className="flex-1">
                    {point}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
          {info.notice ? (
            // A quiet card: no status colour, since nothing is wrong, and
            // square like the rest of the app. Not folded: this sheet exists
            // to be read.
            <Alert className="rounded-none">
              <Alert.Indicator>
                <Info size={16} color={muted} strokeWidth={2} />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Title>{info.notice.title}</Alert.Title>
                <Alert.Description>{info.notice.body}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
