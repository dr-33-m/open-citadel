import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Portal } from '@/components/ui/portal';
import { ToastItem } from '@/components/toast/toast-item';
import type { ToastEntry, ToastOptions } from '@/components/toast/types';

type ToastContextValue = {
  showToast: (options: ToastOptions) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * The app's toasts.
 *
 * Rendered through `Portal`, which puts them above every sheet in the app.
 * Inside the normal tree they would be drawn under the sheet that raised them —
 * and the log deck, which is the one surface that raises toasts today, is a
 * sheet.
 *
 * No haptic on show. The callers that raise a toast are already confirming
 * something they did (`haptics.commit` on a log, `warn` on a miss), and a
 * second buzz for the notice about it reads as a stutter.
 */
/**
 * Raise a toast from outside React.
 *
 * A title rename is decided in a store (`stores/chat.ts`,
 * `stores/compass-chat.ts`), nowhere near a component, and it should announce
 * itself with the same notice the log deck uses. The provider registers its
 * enqueue function here while it is mounted; a call before that, or after the
 * tree is gone, is a silent no-op rather than a crash. Components still use
 * `useToast()`.
 */
let imperativeEnqueue: ((options: ToastOptions) => void) | null = null;

export function showToast(options: ToastOptions): void {
  imperativeEnqueue?.(options);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = React.useState<ToastEntry[]>([]);
  const nextId = React.useRef(1);

  /*
   * A keyed toast writes over the one already on screen under that key rather
   * than joining the pile behind it. See `key` in `types.ts` for why.
   *
   * One that is already fading is past arguing with: it keeps its id out of
   * the way and the new notice arrives as its own toast, so a reply that comes
   * back after the opening line has timed out is still seen.
   */
  const enqueue = React.useCallback((options: ToastOptions) => {
    setToasts((current) => {
      const live =
        options.key != null
          ? current.findIndex((t) => t.key === options.key && !t.exiting)
          : -1;
      if (live === -1) {
        return [...current, { id: nextId.current++, revision: 0, ...options }];
      }
      const previous = current[live];
      const next = [...current];
      // The id is kept, which is what keeps it in place in the pile instead of
      // dropping to the front as a new arrival.
      next[live] = { ...options, id: previous.id, revision: previous.revision + 1 };
      return next;
    });
  }, []);

  // The one live provider owns the imperative bridge for as long as it is
  // mounted. This provider wraps the whole app, so there is only ever one.
  React.useEffect(() => {
    imperativeEnqueue = enqueue;
    return () => {
      if (imperativeEnqueue === enqueue) imperativeEnqueue = null;
    };
  }, [enqueue]);

  const handleDismissStart = React.useCallback((id: number) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
  }, []);

  const handleDismissed = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(() => ({ showToast: enqueue }), [enqueue]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Only while there is something to show.
       *
       * This provider wraps the whole app, so an always-mounted `Portal` here
       * keeps a permanent entry in the portal host — and every render of this
       * provider then hands the host a new element, which re-renders the host
       * and with it every OTHER portal fragment, the open sheets included.
       * Measured on a `medium_phone`: switching between chat and Compass cost
       * 420 dropped frames over six switches with the portal always mounted,
       * and 58 without it. An empty toast stack has nothing to draw, so it has
       * no business being in the host at all. */}
      {toasts.length > 0 && (
        <Portal>
          <View
            pointerEvents="box-none"
            style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0 }}
          >
            {toasts.map((toast) => (
              <ToastItem
                key={toast.id}
                toast={toast}
                /* Depth is how many LIVE toasts arrived after this one — not
                   where it sits in the array. One that is already fading out
                   has left the stack, so the pile closes over it immediately
                   instead of holding a gap until React drops the row. */
                index={toasts.filter((t) => !t.exiting && t.id > toast.id).length}
                onDismissStart={handleDismissStart}
                onDismissed={handleDismissed}
              />
            ))}
          </View>
        </Portal>
      )}
    </ToastContext.Provider>
  );
}

/** Raise a toast. Only inside `ToastProvider`, which is mounted app-wide. */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
