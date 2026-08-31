/**
 * SearchBar — a text field for querying a list, with the two controls a search
 * needs and an ordinary field does not.
 *
 * ```tsx
 * <SearchBar placeholder="Search orders" onSubmit={run} />
 * <SearchBar variant="filled" shape="pill" cancel="focus" />
 * <SearchBar debounce={250} onDebouncedChange={filter} loading={pending} />
 * ```
 *
 * ## The clear button, and why it is not the platform's
 *
 * A ✕ appears inside the field as soon as there is something to clear, and
 * takes it back to empty without dismissing the keyboard — clearing a query is
 * the start of the next one, not the end of the search. It is drawn here
 * rather than left to `clearButtonMode`, which exists on iOS only, cannot be
 * labelled for a screen reader and cannot be swapped for a spinner while
 * results are in flight.
 *
 * The glyph is 24 points and its touch box is 48, made up with slop rather
 * than with size. A 48-point circle inside a 40-point field either overflows
 * it or forces every search bar in an app to be as tall as the largest one.
 *
 * ## Cancel is a row, not a decoration
 *
 * `cancel="focus"` puts a Cancel button beside the field and slides it in
 * while the field is being edited, which is the platform's own answer to
 * "how do I get out of this search". It is a sibling of the field rather than
 * something inside it, because it acts on the search as a whole: it empties
 * the query, drops focus and calls `onCancel`, and a control that ends the
 * thing it sits inside reads as part of the query it is about to discard.
 *
 * Its width is measured once and animated on the UI thread. The button is
 * always mounted when `cancel` is not `never`, so the measurement is already
 * there the first time the field is touched and the first slide is as smooth
 * as the tenth.
 *
 * ## Debouncing belongs to the caller's search, not to the field
 *
 * `onChangeText` always fires on every keystroke — a controlled field that
 * lags its own input is unusable. `debounce` is about the *query*: it holds
 * `onDebouncedChange` until typing pauses, so a network search runs once per
 * pause instead of once per letter. Submitting flushes it immediately, since
 * a return key is somebody saying they are done waiting.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInput,
  type TextInputSubmitEditingEventData,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tv, type VariantProps } from 'tailwind-variants';
import { SearchIcon, XIcon } from '@/components/ui/icons';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { Text } from '@/components/ui/text';
import { Input, type InputProps } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  cancelSearchBarDebounce,
  flushSearchBarDebounce,
  scheduleSearchBarDebounce,
  type SearchBarDebounceTimer,
} from '@/components/ui/search-bar-debounce';

/** Matches the field's own focus crossfade, so the row settles as one thing. */
const CANCEL_DURATION = 180;

/** Space kept between the field and the Cancel button while it is out. */
const CANCEL_GAP = 8;

/**
 * Slop around the 24-point clear glyph, taking its touch box to 48 without
 * changing the height of the field it sits in.
 */
const CLEAR_HIT_SLOP = 12;

const searchBarVariants = tv({
  slots: {
    row: 'w-full flex-row items-center',
    field: '',
    // Clipped, because this is what the Cancel button is revealed out of: the
    // button keeps its measured width and the container's grows past it.
    //
    // `self-stretch` gives it the row's height, which it has no other way of
    // getting — its only child is positioned absolutely, so it has no content
    // to be as tall as.
    cancelClip: 'self-stretch overflow-hidden',
    cancelButton: 'absolute bottom-0 end-0 top-0 items-center justify-center ps-2',
    cancelLabel: 'font-medium text-primary',
    clear: 'items-center justify-center rounded-full',
  },
  variants: {
    size: {
      sm: { cancelLabel: 'text-[14px]', clear: 'h-6 w-6' },
      md: { cancelLabel: 'text-[16px]', clear: 'h-6 w-6' },
      lg: { cancelLabel: 'text-[16px]', clear: 'h-7 w-7' },
    },
    /**
     * The field's corner. `pill` is the shape a search field takes when it is
     * chrome — sitting above a list, in a header — and `rounded` the one it
     * takes inside a form beside other fields.
     */
    shape: {
      rounded: { field: '' },
      pill: { field: 'rounded-full' },
    },
  },
  defaultVariants: {
    size: 'md',
    shape: 'rounded',
  },
});

type SearchBarVariantProps = VariantProps<typeof searchBarVariants>;

/** Glyph sizes per field size — the icon tracks the text, not the box. */
const ICON_SIZE = { sm: 16, md: 18, lg: 20 } as const;

/**
 * What SearchBar takes from Input, minus everything it owns itself. The form
 * furniture is dropped along with it: a label and an error line stack above
 * and below the field, and Cancel sits beside the whole stack rather than
 * beside the field it belongs to. Use `Field` for a search that is one answer
 * in a form.
 */
type InheritedInputProps = Omit<
  InputProps,
  | 'defaultValue'
  | 'description'
  | 'endContent'
  | 'errorMessage'
  | 'interactiveContent'
  | 'isRequired'
  | 'label'
  | 'multiline'
  | 'onChangeText'
  | 'size'
  | 'startContent'
  | 'value'
