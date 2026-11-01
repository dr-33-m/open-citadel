import React from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MemoryList } from '@/features/samwell-memory/components/memory-list';
import { MemorySkeleton } from '@/features/samwell-memory/components/memory-skeleton';
import { useSamwellMemory } from '@/features/samwell-memory/hooks/use-samwell-memory';

/** What Samwell has kept about them: theirs to read, and theirs to delete. */
export function SamwellMemoryPane() {
  const screen = useSamwellMemory();
  const actions = [
    { label: 'CANCEL', onPress: screen.confirm.onClose },
    { label: 'DELETE', onPress: screen.confirm.onConfirm, destructive: true },
  ];

  return (
    <>
      {screen.loaded ? <MemoryList {...screen.list} /> : <MemorySkeleton />}
      <ConfirmDialog
        visible={screen.confirm.visible}
        title="Delete everything?"
        message="Samwell will forget all of this. Your books, highlights, goals and chats stay."
        actions={actions}
        onClose={screen.confirm.onClose}
      />
    </>
  );
}
