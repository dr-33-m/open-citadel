import React from 'react';

import { EditTextSheet } from '@/components/edit-text-sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MemoryList } from '@/features/samwell-memory/components/memory-list';
import { MemoryNoteSheet } from '@/features/samwell-memory/components/memory-note-sheet';
import { MemorySkeleton } from '@/features/samwell-memory/components/memory-skeleton';
import { useSamwellMemory } from '@/features/samwell-memory/hooks/use-samwell-memory';

/** What Samwell has kept about them: theirs to read, to put right, and to have him forget. */
export function SamwellMemoryPane() {
  const screen = useSamwellMemory();
  const actions = [
    { label: 'CANCEL', onPress: screen.confirm.onClose },
    { label: 'FORGET', onPress: screen.confirm.onConfirm, destructive: true },
  ];

  return (
    <>
      {screen.loaded ? <MemoryList {...screen.list} /> : <MemorySkeleton />}
      <MemoryNoteSheet {...screen.menu} />
      <EditTextSheet {...screen.editor} />
      <ConfirmDialog
        visible={screen.confirm.visible}
        title="Forget everything?"
        message="Samwell will forget all of this, and it cannot be undone. Your books, highlights, goals and chats stay."
        actions={actions}
        onClose={screen.confirm.onClose}
      />
    </>
  );
}
