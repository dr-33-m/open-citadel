import { ArrowBigDownDash, ArrowBigUpDash, Compass, MessageSquare, Send, Square } from '@/components/icons';
import React from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { SamwellPlaceholder } from '@/components/samwell-placeholder';
import { ToggleButton } from '@/components/ui/toggle-button';
import { Touchable } from '@/components/ui/touchable';
import { elevation, fontFamily, iconSize, stackedShadow } from '@/constants/theme';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

type SamwellControlCenterProps = {
  mode: 'chat' | 'compass';
  onSelectMode: (mode: 'chat' | 'compass') => void;
  /** Held while Samwell is working. Switching mode mid-turn would swap the
   * screen out from under a reply that is still arriving, and in chat mode it
   * also risks a second caller reaching the engine. */
  lockMode?: boolean;
  /** Whether the drawer under this card is out. Owned by the caller, which
   * renders the drawer itself — this card only holds the handle. */
  toolboxOpen: boolean;
  onToggleToolbox: () => void;
  /**
   * Whether this mode has any tools to show.
   *
   * False offline in Compass, where every tool would open a sheet onto an
   * empty store. The handle goes away with them rather than staying to open an
   * empty drawer, which is the same rule the mode's own controls follow.
   */
  hasTools?: boolean;
  text: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder: string;
  /**
   * This mode has nothing to talk to — offline Compass, which is cloud-only.
   *
   * The field stops taking input and the mode's own action buttons go away
   * entirely, rather than sitting there inert: a row of controls that does
   * nothing when pressed reads as broken, and the empty state above already
   * says what to do about it.
   */
  unavailable?: boolean;
  /** Chat mode only — replaces Send with a Stop button while a reply is
   * actively generating, matching the old per-session chat screen. */
  showStop?: boolean;
  onStop?: () => void;
  /**
   * The composer's own input, handed up so a caller can focus it.
   *
   * This is what makes "work on it more" work: the draft card stays on screen
   * and the cursor lands here, instead of the card being dismissed.
   */
  inputRef?: React.RefObject<TextInput | null>;
};

/**
 * The control unit: what you are writing, and which mode you are in.
 *
 * It used to hold everything, and in Compass that had grown to seven targets
 * in one row — a two-cell mode switch, three sheets, history and send. Once a
 * row is that long the thing you press every morning is the same size and
 * weight as the thing you press twice a month, and the next surface either
 * makes it worse or does not get a button at all.
 *
 * So the row keeps only what is true of every session: the field, the mode
 * switch, and send. Everything a mode brings with it went into the drawer
 * underneath, behind the handle beside the switch. The drawer is the caller's
 * to render (`SamwellToolbox`) because it belongs to the floating stack rather
 * than to this card; this card just holds the handle.
 */
