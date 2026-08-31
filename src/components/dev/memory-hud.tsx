import React from 'react';
import { Text, View } from 'react-native';

import * as Inference from '@/services/inference';

const mb = (n: number) => Math.round(n / (1024 * 1024));

/**
 * `__DEV__`-only overlay for watching native memory across a long session —
 * the growth in RSS that precedes the "app goes black" crash. Reads litert's
 * OS-level probe (`checkMemoryHeadroom`), so it shows nothing until an
 * on-device model is loaded, and nothing at all in a production build.
 *
 * Mounted from the root layout behind `__DEV__`.
 */
export function MemoryHud() {
  const [line, setLine] = React.useState<string | null>(null);

  React.useEffect(() => {
    const tick = () => {
      const { usage } = Inference.checkMemoryHeadroom();
      if (!usage) {
        setLine(null);
        return;
      }
      setLine(
        `rss ${mb(usage.residentBytes)} · heap ${mb(usage.nativeHeapBytes)} · free ${mb(
          usage.availableMemoryBytes,
        )}${usage.isLowMemory ? ' · LOW' : ''}`,
      );
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  if (!line) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 48,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
      }}
    >
      <Text style={{ color: '#3f6', fontSize: 9, fontVariant: ['tabular-nums'] }}>{line}</Text>
    </View>
  );
}
