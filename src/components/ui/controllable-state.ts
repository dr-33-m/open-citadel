import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

const identity = <T,>(value: T): T => value;
const objectIs = <T,>(left: T, right: T): boolean => Object.is(left, right);

export interface ControllableStateOptions<T> {
  /** Accepted owner state. `undefined` selects uncontrolled ownership. */
  value: T | undefined;
  /** Initial state used only while uncontrolled. */
  defaultValue: T;
  /** Reports a distinct requested value exactly once per setter invocation. */
  onChange?: (value: T) => void;
  /** Reports accepted state changes, whether requested or externally reset. */
  onSettled?: (value: T) => void;
  /** Normalize defaults, controlled values, and requests through one boundary. */
  normalize?: (value: T) => T;
  /** Equality used for no-op requests and accepted settlement. */
  isEqual?: (left: T, right: T) => boolean;
  /** Stable semantic identity for controlled objects recreated by their owner. */
  getValueKey?: (value: T) => unknown;
}

export interface ControllableStateResult<T> {
  /** State accepted by the current owner; controlled requests never render optimistically. */
  value: T;
  setValue: Dispatch<SetStateAction<T>>;
  isControlled: boolean;
}

/**
 * Owner-driven controlled/uncontrolled state with an explicit settlement edge.
 *
 * Switching from controlled to uncontrolled retains the last accepted owner
 * value instead of resurrecting a stale default. Switching into controlled
 * mode adopts the prop immediately. `undefined` is the ownership sentinel and
 * therefore cannot itself be a controlled value; use `null` for empty state.
 */
export function useControllableState<T>({
  value: valueProp,
  defaultValue,
  onChange,
  onSettled,
  normalize = identity,
  isEqual = objectIs,
  getValueKey,
}: ControllableStateOptions<T>): ControllableStateResult<T> {
  const [internalValue, setInternalValue] = useState(() =>
    normalize(defaultValue)
  );
  const isControlled = valueProp !== undefined;
  const controlledKey = isControlled
    ? getValueKey
      ? getValueKey(valueProp as T)
      : valueProp
    : undefined;
  const controlledValue = useMemo(
    () => (isControlled ? normalize(valueProp as T) : undefined),
    // The semantic key deliberately replaces object identity for equivalent owner values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controlledKey, isControlled, normalize]
  );
  const wasControlled = useRef(isControlled);
  const lastControlledValue = useRef<T | undefined>(controlledValue);
  if (isControlled) lastControlledValue.current = controlledValue;

  const leavingControlled = wasControlled.current && !isControlled;
  const value = isControlled
    ? (controlledValue as T)
    : leavingControlled
      ? (lastControlledValue.current as T)
      : internalValue;
  const valueRef = useRef(value);
  valueRef.current = value;

  useLayoutEffect(() => {
    if (wasControlled.current && !isControlled) {
      setInternalValue(lastControlledValue.current as T);
    }
    wasControlled.current = isControlled;
  }, [isControlled]);

  const previousSettled = useRef(value);
  useLayoutEffect(() => {
    if (isEqual(previousSettled.current, value)) return;
    previousSettled.current = value;
    onSettled?.(value);
  }, [isEqual, onSettled, value]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const requested = normalize(
        typeof next === 'function'
          ? (next as (current: T) => T)(valueRef.current)
          : next
      );
      if (isEqual(valueRef.current, requested)) return;
      if (!isControlled) setInternalValue(requested);
      onChange?.(requested);
    },
    [isControlled, isEqual, normalize, onChange]
  );

  return { value, setValue, isControlled };
}
