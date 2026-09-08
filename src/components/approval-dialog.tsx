import React from 'react';

import { ConfirmDialog, type DialogAction } from '@/components/ui/confirm-dialog';
import { approvalCopy } from '@/services/approval-copy';
import { useApprovalStore } from '@/stores/approval';
import { useChatStore } from '@/stores/chat';
import { useCompassChatStore } from '@/stores/compass-chat';

export function ApprovalDialog() {
  const activeSessionId = useChatStore((s) => s.activeSession?.id);
  /*
   * Compass talks on its own thread, and its turn is on screen exactly while
   * it is in flight — there is no background Compass conversation to be
   * interrupted by. Without this the approval would sit in the store unseen
   * and the turn would hang until the client's settle timeout, which is the
   * shape of a hang rather than a question.
   */
  const compassRunning = useCompassChatStore((s) => s.submitting);
  const compassSessionId = useCompassChatStore((s) => s.activeSessionId);
  // Only ever show the approval that belongs to the conversation the user is
  // currently looking at — a tool call awaiting approval in a session they've
  // since navigated away from stays pending in the store, but must not float
  // over an unrelated screen.
  const pending = useApprovalStore((s) => {
    if (compassRunning && compassSessionId) {
      const compass = s.pendingBySession.get(compassSessionId)?.request ?? null;
      if (compass) return compass;
    }
    return activeSessionId ? (s.pendingBySession.get(activeSessionId)?.request ?? null) : null;
  });
  const respondRaw = useApprovalStore((s) => s.respond);
  const respond = (approved: boolean, options?: { rememberForSession?: boolean }) => {
    if (pending) respondRaw(pending.sessionId, approved, options);
  };

  // The dialog's own tap-outside-to-cancel / hardware-back maps to decline
  // (`respond(false)`) — the same direction the old sheet's backdrop tap and
  // drag-to-dismiss both resolved to, so this isn't a new way to lose an
  // approval by accident.
  const copy = pending ? approvalCopy(pending) : null;

  // Dialog has no separate slot for a secondary, non-decision action, so
  // "allow for this session" rides along as a third, non-confirming entry in
  // `actions` — Dialog already pulls only the confirm/destructive action to
  // the right, so this still lands between CANCEL and the confirming button
  // rather than competing with either. Only offered for non-destructive
  // approvals, matching the original: a delete never gets a "remember this".
  const actions: DialogAction[] = copy
    ? [
        { label: 'CANCEL', onPress: () => respond(false) },
        ...(copy.destructive
          ? []
          : [
              {
                label: 'ALLOW FOR THIS SESSION',
                onPress: () => respond(true, { rememberForSession: true }),
              },
            ]),
        {
          label: copy.confirmLabel,
          onPress: () => respond(true),
          confirm: true,
          destructive: copy.destructive,
        },
      ]
    : [];

  return (
    <ConfirmDialog
      visible={pending != null}
      title={copy?.title ?? ''}
      message={copy?.body}
      actions={actions}
      onClose={() => respond(false)}
    />
  );
}
