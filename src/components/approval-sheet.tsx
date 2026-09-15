import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { Sheet } from '@/components/ui/sheet';
import { Touchable } from '@/components/ui/touchable';
import { approvalCopy } from '@/services/approval-copy';
import { useApprovalStore, type PendingApproval } from '@/stores/approval';
import { useChatStore } from '@/stores/chat';
import { useCompassChatStore } from '@/stores/compass-chat';
import { asColor } from '@/utils/colors';

/**
 * Samwell asking before he changes something, as a sheet from the bottom.
 *
 * Was a centred dialog with three buttons on one row. "Allow for this session"
 * is too long to share a row on a phone, so CANCEL was pushed off the card's
 * edge. Stacked full-width here, every choice keeps its whole label and a thumb
 * reaches all three.
 *
 * One request at a time, and the next only once the last has finished leaving.
 * A sheet reports `onClose` when its exit animation ends, which is after an
 * answer has already been given, and a tool loop can ask again inside that
 * window (two approvals in one turn). Read against whatever was pending by
 * then, that late close declined a request nobody had seen. So the sheet holds
 * the request it is showing, and only a close of an unanswered one declines.
 */
export function ApprovalSheet() {
  const [mutedForeground, primaryForeground, destructiveForeground] = useCSSVariable([
    '--color-muted-foreground',
    '--color-primary-foreground',
    '--color-destructive-foreground',
  ]);
  const activeSessionId = useChatStore((s) => s.activeSession?.id);
  // Compass talks on its own thread and its turn is on screen exactly while it
  // is in flight, so its approval is shown while it runs.
  const compassRunning = useCompassChatStore((s) => s.submitting);
  const compassSessionId = useCompassChatStore((s) => s.activeSessionId);
  // Only the approval for the conversation on screen. One from a session the
  // reader has left stays pending in the store without floating over this one.
  const pending = useApprovalStore((s) => {
    if (compassRunning && compassSessionId) {
      const compass = s.pendingBySession.get(compassSessionId)?.request ?? null;
      if (compass) return compass;
    }
    return activeSessionId ? (s.pendingBySession.get(activeSessionId)?.request ?? null) : null;
  });
  const respond = useApprovalStore((s) => s.respond);

  /** The request on the sheet, kept through its exit animation. */
  const [shown, setShown] = React.useState<PendingApproval | null>(null);
  /** Whether `shown` has been answered, so its closing is not read as a no. */
  const [answered, setAnswered] = React.useState(false);

  // The next request takes the sheet only once it is empty. Adjusted during
  // render rather than in an effect, so the sheet opens on the same commit.
  if (shown === null && pending !== null) {
    setShown(pending);
    setAnswered(false);
  }

  const answer = (approved: boolean, options?: { rememberForSession?: boolean }) => {
    if (!shown || answered) return;
    setAnswered(true);
    respond(shown.sessionId, approved, options);
  };

  const handleClose = () => {
    // A drag down or a backdrop tap on a question still being asked is a no,
    // the same as the dialog's was. A request withdrawn by the store (a stop,
    // a deleted session) is already settled and gets no answer.
    if (shown && !answered && pending === shown) respond(shown.sessionId, false);
    setShown(null);
    setAnswered(false);
  };

  const copy = shown ? approvalCopy(shown) : null;
  const confirmSurface = copy?.destructive ? 'bg-destructive' : 'bg-primary';
  const confirmInk = copy?.destructive ? destructiveForeground : primaryForeground;
  const visible = shown !== null && !answered && pending === shown;

  return (
    <Sheet visible={visible} onClose={handleClose}>
      <View className="gap-6 px-6">
        <View className="gap-2">
          <ThemedText type="headlineSm">{copy?.title ?? ''}</ThemedText>
          <ThemedText type="bodySm" color={asColor(mutedForeground)}>
            {copy?.body ?? ''}
          </ThemedText>
        </View>
        <View className="gap-2">
          <Touchable
            className={`items-center py-3 ${confirmSurface}`}
            haptic="commit"
            onPress={() => answer(true)}
          >
            <ThemedText type="labelSm" color={asColor(confirmInk)}>
              {copy?.confirmLabel ?? ''}
            </ThemedText>
          </Touchable>
          {/* Never offered for a destructive approval: a delete does not get a
              "remember this". */}
          {copy && !copy.destructive && (
            <Touchable
              className="items-center border border-border py-3"
              onPress={() => answer(true, { rememberForSession: true })}
            >
              <ThemedText type="labelSm">ALLOW FOR THIS SESSION</ThemedText>
            </Touchable>
          )}
          <Touchable className="items-center py-3" haptic="warn" onPress={() => answer(false)}>
            <ThemedText type="labelSm" color={asColor(mutedForeground)}>
              CANCEL
            </ThemedText>
          </Touchable>
        </View>
      </View>
    </Sheet>
  );
}
