import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Globe } from '@/components/icons';
import { cn } from '@/lib/cn';
import { faviconUrl } from '@/utils/web-sources';

interface SourceFaviconProps {
  url: string;
  /** The square's side, in points. */
  size: number;
  /** Muted ink for the globe drawn when a site has no icon. */
  muted: string | undefined;
  className?: string;
}

/**
 * A web source's small icon, in a square. A site the icon service knows
 * nothing about (it answers with a placeholder, or not at all) gets a globe
 * instead, so a row never shows an empty box.
 */
export const SourceFavicon = React.memo(function SourceFavicon({ url, size, muted, className }: SourceFaviconProps) {
  const uri = faviconUrl(url);
  // Keyed on the address, so a row handed another source tries its icon afresh.
  const [failedUri, setFailedUri] = React.useState<string | null>(null);
  const fail = React.useCallback(() => setFailedUri(uri), [uri]);
  const showIcon = uri != null && failedUri !== uri;
  const box = React.useMemo(() => ({ width: size, height: size }), [size]);
  const glyph = Math.round(size * 0.6);

  return (
    <View style={box} className={cn('items-center justify-center overflow-hidden bg-muted', className)}>
      {showIcon ? (
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" onError={fail} recyclingKey={uri} />
      ) : (
        <Globe size={glyph} color={muted} />
      )}
    </View>
  );
});
