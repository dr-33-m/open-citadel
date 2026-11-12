import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useMemoryActions } from '@/features/samwell-memory/hooks/use-memory-actions';
import {
  memoryRows,
  type MemoryAction,
  type MemoryNoteView,
  type MemoryRow,
  type MemoryTarget,
} from '@/features/samwell-memory/utils/memory-rows';
import { NoteText } from '@/lib/text-fields';
import { createSamwellMemoryQueryOptions } from '@/query-manager/samwell-memory';

const NO_ROWS: MemoryRow[] = [];

/**
 * The screen of what Samwell has kept: the rows, and the three things that
 * open over them (a note's sheet, the editor, and the confirm for forgetting
 * everything), each handed over as the group its component spreads.
 */
export function useSamwellMemory() {
  const { data, isPending } = useQuery(createSamwellMemoryQueryOptions());
  const actions = useMemoryActions();
  const [menuOn, setMenuOn] = React.useState<MemoryTarget | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MemoryTarget | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const rows = React.useMemo(() => (data ? memoryRows(data.profile, data.notes) : NO_ROWS), [data]);
  const portrait = rows[0]?.type === 'portrait' ? rows[0] : null;

  const openNote = React.useCallback((note: MemoryNoteView) => {
    setMenuOn({ kind: 'note', ...note });
    setMenuOpen(true);
  }, []);
  const portraitText = portrait?.text;
  const portraitMeta = portrait?.updated;
  const openPortrait = React.useCallback(() => {
    if (!portraitText || !portraitMeta) return;
    setMenuOn({ kind: 'portrait', text: portraitText, meta: portraitMeta, sourceSessionId: null });
    setMenuOpen(true);
  }, [portraitText, portraitMeta]);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);

  const { forget, correct, openChat, forgetAll } = actions;
  const onAction = React.useCallback(
    (action: MemoryAction, target: MemoryTarget) => {
      if (action === 'correct') setEditing(target);
      else if (action === 'chat' && target.sourceSessionId) openChat(target.sourceSessionId);
      else if (action === 'forget') forget(target);
    },
    [forget, openChat],
  );

  const closeEditor = React.useCallback(() => setEditing(null), []);
  const saveEdit = React.useCallback((text: string) => {
    if (editing) correct(editing, text);
  }, [correct, editing]);

  const closeConfirm = React.useCallback(() => setConfirming(false), []);
  const askForgetAll = React.useCallback(() => setConfirming(true), []);
  const confirmForgetAll = React.useCallback(() => {
    setConfirming(false);
    forgetAll();
  }, [forgetAll]);

  return {
    loaded: !isPending,
    list: { rows, onOpenNote: openNote, onOpenPortrait: openPortrait, onForgetAll: askForgetAll },
    menu: { visible: menuOpen, target: menuOn, onClose: closeMenu, onAction },
    editor: {
      visible: editing !== null,
      editKey: editing ? (editing.kind === 'note' ? editing.id : 'portrait') : null,
      heading: editing?.kind === 'portrait' ? 'How he sees you' : 'Correct this note',
      line: 'Say it the way it is. He will go by your words from now on.',
      placeholder: 'What is true…',
      initialText: editing?.text ?? '',
      schema: NoteText,
      multiline: true,
      onClose: closeEditor,
      onSave: saveEdit,
    },
    confirm: { visible: confirming, onClose: closeConfirm, onConfirm: confirmForgetAll },
  };
}
