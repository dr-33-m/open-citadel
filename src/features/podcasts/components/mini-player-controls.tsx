import React from 'react';

import { Highlighter, Pause, Play, X } from '@/components/icons';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { iconSize } from '@/constants/theme';
import { SkipGlyph } from '@/features/podcasts/components/skip-glyph';

type MiniPlayerControlsProps = {
  isPlaying: boolean;
  isBuffering: boolean;
  skipForwardSec: number;
  /** The control beside play while playing: forward past an ad, or (a book) Highlight. */
  second: 'skip' | 'highlight';
  highlighted: boolean;
  color: string | undefined;
  gold: string | undefined;
  onHighlight: () => void;
  onToggle: () => void;
  onSkipForward: () => void;
  onClose: () => void;
};

/**
 * The mini player's two controls, the two a listener reaches for without
 * looking: pause, and forward past an ad, or for a book Highlight, the one
 * thing a listener does to a book with the phone still in a pocket. Paused,
 * the second becomes close.
 */
export function MiniPlayerControls({
  isPlaying,
  isBuffering,
  skipForwardSec,
  second,
  highlighted,
  color,
  gold,
  onHighlight,
  onToggle,
  onSkipForward,
  onClose,
}: MiniPlayerControlsProps) {
  const PlayIcon = isPlaying ? Pause : Play;
  return (
    <>
      <Touchable
        className="h-11 w-11 items-center justify-center"
        onPress={onToggle}
        haptic="tap"
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
      >
        {isBuffering ? (
          <Spinner size="sm" />
        ) : (
          <PlayIcon size={iconSize.default} color={color} fill={color} />
        )}
      </Touchable>
      {isPlaying && second === 'highlight' ? (
        <Touchable
          className="h-11 w-11 items-center justify-center"
          onPress={onHighlight}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={highlighted ? 'Highlighted' : 'Highlight this sentence'}
        >
          <Highlighter size={iconSize.default} color={highlighted ? gold : color} />
        </Touchable>
      ) : isPlaying ? (
        <Touchable
          className="h-11 w-11 items-center justify-center"
          onPress={onSkipForward}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Forward ${skipForwardSec} seconds`}
        >
          <SkipGlyph direction="forward" seconds={skipForwardSec} size={iconSize.default + 2} color={color} />
        </Touchable>
      ) : (
        // Paused, the second control is the way out: forward past an ad is a
        // thing you do while listening, putting the player away is not.
        <Touchable
          className="h-11 w-11 items-center justify-center"
          onPress={onClose}
          haptic="select"
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Close the player"
        >
          <X size={iconSize.default} color={color} strokeWidth={2} />
        </Touchable>
      )}
    </>
  );
}