export function SamwellControlCenter({
  mode,
  onSelectMode,
  lockMode,
  toolboxOpen,
  onToggleToolbox,
  hasTools = true,
  text,
  onChangeText,
  onSend,
  busy,
  placeholder,
  unavailable = false,
  showStop = false,
  onStop,
  inputRef,
}: SamwellControlCenterProps) {
  // Literal colours for consumers a className can't reach: lucide icon props
  // and TextInput's placeholderTextColor.
  const [primary, primaryForeground, mutedForeground, foreground, shadowStacked] =
    useCSSVariable([
      '--color-primary',
      '--color-primary-foreground',
      '--color-muted-foreground',
      '--color-foreground',
      // Theme-aware: heavy enough to land on obsidian is a bruise on
      // parchment. See `stackedShadow`.
      '--color-shadow-stacked',
    ]);
  const canSend = text.trim().length > 0 && !busy && !unavailable;

  // "Stop was tapped and the turn has not wound down." Reset on the edge where
  // the Stop button goes away rather than in an effect — setState during
  // render for a prop change is the sanctioned pattern and does not cascade.
  const [isStopping, setIsStopping] = React.useState(false);
  const [stopVisible, setStopVisible] = React.useState(showStop);
  if (showStop !== stopVisible) {
    setStopVisible(showStop);
    if (!showStop) setIsStopping(false);
  }

  return (
    // The drag handle that used to sit at the top of this card is gone with
    // the floating nav it collapsed: there is no bar under the card to hide
    // any more, so the card is just a card.
    //
    // `zIndex` so it paints last. It is the earlier sibling of the toolbox, so
    // without it the toolbox draws over this card and the overlap runs the
    // wrong way round. With it, this card lies ON the toolbox and hides its
    // top edge, which is the whole of what makes the two read as a stack.
    //
    // The shadow steps up to `stacked` while the toolbox is out, because it is
    // then falling on a card of the same colour rather than on the page, and
    // `card`'s ambient wash cannot be seen doing that. Shut, there is nothing
    // underneath to separate from and the ordinary elevation is right.
    <View
      className="gap-2 border border-border bg-card p-3"
      style={[
        toolboxOpen ? stackedShadow(asColor(shadowStacked)) : elevation.card,
        { zIndex: 1 },
      ]}
    >
      {/* The goal every Compass control below is scoped to, and the way to
          another. Above the field because it is context, not an action. */}

      {/* No border/background of its own — reads as part of the same card
          surface rather than a boxed field inside it.

          The placeholder is drawn over the field rather than set on it, so his
          name can be gold inside it. See `SamwellPlaceholder`: the padding
          here is what the overlay is positioned against. */}
      <View>
        <TextInput
          ref={inputRef}
          className="max-h-[120px] min-h-[40px] px-2 py-2 text-[16px] text-foreground"
          style={{ fontFamily: fontFamily.sans, lineHeight: 24, textAlignVertical: 'top' }}
          multiline
          value={text}
          onChangeText={onChangeText}
          editable={!busy && !unavailable}
        />
        <SamwellPlaceholder
          text={placeholder}
          visible={text.length === 0}
          color={asColor(mutedForeground)}
        />
      </View>

      <View className="flex-row items-center gap-2">
        {/* Segmented chat/compass switch — same idea as an OS light/dark
            toggle, icon-only and built from Citadel Frame parts: a bordered
            track, sharp corners throughout, the active cell lifted with a
            contrasting fill instead of a sliding rounded pill.

            It stays on the card rather than moving into the drawer. Which
            mode you are in is the one thing that changes what everything else
            on this screen means, including what is in the drawer, so it is
            not something to go looking for. */}
        <View className="flex-row border border-border bg-muted">
          <Touchable
            className={cn(
              'h-10 w-10 items-center justify-center',
              mode === 'chat' && 'bg-card',
              lockMode && mode !== 'chat' && 'opacity-35',
            )}
            style={mode === 'chat' ? elevation.soft : undefined}
            onPress={lockMode ? undefined : () => onSelectMode('chat')}
            haptic="select"
          >
            <MessageSquare
              size={iconSize.default}
              color={asColor(mode === 'chat' ? primary : mutedForeground)}
              strokeWidth={2}
            />
          </Touchable>
          <Touchable
            className={cn(
              'h-10 w-10 items-center justify-center',
              mode === 'compass' && 'bg-card',
              lockMode && mode !== 'compass' && 'opacity-35',
            )}
            style={mode === 'compass' ? elevation.soft : undefined}
            onPress={lockMode ? undefined : () => onSelectMode('compass')}
            haptic="select"
          >
            <Compass
              size={iconSize.default}
              color={asColor(mode === 'compass' ? primary : mutedForeground)}
              strokeWidth={2}
            />
          </Touchable>
        </View>

        {/* The drawer handle, next to the switch: the mode, then the mode's
            own tools. The arrow points the way the surfaces move — up to pull
            the drawer out and lift the card, down to put it away.

            Vendored ToggleButton, squared off and given the same bordered box
            as the switch beside it, so the row still reads as one set. */}
        {hasTools && (
        <ToggleButton
          variant="ghost"
          iconOnly
          className={cn(
            'h-10 w-10 rounded-none border border-border',
            toolboxOpen && 'bg-muted',
          )}
          selected={toolboxOpen}
          onSelectedChange={onToggleToolbox}
          haptics
          accessibilityLabel={toolboxOpen ? 'Close the toolbox' : 'Open the toolbox'}
        >
          {toolboxOpen ? (
            <ArrowBigDownDash size={iconSize.default} color={asColor(primary)} strokeWidth={2} />
          ) : (
            <ArrowBigUpDash
              size={iconSize.default}
              color={asColor(mutedForeground)}
              strokeWidth={2}
            />
          )}
        </ToggleButton>
        )}

        <View className="flex-1" />

        {showStop ? (
          <Touchable
            className="h-10 w-10 items-center justify-center bg-surface-tertiary"
            disabled={isStopping}
            onPress={() => {
              setIsStopping(true);
              onStop?.();
            }}
          >
            <Square size={16} color={asColor(foreground)} fill={asColor(foreground)} />
          </Touchable>
        ) : (
          <Touchable
            className={cn('h-10 w-10 items-center justify-center bg-primary', !canSend && 'bg-surface-tertiary')}
            onPress={canSend ? onSend : undefined}
          >
            <Send size={18} color={asColor(canSend ? primaryForeground : mutedForeground)} />
          </Touchable>
        )}
      </View>
    </View>
  );
}
