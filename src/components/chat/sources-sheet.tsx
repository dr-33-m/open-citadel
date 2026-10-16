import React from 'react';
import { View } from 'react-native';

import { SourceFavicon } from '@/components/chat/source-favicon';
import { PageFade } from '@/components/scroll-fades';
import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { fontFamily, spacing } from '@/constants/theme';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { openWebPage } from '@/lib/open-web-page';
import { asColor } from '@/utils/colors';
import { siteName, sourceSnippet, sourceTitle } from '@/utils/web-sources';
import type { WebSource } from 'samwell-shared';

export interface SourcesSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Kept by the caller while the sheet slides away, so it does not empty as it goes. */
  sources: readonly WebSource[];
}

const SourceRow = React.memo(function SourceRow({ source, muted }: { source: WebSource; muted: string | undefined }) {
  const open = React.useCallback(() => openWebPage(source.url), [source.url]);
  const title = sourceTitle(source);
  const snippet = sourceSnippet(source);
  return (
    // The page opens in the in-app browser, over the chat; Back comes here.
    <Touchable onPress={open} accessibilityRole="link" accessibilityLabel={title} className="gap-2 py-4">
      <View className="flex-row items-center gap-2.5">
        <SourceFavicon url={source.url} size={FAVICON} muted={muted} className="border border-border" />
        <ThemedText type="bodySm" color={muted} numberOfLines={1} className="flex-1">
          {siteName(source.url)}
        </ThemedText>
      </View>
      <ThemedText type="bodyMd" numberOfLines={2} style={TITLE}>
        {title}
      </ThemedText>
      {snippet ? (
        <ThemedText type="bodySm" color={muted} numberOfLines={2}>
          {snippet}
        </ThemedText>
      ) : null}
    </Touchable>
  );
});

/**
 * Every web page a reply drew on, a row each: the site, the page's title and
 * the lines the search found in it. A tap opens the page in the in-app
 * browser. Raised from the icons under the reply (`SourceStack`); one sheet
 * per conversation, not one per reply.
 */
export function SourcesSheet({ visible, onClose, sources }: SourcesSheetProps) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  const line = sources.length === 1 ? 'One page from the web' : `${sources.length} pages from the web`;
  // A sheet sized to its content stops at the cap but never hands a list
  // inside it the drag, so a list that can outgrow the cap gets a fixed box
  // to scroll in (see `PlanInfoSheet`). A short one fits itself and does not
  // scroll at all.
  const long = sources.length > FITS_UNSCROLLED;
  const rows = sources.map((source, index) => (
    <View key={source.url} className={index === 0 ? undefined : 'border-t border-border/70'}>
      <SourceRow source={source} muted={muted} />
    </View>
  ));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      fixedHeightRatio={long ? HEIGHT : undefined}
      maxHeightRatio={long ? undefined : HEIGHT}
      scrollable={long}
    >
      {/* Pinned: the title says what the list is however far down it has been read. */}
      <View className="gap-1 px-6 pb-2">
        <ThemedText type="headlineSm">Sources</ThemedText>
        <ThemedText type="bodySm" color={muted}>
          {line}
        </ThemedText>
      </View>
      {long ? (
        <PageFade edges="both" surface="popover">
          <Sheet.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={CONTENT}>
            {rows}
          </Sheet.ScrollView>
        </PageFade>
      ) : (
        <View style={CONTENT}>{rows}</View>
      )}
    </Sheet>
  );
}

const FAVICON = 28;
const HEIGHT = 0.78;
/** How many rows sit inside `HEIGHT` on a small phone without scrolling. */
const FITS_UNSCROLLED = 3;
const CONTENT = { paddingHorizontal: spacing[6] };
const TITLE = { fontFamily: fontFamily.sansSemiBold };
