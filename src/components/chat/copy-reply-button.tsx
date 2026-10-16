import React from 'react';

import { Copy } from '@/components/icons';
import { Touchable } from '@/components/ui/touchable';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { copyText } from '@/lib/copy-text';
import { asColor } from '@/utils/colors';
import { plainReply } from '@/utils/reply-markers';

/**
 * Copies a whole reply in one tap, rather than by selecting it: the words and
 * their markdown, without the cards the app draws in between. Muted, like the
 * sources beside it, since it sits under every reply.
 */
export const CopyReplyButton = React.memo(function CopyReplyButton({ content }: { content: string }) {
  const muted = asColor(useThemeTokens()['--color-muted-foreground']);
  const copy = React.useCallback(() => copyText(plainReply(content), 'Reply copied'), [content]);
  return (
    <Touchable onPress={copy} haptic="tap" hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy reply" className="py-1">
      <Copy size={16} color={muted} />
    </Touchable>
  );
});
