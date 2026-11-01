import { useMutation, useQuery } from '@tanstack/react-query';
import React from 'react';

import { showToast } from '@/components/toast/toast-provider';
import { memoryRows, memorySubtitle, type MemoryRow } from '@/features/samwell-memory/utils/memory-rows';
import { queryClient } from '@/lib/query-client';
import { createSamwellMemoryQueryOptions, samwellMemoryKeys } from '@/query-manager/samwell-memory';
import { forgetEverything, forgetNote, forgetProfile } from '@/services/samwell-memory';

const TOAST = 'samwell-memory';
const NO_ROWS: MemoryRow[] = [];

/** Reading what Samwell has kept, and deleting any of it. */
export function useSamwellMemory() {
  const { data, isPending } = useQuery(createSamwellMemoryQueryOptions());
  const [confirming, setConfirming] = React.useState(false);

  const { mutate } = useMutation({
    mutationFn: async (work: () => void) => work(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: samwellMemoryKeys.all }),
    onError: () => showToast({ message: 'That could not be deleted. Try again.', key: TOAST }),
  });

  const rows = React.useMemo(() => (data ? memoryRows(data.profile, data.notes) : NO_ROWS), [data]);
  const onForgetNote = React.useCallback((id: string) => mutate(() => forgetNote(id)), [mutate]);
  const onForgetProfile = React.useCallback(() => mutate(forgetProfile), [mutate]);
  const onForgetAll = React.useCallback(() => setConfirming(true), []);
  const closeConfirm = React.useCallback(() => setConfirming(false), []);
  const confirmForgetAll = React.useCallback(() => {
    setConfirming(false);
    mutate(forgetEverything);
  }, [mutate]);

  return {
    loaded: !isPending,
    list: {
      rows,
      subtitle: memorySubtitle(data?.profile ?? null, data?.notes.length ?? 0),
      onForgetNote,
      onForgetProfile,
      onForgetAll,
    },
    confirm: { visible: confirming, onClose: closeConfirm, onConfirm: confirmForgetAll },
  };
}