>;

export interface SearchBarProps extends InheritedInputProps, SearchBarVariantProps {
  /**
   * The field's background, from `Input`. `outline` draws its own edge, for a
   * search bar sitting on the page; `filled` drops it, for one inside a card
   * or a header where a second border reads as a seam. Defaults to `outline`.
   */
  variant?: InputProps['variant'];
  /** The query, when the caller holds it. Leave unset to let the field keep it. */
  value?: string;
  /** Starting query for an uncontrolled field. Ignored once `value` is passed. */
  defaultValue?: string;
  /** Fires on every keystroke. For a search that costs something, see `debounce`. */
  onChangeText?: (value: string) => void;
  /** The return key, which is labelled Search. Flushes `onDebouncedChange` first. */
  onSubmit?: (value: string) => void;
  /**
   * How long typing has to pause before `onDebouncedChange` runs, in
   * milliseconds. `0` runs it on every keystroke, which is only right for a
   * filter over a list already in memory.
   */
  debounce?: number;
  /** The query, once typing has paused for `debounce` milliseconds. */
  onDebouncedChange?: (value: string) => void;
  /** Fires after the ✕ empties the field. The field keeps focus. */
  onClear?: () => void;
  /** Fires after Cancel empties the field and drops focus. */
  onCancel?: () => void;
  /** Whether the ✕ appears once there is a query. */
  isClearable?: boolean;
  /**
   * When the Cancel button is beside the field. `focus` slides it in while the
   * field is being edited and away again when it is not, which is what a
   * search bar above a list wants. `always` keeps it out, for a screen that is
   * nothing but the search.
   */
  cancel?: 'never' | 'focus' | 'always';
  /** The Cancel button's word. */
  cancelLabel?: string;
  /** How the ✕ announces itself. */
  clearLabel?: string;
  /**
   * Results are on their way. A spinner takes the ✕'s place, because the two
   * would otherwise sit on top of one another at exactly the moment a query is
   * both non-empty and running.
   */
  loading?: boolean;
  /** The leading glyph, for a search over something with a symbol of its own. */
  icon?: ReactNode;
}

