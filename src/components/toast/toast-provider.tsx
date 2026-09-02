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
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = React.useState<ToastEntry[]>([]);
  const nextId = React.useRef(1);

  const showToast = React.useCallback((options: ToastOptions) => {
    setToasts((current) => [...current, { id: nextId.current++, ...options }]);
  }, []);

  const handleDismissStart = React.useCallback((id: number) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
  }, []);

  const handleDismissed = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(() => ({ showToast }), [showToast]);

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
