import React from 'react';

import { useModelStore } from '@/stores/model';
import {
  fetchLiteRtFiles,
  modelDisplayName,
  modelFileUrl,
  searchModels,
  type HFFile,
  type HFRepo,
} from '@/services/huggingface';

/**
 * The model picker sheet's state machine, three phases deep:
 * list → HF search → a repo's files. Owns which phase is showing, the
 * search state, and the import; the store does the rest (list contents,
 * active selection, downloads).
 *
 * The input stays controlled (live value on every keystroke); the search
 * consumes a deferred value so a burst of keystrokes doesn't queue a render
 * per letter before the fetch fires.
 */
export function useModelSheet() {
  const loadModels = useModelStore((s) => s.loadModels);
  const addCustomModel = useModelStore((s) => s.addCustomModel);

  const [visible, setVisible] = React.useState(false);
  const [view, setView] = React.useState<'list' | 'hf'>('list');

  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const [results, setResults] = React.useState<HFRepo[]>([]);
  const [searching, setSearching] = React.useState(false);

  const [repo, setRepo] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<HFFile[]>([]);
  const [loadingFiles, setLoadingFiles] = React.useState(false);

  const resetHf = React.useCallback(() => {
    setQuery('');
    setResults([]);
    setRepo(null);
    setFiles([]);
  }, []);

  const open = React.useCallback(() => {
    setVisible(true);
    // Startup hydration normally covers the list (root layout calls
    // loadModels once); this covers opening before that has landed.
    if (!useModelStore.getState().modelsHydrated) void loadModels();
  }, [loadModels]);

  const close = React.useCallback(() => {
    setVisible(false);
    setView('list');
    resetHf();
  }, [resetHf]);

  const search = React.useCallback(async () => {
    if (!deferredQuery.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      setResults(await searchModels(deferredQuery.trim()));
    } catch { /* ignore */ } finally {
      setSearching(false);
    }
  }, [deferredQuery]);

  const openRepo = React.useCallback(async (repoId: string) => {
    setRepo(repoId);
    setFiles([]);
    setLoadingFiles(true);
    try {
      setFiles(await fetchLiteRtFiles(repoId));
    } catch { /* ignore */ } finally {
      setLoadingFiles(false);
    }
  }, []);

  const backOutOfRepo = React.useCallback(() => {
    setRepo(null);
    setFiles([]);
  }, []);

  const backToList = React.useCallback(() => {
    setView('list');
    resetHf();
  }, [resetHf]);

  /** Import a file as a custom model and land back on the list view. */
  const pickFile = React.useCallback(
    async (file: HFFile) => {
      if (!repo) return;
      await addCustomModel(modelDisplayName(file.rfilename), modelFileUrl(repo, file.rfilename));
      resetHf();
      setView('list');
    },
    [repo, addCustomModel, resetHf],
  );

  return {
    visible, view,
    query, setQuery, results, searching, search,
    repo, files, loadingFiles, openRepo, backOutOfRepo,
    open, close, backToList, setView, pickFile,
  };
}
