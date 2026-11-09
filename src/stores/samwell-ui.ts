import React from 'react';
import { create } from 'zustand';

/** Every sheet the Samwell page can raise. One open at a time. */
export type SamwellSheet =
  | 'book'
  | 'post'
  | 'episode'
  | 'history'
  | 'deck'
  | 'planner'
  | 'insights'
  | 'overview'
  | 'past-goals'
  | 'about-compass'
  | 'episode-transcript';

/** The two kinds of tool in the drawer, a tab each. */
export type ToolboxTab = 'reading' | 'compass';

/** What a chat switch is on its way to: a new chat, or a saved one by id. */
export type SwitchingTarget = 'new' | string | null;

type SamwellUiStore = {
  /** The sheet up, or none. */
  sheet: SamwellSheet | null;
  /** The drawer of tools under the composer. */
  toolboxOpen: boolean;
  /** Which of its tabs is showing, kept while the reader is away. */
  toolboxTab: ToolboxTab;
  /** A chat switch under way, so History and New chat can hold off. */
  chatSwitching: SwitchingTarget;
  /**
   * The reader's message, drawn before the store has it (an on-device first
   * turn is a real wait), under the id it will be committed with.
   */
  pendingUserMessage: { id: string; content: string } | null;
  /**
   * The composer card's height, without the toolbox under it: what a
   * transcript keeps clear of. It changes when the field grows a line, not
   * while the toolbox slides, which used to redraw the page every frame.
   */
  composerHeight: number;

  openSheet: (sheet: SamwellSheet) => void;
  /** Closes this sheet, if it is the one up: a late dismiss never shuts the next. */
  closeSheet: (sheet: SamwellSheet) => void;
  setToolboxOpen: (open: boolean) => void;
  setToolboxTab: (tab: ToolboxTab) => void;
  setComposerHeight: (height: number) => void;
  set: (patch: Partial<Pick<SamwellUiStore, 'chatSwitching' | 'pendingUserMessage'>>) => void;
};

/**
 * The Samwell page's own moment-to-moment state, outside any component.
 *
 * It used to be thirteen `useState`s on the page itself, the app's largest
 * render: opening the toolbox, raising a sheet or switching chats redrew the
 * whole page, transcript and every bubble included, and the toolbox did it
 * five times as it slid open (measured on a Galaxy A33). Held here, each part
 * of the page subscribes to the one field it draws from, so opening a sheet
 * draws the sheet and nothing else.
 */
export const useSamwellUiStore = create<SamwellUiStore>((set) => ({
  sheet: null,
  toolboxOpen: false,
  toolboxTab: 'reading',
  chatSwitching: null,
  pendingUserMessage: null,
  composerHeight: 0,
  openSheet: (sheet) => set({ sheet }),
  closeSheet: (sheet) => set((s) => (s.sheet === sheet ? { sheet: null } : s)),
  setToolboxOpen: (toolboxOpen) => set({ toolboxOpen }),
  setToolboxTab: (toolboxTab) => set({ toolboxTab }),
  // Whole points: a sub-pixel wobble in a measurement is not a new height.
  setComposerHeight: (height) => set((s) => (Math.round(height) === s.composerHeight ? s : { composerHeight: Math.round(height) })),
  set: (patch) => set(patch),
}));

/** Whether one sheet is up: a boolean per sheet, so the others do not redraw. */
export function useSheetVisible(sheet: SamwellSheet): boolean {
  return useSamwellUiStore((s) => s.sheet === sheet);
}

/** Whether one of these sheets is the one up. */
export function useSheetAsked(sheets: readonly SamwellSheet[]): boolean {
  return useSamwellUiStore((s) => s.sheet != null && sheets.includes(s.sheet));
}

/** One sheet's open flag and its stable close, to spread onto it. */
export function useSamwellSheet(sheet: SamwellSheet) {
  const visible = useSheetVisible(sheet);
  const closeSheet = useSamwellUiStore((s) => s.closeSheet);
  const onClose = React.useCallback(() => closeSheet(sheet), [closeSheet, sheet]);
  return { visible, onClose };
}
