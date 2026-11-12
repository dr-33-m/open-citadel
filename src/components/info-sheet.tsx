import React from 'react';
import { View } from 'react-native';

import { FitSheet } from '@/components/fit-sheet';
import { Info } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Alert } from '@/components/ui/alert';
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
  /** Under everything: the choice the sheet explains, where it asks for one (sharing app performance). */
  footer?: React.ReactNode;
}

/**
 * Taller than a `FitSheet`'s usual cap: an "i" is read before a choice is
 * made, so on an ordinary phone at ordinary text size all of it should show
 * at once, and it scrolls only where the screen truly cannot hold it.
 */
const HEIGHT_RATIO = 0.9;

/** The body under the pinned header: 24 either side, 24 from the header and between its parts. */
const BODY = { paddingHorizontal: 24, paddingTop: 24, gap: 24 } as const;

/**
 * What the circled "i" on a choice opens: the choice's kind and name, then
 * the few things worth knowing as points, each on a small gold square.
 *
 * One sheet for every "i" in the app (Samwell on-device and cloud, the cloud
 * reading voices, a voice box's version, sharing app performance), so a reader
 * who has opened one knows how to read the next. It is a `FitSheet`: as tall as
 * what it says, and where that is more than the screen allows (a small phone,
 * large text), the points scroll under the pinned title while the footer's
 * choice stays at the bottom.
 */
export function InfoSheet({ visible, onClose, info, children, nested = false, footer }: InfoSheetProps) {
  const tokens = useThemeTokens();
  const muted = tokens['--color-muted-foreground'];

  const header = info ? (
    <View className="gap-1 px-6">
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
  ) : null;

  return (
    <FitSheet
      visible={visible}
      onClose={onClose}
      header={header}
      contentStyle={BODY}
      heightRatio={HEIGHT_RATIO}
      footer={footer ? <View className="px-6 pt-6">{footer}</View> : undefined}
      stackBehavior={nested ? 'push' : undefined}
    >
      {info ? (
        <>
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
        </>
      ) : null}
    </FitSheet>
  );
}
