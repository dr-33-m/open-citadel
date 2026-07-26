import React from 'react';
import { Modal, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useApprovalStore, type PendingApproval } from '@/stores/approval';
import { useChatStore } from '@/stores/chat';

type ApprovalCopy = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
};

function stringField(input: unknown, key: string): string | undefined {
  if (input && typeof input === 'object' && key in input) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function bookCountFrom(input: unknown): number {
  const titles =
    input && typeof input === 'object' ? (input as { book_titles?: unknown }).book_titles : undefined;
  return Array.isArray(titles) && titles.length > 0 ? titles.length : 1;
}

function approve(title: string, body: string): ApprovalCopy {
  return { title, body, confirmLabel: 'APPROVE', destructive: false };
}

function getApprovalCopy({ toolName, input }: PendingApproval): ApprovalCopy {
  if (toolName === 'delete_highlight' || toolName === 'delete_thought') {
    const entryType = toolName.endsWith('_highlight') ? 'highlight' : 'thought';
    return {
      title: `Delete ${entryType}?`,
      body: `Samwell wants to permanently delete this ${entryType}. This can't be undone.`,
      confirmLabel: 'DELETE',
      destructive: true,
    };
  }

  if (toolName === 'tag_highlight' || toolName === 'tag_thought') {
    const entryType = toolName.endsWith('_highlight') ? 'highlight' : 'thought';
    const tags =
      input && typeof input === 'object' && Array.isArray((input as { tags?: unknown }).tags)
        ? (input as { tags: string[] }).tags.join(', ')
        : 'these tags';
    return approve('Add tags?', `Samwell wants to add ${tags} to this ${entryType}.`);
  }

  const books = bookCountFrom(input);
  const bookWord = books === 1 ? 'a book' : `${books} books`;

  switch (toolName) {
    case 'remove_from_currently_reading':
      return approve(
        'Remove from Currently Reading?',
        `Samwell wants to remove ${bookWord} from Currently Reading.`,
      );
    case 'add_to_queue':
      return approve('Add to queue?', `Samwell wants to add ${bookWord} to your reading queue.`);
    case 'remove_from_queue':
      return approve('Remove from queue?', `Samwell wants to remove ${bookWord} from your reading queue.`);
    case 'reorder_queue':
      return approve('Reorder queue?', `Samwell wants to move ${bookWord} in your reading queue.`);
    case 'toggle_favorite':
      return approve('Update favorites?', `Samwell wants to update favorites for ${bookWord}.`);
    case 'mark_as_finished':
      return approve('Mark as finished?', `Samwell wants to mark ${bookWord} as finished.`);
    case 'create_collection': {
      const name = stringField(input, 'name') ?? 'a new collection';
      return approve('Create collection?', `Samwell wants to create a collection called "${name}".`);
    }
    case 'add_book_to_collection': {
      const collectionName = stringField(input, 'collection_name') ?? 'a collection';
      return approve('Add to collection?', `Samwell wants to add ${bookWord} to "${collectionName}".`);
    }
    case 'remove_book_from_collection': {
      const collectionName = stringField(input, 'collection_name') ?? 'a collection';
      return approve('Remove from collection?', `Samwell wants to remove ${bookWord} from "${collectionName}".`);
    }
    default:
      return approve('Approve this action?', 'Samwell wants to make a change.');
  }
}

export function ApprovalDialog() {
  const colors = useColors();
  const activeSessionId = useChatStore((s) => s.activeSession?.id);
  // Only ever show the approval that belongs to the session the user is
  // currently looking at — a tool call awaiting approval in a session they've
  // since navigated away from stays pending in the store, but must not float
  // over an unrelated screen.
  const pending = useApprovalStore((s) =>
    activeSessionId ? (s.pendingBySession.get(activeSessionId)?.request ?? null) : null,
  );
  const respondRaw = useApprovalStore((s) => s.respond);
  const respond = (approved: boolean, options?: { rememberForSession?: boolean }) => {
    if (pending) respondRaw(pending.sessionId, approved, options);
  };

  if (!pending) return null;

  const copy = getApprovalCopy(pending);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => respond(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Touchable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => respond(false)}
        />
        <View
          style={{
            backgroundColor: colors.surface.low,
            paddingHorizontal: spacing[6],
            paddingTop: spacing[4],
            paddingBottom: spacing[10],
            gap: spacing[4],
          }}
        >
          <View style={{ width: 40, height: 4, backgroundColor: colors.surface.highest, alignSelf: 'center' }} />
          <ThemedText type="headlineSm">{copy.title}</ThemedText>
          <ThemedText type="bodySm" color={colors.text.secondary}>
            {copy.body}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Touchable
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[2],
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[2],
                backgroundColor: colors.surface.mid,
              }}
              onPress={() => respond(false)}
            >
              <ThemedText type="labelSm" color={colors.text.secondary}>CANCEL</ThemedText>
            </Touchable>
            <Touchable
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[2],
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[2],
                backgroundColor: copy.destructive ? '#e53935' : colors.primary.default,
              }}
              onPress={() => respond(true)}
            >
              <ThemedText type="labelSm" color={copy.destructive ? '#fff' : colors.surface.base}>
                {copy.confirmLabel}
              </ThemedText>
            </Touchable>
          </View>
          {!copy.destructive && (
            <Touchable
              style={{ alignItems: 'center', paddingVertical: spacing[2] }}
              onPress={() => respond(true, { rememberForSession: true })}
            >
              <ThemedText type="labelSm" color={colors.primary.default}>
                ALLOW FOR THIS SESSION
              </ThemedText>
            </Touchable>
          )}
        </View>
      </View>
    </Modal>
  );
}
