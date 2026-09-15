import { AppState, type NativeEventSubscription } from 'react-native';
import { Image } from 'expo-image';

import * as Inference from '@/services/inference';
import { useChatStore } from '@/stores/chat';
import { useModelStore } from '@/stores/model';

/**
 * Frees the on-device engine and decoded image bitmaps when the OS signals
 * memory pressure or the app leaves the foreground.
 *
 * A resident litert model plus its KV cache is by far the largest native
 * allocation the app makes, and litert's own docs are explicit that an
 * allocation failure under pressure bypasses the Kotlin/Swift try/catch and
 * takes the whole process down — which is the "app just goes black after a
 * while" report. Catching after the fact can't help; the only real defence is
 * not to be holding that memory when the system is tight. The engine reloads
 * lazily the next time it's needed (the wake dialog in `use-samwell-wake`).
 *
 * Wired once from the root layout.
 */

let subscriptions: NativeEventSubscription[] = [];

function release(): void {
  // A generation in flight owns the engine — tearing it down mid-stream would
  // crash the very native call this is meant to protect. Skip; the next
  // background/warning after it finishes will catch it.
  if (Inference.isModelLoaded() && !useChatStore.getState().isGenerating) {
    void useModelStore.getState().releaseContext();
  }
  // Cheap and always safe: drop decoded covers/artwork from the in-memory
  // cache. They rehydrate from disk on next display.
  void Image.clearMemoryCache();
}

export function startModelLifecycle(): void {
  if (subscriptions.length > 0) return; // idempotent

  subscriptions.push(
    AppState.addEventListener('change', (state) => {
      // Not visible: no reason to hold a GPU-resident model, and iOS is
      // quickest to kill a backgrounded app that does.
      if (state === 'background') release();
    }),
  );

  subscriptions.push(
    // iOS: UIApplicationDidReceiveMemoryWarning. Recent React Native also
    // routes Android's onTrimMemory/onLowMemory through this event.
    AppState.addEventListener('memoryWarning', release),
  );
}

export function stopModelLifecycle(): void {
  subscriptions.forEach((s) => s.remove());
  subscriptions = [];
}
