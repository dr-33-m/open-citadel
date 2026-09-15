import React from 'react';

import { useModelStore } from '@/stores/model';
import {
  fetchLiteRtFiles,
  filterModels,
  listOfficialModels,
  modelDisplayName,
  modelFileUrl,
  smallestPlausibleBytes,
  type HFFile,
  type HFRepo,
} from '@/services/huggingface';
import { maxRunnableBytes, modelFit } from '@/utils/memory-estimator';

/** How long a fetched catalogue is reused before it is asked for again. */
const CATALOGUE_TTL_MS = 15 * 60 * 1000;

/*
 * Kept for the session rather than per open. The catalogue changes on the
 * scale of days, and fetching it again every time the sheet opened is what
 * made browsing feel slow: a spinner in front of a list that was already known.
 */
let catalogueCache: { repos: HFRepo[]; fetchedAt: number } | null = null;
const filesCache = new Map<string, { runnable: HFFile[]; filteredOut: number }>();

/**
 * Every brain this phone could plausibly run.
 *
 * The floor is deliberately optimistic, roughly half a byte per parameter,
 * which is what the most aggressive quantisation reaches, so only the
 * genuinely impossible is dropped here. The exact file sizes inside a repo
 * decide the rest.
 */
async function fetchRunnableCatalogue(): Promise<HFRepo[]> {
  const ceiling = maxRunnableBytes();
  const all = await listOfficialModels();
  if (ceiling === 0) return all;
  return all.filter((r) => {
    const floor = smallestPlausibleBytes(r.paramsB);
    return floor == null || floor <= ceiling;
  });
}

/**
 * The brain picker's state: which phase is showing (the local list, the
 * catalogue, a repo's versions), the filter, and the wiring to the model store.
 *
 * The store is read here rather than in the phase components, so they only
 * render what they are given.
 *
 * The catalogue is fetched as the sheet opens, not when Browse is tapped, so it
 * is usually ready by the time it is wanted. The filter field is uncontrolled:
 * `fieldEpoch` remounts it with an empty buffer whenever browsing starts over.
 */
export function useModelSheet() {
  const models = useModelStore((s) => s.models);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const modelsHydrated = useModelStore((s) => s.modelsHydrated);
  const loadModels = useModelStore((s) => s.loadModels);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const addCustomModel = useModelStore((s) => s.addCustomModel);

  const [visible, setVisible] = React.useState(false);
  const [view, setView] = React.useState<'list' | 'hf'>('list');

  const [query, setQuery] = React.useState('');
  const deferredQuery = React.useDeferredValue(query);
  const [fieldEpoch, setFieldEpoch] = React.useState(0);
  const [catalogue, setCatalogue] = React.useState<HFRepo[]>(() => catalogueCache?.repos ?? []);
  const [loadingCatalogue, setLoadingCatalogue] = React.useState(false);
  const [catalogueError, setCatalogueError] = React.useState<string | null>(null);
  const results = React.useMemo(
    () => filterModels(catalogue, deferredQuery),
    [catalogue, deferredQuery],
  );

  const [repo, setRepo] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<HFFile[]>([]);
  /** How many versions this phone had to be spared, so the empty state can say why. */
  const [filteredOutFiles, setFilteredOutFiles] = React.useState(0);
  const [loadingFiles, setLoadingFiles] = React.useState(false);
  // The repo most recently asked for, so a slow answer for one the reader has
  // already backed out of does not land on the next.
  const requestedRepo = React.useRef<string | null>(null);

  const loadCatalogue = React.useCallback(async (force = false) => {
    if (!force && catalogueCache && Date.now() - catalogueCache.fetchedAt < CATALOGUE_TTL_MS) {
      setCatalogue(catalogueCache.repos);
      return;
    }
    setLoadingCatalogue(true);
    setCatalogueError(null);
    try {
      const repos = await fetchRunnableCatalogue();
      catalogueCache = { repos, fetchedAt: Date.now() };
      setCatalogue(repos);
    } catch (err: unknown) {
      setCatalogueError(err instanceof Error ? err.message : 'Could not reach the model catalogue.');
    } finally {
      setLoadingCatalogue(false);
    }
  }, []);

  const resetBrowse = React.useCallback(() => {
    setQuery('');
    setFieldEpoch((epoch) => epoch + 1);
    requestedRepo.current = null;
    setRepo(null);
    setFiles([]);
  }, []);

  const open = React.useCallback(() => {
    setVisible(true);
    // Startup hydration normally covers the list; this covers opening before
    // that has landed.
    if (!useModelStore.getState().modelsHydrated) void loadModels();
    void loadCatalogue();
  }, [loadModels, loadCatalogue]);

  const close = React.useCallback(() => {
    setVisible(false);
    setView('list');
    resetBrowse();
  }, [resetBrowse]);

  const chooseModel = React.useCallback(
    (id: string) => {
      void setActiveModel(id);
      close();
    },
    [setActiveModel, close],
  );

  const browse = React.useCallback(() => {
    setView('hf');
    void loadCatalogue();
  }, [loadCatalogue]);

  const retryCatalogue = React.useCallback(() => {
    void loadCatalogue(true);
  }, [loadCatalogue]);

  const openRepo = React.useCallback(async (repoId: string) => {
    requestedRepo.current = repoId;
    setRepo(repoId);
    const cached = filesCache.get(repoId);
    if (cached) {
      setFiles(cached.runnable);
      setFilteredOutFiles(cached.filteredOut);
      return;
    }
    setFiles([]);
    setFilteredOutFiles(0);
    setLoadingFiles(true);
    try {
      const all = await fetchLiteRtFiles(repoId);
      const runnable = all.filter((f) => modelFit(f.size ?? null) !== 'wontRun');
      const entry = { runnable, filteredOut: all.length - runnable.length };
      filesCache.set(repoId, entry);
      if (requestedRepo.current !== repoId) return;
      setFiles(entry.runnable);
      setFilteredOutFiles(entry.filteredOut);
    } catch {
      // The empty state covers a failed read.
    } finally {
      if (requestedRepo.current === repoId) setLoadingFiles(false);
    }
  }, []);

  const backOutOfRepo = React.useCallback(() => {
    requestedRepo.current = null;
    setRepo(null);
    setFiles([]);
    setLoadingFiles(false);
  }, []);

  const backToList = React.useCallback(() => {
    setView('list');
    resetBrowse();
  }, [resetBrowse]);

  /** Import a version as a local brain and land back on the list. */
  const pickFile = React.useCallback(
    async (file: HFFile) => {
      if (!repo) return;
      // The catalogue already knows the exact byte size, so it is handed over
      // rather than re-probed: it is what the download is verified against.
      await addCustomModel(
        modelDisplayName(file.rfilename),
        modelFileUrl(repo, file.rfilename),
        file.size ?? null,
      );
      resetBrowse();
      setView('list');
    },
    [repo, addCustomModel, resetBrowse],
  );

  return {
    visible,
    view,
    open,
    close,
    models,
    activeModelId,
    modelsHydrated,
    chooseModel,
    browse,
    backToList,
    query,
    setQuery,
    fieldEpoch,
    results,
    loadingCatalogue,
    catalogueError,
    retryCatalogue,
    repo,
    files,
    filteredOutFiles,
    loadingFiles,
    openRepo,
    backOutOfRepo,
    pickFile,
  };
}
