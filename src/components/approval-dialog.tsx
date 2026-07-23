import React from 'react';
import { Modal, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Touchable } from '@/components/ui/touchable';
import { spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { useApprovalStore, type PendingApproval } from '@/stores/approval';

type ApprovalCopy = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive: boolean;
};

function getApprovalCopy({ toolName, input }: PendingApproval): ApprovalCopy {
  const entryType = toolName.endsWith('_highlight') ? 'highlight' : 'thought';

  if (toolName.startsWith('delete_')) {
    return {
      title: `Delete ${entryType}?`,
      body: `Samwell wants to permanently delete this ${entryType}. This can't be undone.`,
      confirmLabel: 'DELETE',
      destructive: true,
    };
  }

  const tags =
    typeof input === 'object' && input !== null && Array.isArray((input as { tags?: unknown }).tags)
      ? (input as { tags: string[] }).tags.join(', ')
      : 'these tags';

  return {
    title: 'Add tags?',
    body: `Samwell wants to add ${tags} to this ${entryType}.`,
    confirmLabel: 'APPROVE',
    destructive: false,
  };
}

export function ApprovalDialog() {
  const colors = useColors();
  const pending = useApprovalStore((s) => s.pending);
  const respond = useApprovalStore((s) => s.respond);

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
