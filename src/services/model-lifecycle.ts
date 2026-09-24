import { AppState, type NativeEventSubscription } from 'react-native';
import { Image } from 'expo-image';

import { isEngineLoaded } from '@/services/device-llm/engine';
import { errandRunning } from '@/services/device-llm/errands';
import { useChatStore } from '@/stores/chat';
import { useModelStore } from '@/stores/model';

/**
 * Frees the on-device engine and decoded image bitmaps when the OS signals
 * memory pressure or the app leaves the foreground.
 *
 * A resident model plus its KV cache is by far the largest native allocation
 * the app makes, and a backgrounded app holding gigabytes is the first one the
 * OS kills. ExecuTorch plans that memory once, at load, so it does not grow
 * while Samwell talks, but it is all still held until the model is freed. The
 * engine reloads the next time it's needed (the wake dialog in
 * `use-samwell-wake`).
 *
 * Wired once from the root layout.
 */

let subscriptions: NativeEventSubscription[] = [];

function release(): void {
  // A generation in flight owns the engine — tearing it down mid-stream would
  // crash the very native call this is meant to protect. So does a chat
  // being named. Skip; the next background/warning after it finishes will
  // catch it.
  if (isEngineLoaded() && !useChatStore.getState().isGenerating && !errandRunning()) {
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
      // Not visible: no reason to hold the model, and iOS is quickest to
      // kill a backgrounded app that does.
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