export const SearchBar = forwardRef<TextInput, SearchBarProps>(
  (
    {
      value: valueProp,
      defaultValue,
      onChangeText,
      onSubmit,
      debounce = 0,
      onDebouncedChange,
      onClear,
      onCancel,
      isClearable = true,
      cancel = 'never',
      cancelLabel = 'Cancel',
      clearLabel = 'Clear search',
      loading = false,
      icon,
      shape,
      size = 'md',
      className,
      containerClassName,
      disabled,
      onFocus,
      onBlur,
      onSubmitEditing,
      ...props
    },
    ref
  ) => {
    const controlled = valueProp !== undefined;
    const [internal, setInternal] = useState(defaultValue ?? '');
    const text = controlled ? valueProp : internal;

    const [focused, setFocused] = useState(false);
    const inputRef = useRef<TextInput | null>(null);
    useImperativeHandle(ref, () => inputRef.current as TextInput, []);

    const slots = searchBarVariants({ size, shape });

    const setText = useCallback(
      (next: string) => {
        if (!controlled) setInternal(next);
        onChangeText?.(next);
      },
      [controlled, onChangeText]
    );

    /*
     * The debounced callback is read through a ref so an inline arrow function
     * — which is what a caller writes — does not restart the timer on every
     * render and push the pause out forever.
     */
    const debouncedRef = useRef(onDebouncedChange);
    const debounceTimerRef = useRef<SearchBarDebounceTimer['current']>(null);
    useEffect(() => {
      debouncedRef.current = onDebouncedChange;
    });

    // Skipped on mount: nothing was typed, so there is no pause to be at the
    // end of, and firing here would run a search for the initial value.
    const settled = useRef(false);
    useEffect(() => {
      if (!settled.current) {
        settled.current = true;
        return;
      }
      scheduleSearchBarDebounce(debounceTimerRef, debouncedRef.current, text, debounce);
      return () => {
        cancelSearchBarDebounce(debounceTimerRef);
      };
    }, [text, debounce]);

    const handleFocus = useCallback<NonNullable<InputProps['onFocus']>>(
      (event) => {
        setFocused(true);
        onFocus?.(event);
      },
      [onFocus]
    );

    const handleBlur = useCallback<NonNullable<InputProps['onBlur']>>(
      (event) => {
        setFocused(false);
        onBlur?.(event);
      },
      [onBlur]
    );

    const handleSubmit = useCallback(
      (event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
        if (disabled) return;
        // A return key is somebody saying they are done waiting, so the
        // pending pause is spent rather than waited out.
        flushSearchBarDebounce(debounceTimerRef, debouncedRef.current, text);
        onSubmit?.(text);
        onSubmitEditing?.(event);
      },
      [disabled, onSubmit, onSubmitEditing, text]
    );

    const handleClear = useCallback(() => {
      if (disabled) return;
      setText('');
      // Uncontrolled: the native buffer owns the text, so React's `value`
      // commit that clears a controlled field does not exist here — the
      // buffer is emptied imperatively instead.
      if (!controlled) inputRef.current?.clear();
      onClear?.();
      // The keyboard stays: clearing a query is the start of the next one.
      // Android takes focus away with the press, so it is asked back.
      inputRef.current?.focus();
    }, [controlled, disabled, onClear, setText]);

    const handleCancel = useCallback(() => {
      if (disabled) return;
      setText('');
      if (!controlled) inputRef.current?.clear();
      inputRef.current?.blur();
      onCancel?.();
    }, [controlled, disabled, onCancel, setText]);

    /*
     * Cancel's width is measured once and driven from a shared value, so the
     * slide costs no re-render. `cancelWidth` is a shared value rather than
     * state for the same reason — a measurement that arrives as state would
     * re-render the field it is beside.
     */
    const cancelWidth = useSharedValue(0);
    const cancelOut = cancel === 'always' || (cancel === 'focus' && focused);
    const cancelProgress = useSharedValue(cancel === 'always' ? 1 : 0);

    useEffect(() => {
      if (cancel === 'never') return;
      cancelProgress.value = withTiming(cancelOut ? 1 : 0, {
        duration: CANCEL_DURATION,
      });
    }, [cancel, cancelOut, cancelProgress]);

    const cancelStyle = useAnimatedStyle(() => ({
      width: (cancelWidth.value + CANCEL_GAP) * cancelProgress.value,
      opacity: cancelProgress.value,
    }));

    const handleCancelLayout = useCallback(
      (event: LayoutChangeEvent) => {
        cancelWidth.value = event.nativeEvent.layout.width;
      },
      [cancelWidth]
    );

    const startContent = (
      /*
       * Decorative, and said so here rather than through Input's
       * `interactiveContent` — that flag covers both ends of the field, and
       * turning it off to quieten the magnifier would take the clear button's
       * touches with it.
       */
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon ?? <SearchIcon size={ICON_SIZE[size]} />}
      </View>
    );

    const endContent = loading ? (
      <Spinner size="sm" />
    ) : isClearable && text.length > 0 ? (
      <AnimatedPressable
        onPress={handleClear}
        disabled={disabled}
        hitSlop={CLEAR_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={clearLabel}
        className={slots.clear()}
      >
        <XIcon size={ICON_SIZE[size]} />
      </AnimatedPressable>
    ) : null;

    /*
     * The field is only given a `value` when the caller controls it. An
     * uncontrolled field keeps its text in the native buffer, and React
     * merely mirrors it (`onChangeText` → `internal`) — never the other way
     * round. That direction matters: every controlled commit re-sets the
     * field from React state, and a keystroke that lands while the JS thread
     * is busy (a list re-rendering behind the search, say) gets committed
     * over by a stale string — the letter is dropped, or the IME re-inserts
     * it and the word duplicates. With the buffer native-owned there is
     * nothing to race.
     */
    const field = (
      <Input
        ref={inputRef}
        size={size}
        disabled={disabled}
        className={slots.field({ className })}
        containerClassName={cancel === 'never' ? containerClassName : 'flex-1'}
        startContent={startContent}
        endContent={endContent}
        {...(controlled ? { value: text } : { defaultValue })}
        onChangeText={setText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSubmitEditing={handleSubmit}
        accessibilityRole="search"
        returnKeyType="search"
        // The platform's own ✕ would sit on top of this component's, and only
        // on iOS.
        clearButtonMode="never"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder="Search"
        {...props}
      />
    );

    if (cancel === 'never') return field;

    return (
      <View className={slots.row({ className: containerClassName })}>
        {field}
        <Animated.View
          style={cancelStyle}
          className={slots.cancelClip()}
          pointerEvents={cancelOut ? 'auto' : 'none'}
          accessibilityElementsHidden={!cancelOut}
          importantForAccessibility={cancelOut ? 'auto' : 'no-hide-descendants'}
        >
          {/*
           * Absolute, and pinned to the end edge: it keeps its natural width
           * inside a container whose width is animating, so the clip reveals
           * it from the edge instead of squeezing the word as it arrives. It
           * is also what makes the measurement possible at all — a child laid
           * out against a container of width 0 would otherwise report 0.
           */}
          <AnimatedPressable
            onLayout={handleCancelLayout}
            onPress={handleCancel}
            disabled={disabled}
            focusable={!disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!disabled }}
            className={slots.cancelButton()}
          >
            <Text className={slots.cancelLabel()}>{cancelLabel}</Text>
          </AnimatedPressable>
        </Animated.View>
      </View>
    );
  }
);

SearchBar.displayName = 'SearchBar';
