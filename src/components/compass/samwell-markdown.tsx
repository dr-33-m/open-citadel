import React from 'react';
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';

import { useMarkdownStyle } from '@/hooks/use-markdown-style';

type SamwellMarkdownProps = {
  content: string;
  fontSize?: number;
  lineHeight?: number;
  color?: string;
};

/**
 * One of Grand Maester Samwell's messages, in his serif voice.
 *
 * The same engine and the same style mapping the chat bubble uses, differing
 * only in the face and the size — which is the point of `useMarkdownStyle`.
 * Compass and chat drifted apart last time precisely because each kept its own
 * copy of the styles, and Compass spent a while carrying two list bugs the
 * bubble had already been fixed for.
 *
 * Sizes stay props: the draft cards and the goal proposals set their own.
 */
export function SamwellMarkdown({
  content,
  fontSize = 16,
  lineHeight = 24,
  color,
}: SamwellMarkdownProps) {
  const markdownStyle = useMarkdownStyle({ voice: 'serif', fontSize, lineHeight, color });

  return (
    <EnrichedMarkdownText markdown={content} markdownStyle={markdownStyle} flavor="commonmark" />
  );
}
