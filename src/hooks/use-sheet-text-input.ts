import { useBottomSheetInternal } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef } from 'react';
import { findNodeHandle, TextInput, type TextInputProps } from 'react-native';

type FocusHandler = NonNullable<TextInputProps['onFocus']>;
type BlurHandler = NonNullable<TextInputProps['onBlur']>;

/**
 * `TextInput.State.currentlyFocusedInput()` is typed as the new-architecture
 * element, which `findNodeHandle` predates — the value is exactly what it
 * wants, only the declaration disagrees.
 */
function nodeHandleOf(instance: unknown): number | null {
  return findNodeHandle(instance as Parameters<typeof findNodeHandle>[0]);
}

/**
 * Makes an ordinary `TextInput` visible to the bottom sheet it is inside.
 *
 * A sheet does not react to the keyboard because the keyboard appeared — it
 * reacts because a field *it knows about* took focus. `@gorhom/bottom-sheet`
 * caches every keyboard event until one of its registered inputs reports a
 * focus target, and drops it otherwise: a plain `TextInput` in a sheet gets
 * the keyboard drawn straight over it and the sheet never moves. The library
 * ships `BottomSheetTextInput` for this, but that is a different component
 * from the one the app's `Input` is built on, so the registration is lifted
 * out here instead and the field stays exactly the field it was.
 *
 * Outside a sheet this is inert — `useBottomSheetInternal(true)` returns null
 * rather than throwing, so the same `Input` renders unchanged on a page.
 *
 * Mirrors `BottomSheetTextInput`'s own `handleOnFocus`/`handleOnBlur` and its
 * node bookkeeping, which is what the library's keyboard docs point a custom
 * field at.
 */
export function useSheetTextInput({
  onFocus,
  onBlur,
}: {
  onFocus?: FocusHandler;
  onBlur?: BlurHandler;
}) {
  const internal = useBottomSheetInternal(true);
  const ref = useRef<TextInput | null>(null);

  const handleFocus = useCallback<FocusHandler>(
    (event) => {
      internal?.animatedKeyboardState.set((state) => ({
        ...state,
        target: event.nativeEvent.target,
      }));
      onFocus?.(event);
    },
    [internal, onFocus],
  );

  const handleBlur = useCallback<BlurHandler>(
    (event) => {
      if (internal) {
        const { animatedKeyboardState, textInputNodesRef } = internal;
        const focused = nodeHandleOf(TextInput.State.currentlyFocusedInput());
        // Only give up the target if it is ours to give up, and only if focus
        // has not already moved to another field in the same sheet — moving
        // between two fields must not let the sheet drop back down between
        // them.
        const isOurTarget = animatedKeyboardState.get().target === event.nativeEvent.target;
        const movedWithinSheet = focused != null && textInputNodesRef.current.has(focused);
        if (isOurTarget && !movedWithinSheet) {
          animatedKeyboardState.set((state) => ({ ...state, target: undefined }));
        }
      }
      onBlur?.(event);
    },
    [internal, onBlur],
  );

  useEffect(() => {
    if (!internal) return;
    const { animatedKeyboardState, textInputNodesRef } = internal;
    const node = nodeHandleOf(ref.current);
    if (node == null) return;
    textInputNodesRef.current.add(node);
    return () => {
      // The unmounting field must not leave itself behind as the sheet's
      // keyboard target, or the sheet stays lifted with nothing focused.
      if (animatedKeyboardState.get().target === node) {
        animatedKeyboardState.set((state) => ({ ...state, target: undefined }));
      }
      textInputNodesRef.current.delete(node);
    };
  }, [internal]);

  return {
    /** Attach to the field, alongside whatever ref the caller was given. */
    ref,
    /** True when this field is inside a bottom sheet. */
    insideSheet: internal !== null,
    onFocus: handleFocus,
    onBlur: handleBlur,
  };
}
