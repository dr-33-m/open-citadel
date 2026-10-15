import React from 'react';
import { View } from 'react-native';

import { Globe } from '@/components/icons';
import { Sources } from '@/components/ui/sources';
import { Text } from '@/components/ui/text';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { asColor } from '@/utils/colors';
import { openWebPage } from '@/lib/open-web-page';
import { hostOf } from '@/utils/urls';
import type { WebSource } from 'samwell-shared';

const SourceRow = React.memo(function SourceRow({ source, muted }: { source: WebSource; muted: string | undefined }) {
  const open = React.useCallback(() => openWebPage(source.url), [source.url]);
  return (
    // No `href`: PanelUI's row would hand it to `Linking` and leave the app.
    // The page opens in the in-app browser instead, over the chat.
    <Sources.Source title={source.title} onPress={open}>
      <Globe size={14} color={muted} />
      <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
        {source.title}
      </Text>
      <Text numberOfLines={1} className="max-w-[40%] text-xs text-muted-foreground">
        {hostOf(source.url)}
      </Text>
    </Sources.Source>
  );
});

/**
 * The web pages a reply drew on, folded under "Used 4 sources", each opening
 * in the in-app browser. Only for replies that searched the web; the library
 * is cited in the reply itself, as the books and highlights it shows.
 */
export const SourceList = React.memo(function SourceList({ sources }: { sources: readonly WebSource[] }) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  if (sources.length === 0) return null;
  return (
    <View className="pt-2">
      <Sources>
        <Sources.Trigger count={sources.length} />
        <Sources.Content>
          {sources.map((source) => (
            <SourceRow key={source.url} source={source} muted={muted} />
          ))}
        </Sources.Content>
      </Sources>
    </View>
  );
});
