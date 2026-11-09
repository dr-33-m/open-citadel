import React from 'react';

import { BrainCircuit, History } from '@/components/icons';
import type { ToolboxItem } from '@/components/samwell/samwell-toolbox';
import type { TextSwitchOption } from '@/components/text-switch';
import { useBrainName } from '@/features/chat/hooks/use-brain-name';
import { useChatSessionList } from '@/features/chat/hooks/use-chat-session-list';
import { useChatToolbox } from '@/features/chat/hooks/use-chat-toolbox';
import type { SamwellReadiness } from '@/features/chat/hooks/use-samwell-readiness';
import { brainSheet } from '@/features/samwell/handles';
import { useCompassToolbox } from '@/features/samwell/hooks/use-compass-toolbox';
import { useSamwellAttachment } from '@/features/samwell/hooks/use-samwell-attachment';
import { useBrainSheetCloud } from '@/features/samwell/hooks/use-samwell-brains';
import { useChatStore } from '@/stores/chat';
import { useSamwellSessionStore } from '@/stores/samwell-session';
import { useSamwellUiStore, type ToolboxTab } from '@/stores/samwell-ui';

const TABS: readonly TextSwitchOption<ToolboxTab>[] = [
  { value: 'reading', label: 'Reading' },
  { value: 'compass', label: 'Compass' },
];

/**
 * What the toolbox under the composer holds: a tab each for Reading and
 * Compass, then the brain and the history, which belong to the whole
 * conversation and sit under both.
 *
 * Drawn only by the composer, and it reads counts and flags rather than the
 * conversation itself, so a token streaming in redraws none of it. Each tool
 * that raises a sheet raises it through the sheet store; the drawer stays
 * open underneath, and dismissing the sheet returns to it as it was.
 */
export function useSamwellToolbox(readiness: SamwellReadiness) {
  const setSession = useSamwellSessionStore((s) => s.set);
  const pendingKind = useSamwellSessionStore((s) => s.pendingBook?.kind ?? null);
  const openSheet = useSamwellUiStore((s) => s.openSheet);
  const tab = useSamwellUiStore((s) => s.toolboxTab);
  const onTabChange = useSamwellUiStore((s) => s.setToolboxTab);

  const hasSession = useChatStore((s) => s.activeSession != null);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const chatSwitching = useSamwellUiStore((s) => s.chatSwitching);
  const attachment = useSamwellAttachment();
  const sessionCount = useChatSessionList('reading').length;
  // Held mid-turn: picking a conversation then is what used to race the
  // engine, and a brain cannot be swapped under a reply.
  const busy = isGenerating || chatSwitching != null;

  const pickers = React.useMemo(
    () => ({ book: () => openSheet('book'), article: () => openSheet('post'), episode: () => openSheet('episode') }),
    [openSheet],
  );
  const dropAttachment = React.useCallback(() => setSession({ pendingBook: null }), [setSession]);
  const reading = useChatToolbox({
    hasSession,
    attachedKind: attachment.kind,
    pendingKind,
    attachedTitle: attachment.title,
    attachedCover: attachment.cover,
    busy,
    pickers,
    onDrop: dropAttachment,
  });
  const compass = useCompassToolbox(readiness.cloudBlocker);

  const cloudBrains = useBrainSheetCloud();
  const brainOnOffer = cloudBrains || readiness.nativeSupported;
  const brainDetail = useBrainName(cloudBrains) ?? 'None yet';

  const shared: ToolboxItem[] = React.useMemo(
    () => [
      ...(brainOnOffer
        ? [{ id: 'brain', icon: BrainCircuit, label: 'Brain', detail: brainDetail, onPress: busy ? undefined : () => brainSheet.current?.open() }]
        : []),
      {
        id: 'history',
        icon: History,
        label: 'History',
        detail: sessionCount > 0 ? `${sessionCount} saved` : 'Nothing yet',
        onPress: busy ? undefined : () => openSheet('history'),
      },
    ],
    [brainOnOffer, brainDetail, busy, sessionCount, openSheet],
  );

  return { tabs: TABS, tab, onTabChange, items: tab === 'reading' ? reading : compass, shared };
}
