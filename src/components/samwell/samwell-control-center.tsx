import { ArrowBigDownDash, ArrowBigUpDash, Send, Square } from '@/components/icons';
import React from 'react';
import { TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { NewChatButton } from '@/components/samwell/new-chat-button';
import { SamwellPlaceholder } from '@/components/samwell-placeholder';
import { ToggleButton } from '@/components/ui/toggle-button';
import { Spinner } from '@/components/ui/spinner';
import { Touchable } from '@/components/ui/touchable';
import { elevation, fontFamily, iconSize, stackedShadow } from '@/constants/theme';
import { asColor } from '@/utils/colors';
import { cn } from '@/lib/cn';

type SamwellControlCenterProps = {
  /** Whether the drawer under this card is out. Owned by the caller, which
   * renders the drawer itself — this card only holds the handle. */
  toolboxOpen: boolean;
  onToggleToolbox: () => void;
  text: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder: string;
  /** Replaces Send with a Stop button while a reply is actively generating. */
  showStop?: boolean;
  onStop?: () => void;
  /**
   * The composer's own input, handed up so a caller can focus it.
   *
   * This is what makes "work on it more" work: the draft card stays on screen
   * and the cursor lands here, instead of the card being dismissed.
   */
  inputRef?: React.RefObject<TextInput | null>;
  /** Starts a fresh conversation. Absent while that would cut a turn off. */
  onNewChat?: () => void;
};

/**
 * The control unit: what you are writing, a fresh conversation, and the
 * handle of the drawer of tools underneath.
 *
 * It used to hold everything, and in Compass that had grown to seven targets
 * in one row — a two-cell mode switch, three sheets, history and send. Once a
 * row is that long the thing you press every morning is the same size and
 * weight as the thing you press twice a month, and the next surface either
 * makes it worse or does not get a button at all.
 *
 * So the row keeps only what is true of every conversation: the field, a
 * fresh start, and send. Every tool went into the drawer underneath, behind
 * the handle. (The Chat / Compass switch that sat here went when the two
 * became one Samwell.) The drawer is the caller's
 * to render (`SamwellToolbox`) because it belongs to the floating stack rather
 * than to this card; this card just holds the handle.
 */
export function SamwellControlCenter({
  toolboxOpen,
  onToggleToolbox,
  text,
  onChangeText,
  onSend,
  busy,
  placeholder,
  showStop = false,
  onStop,
  inputRef,
  onNewChat,
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
  const canSend = text.trim().length > 0 && !busy;

  // "Stop was tapped and the turn has not wound down." Reset on the edge where
  // the Stop button goes away rather than in an effect — setState during
  // render for a prop change is the sanctioned pattern and does not cascade.
  const [isStopping, setIsStopping] = React.useState(false);
  const [stopVisible, setStopVisible] = React.useState(showStop);
  if (showStop !== stopVisible) {
    setStopVisible(showStop);
    if (!showStop) setIsStopping(false);
  }

  /*
   * Refuses a second press itself rather than trusting `disabled` alone.
   * Stopping can take a while on a slow device, and taps kept landing on the
   * button while it wound down, each one asking the engine to cancel again.
   * The spinner that replaces the square says the first tap was heard.
   */
  const handleStop = () => {
    if (isStopping) return;
    setIsStopping(true);
    onStop?.();
  };

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
          editable={!busy}
        />
        <SamwellPlaceholder
          text={placeholder}
          visible={text.length === 0}
          color={asColor(mutedForeground)}
        />
      </View>

      <View className="flex-row items-center gap-2">
        {/* A fresh conversation, then the drawer of tools. */}
        <NewChatButton label="New chat" color={asColor(mutedForeground)} onPress={onNewChat} />

        {/* The drawer handle. The arrow points the way the surfaces move: up
            to pull the drawer out and lift the card, down to put it away.

            Vendored ToggleButton, squared off and given a bordered box, so the
            row reads as one set. */}
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

        <View className="flex-1" />

        {showStop ? (
          <Touchable
            className="h-10 w-10 items-center justify-center bg-surface-tertiary"
            disabled={isStopping}
            accessibilityLabel={isStopping ? 'Stopping' : 'Stop'}
            accessibilityState={{ disabled: isStopping, busy: isStopping }}
            onPress={handleStop}
          >
            {isStopping ? (
              <Spinner size="sm" />
            ) : (
              <Square size={16} color={asColor(foreground)} fill={asColor(foreground)} />
            )}
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
