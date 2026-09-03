/**
 * Reasoning — the model's working, shown while it happens and folded away after.
 *
 * A reasoning trace is interesting for exactly as long as it is the only thing
 * arriving. Once the answer starts, it is a wall of text above the thing the
 * reader actually asked for. So it opens itself when the trace starts streaming
 * and closes itself about a second after it stops — once, and only if it ever
 * streamed, because a trace that arrives complete was never a live thing to
 * watch and should not perform.
 *
 * The trigger changes with it: a shimmering "Thinking…" while the tokens are
 * coming, and "Thought for 8 seconds" afterwards. The duration is measured from
 * the first streaming frame rather than taken on trust, so it is the time the
 * reader actually waited.
 *
 * ```tsx
 * <Reasoning isStreaming={streaming}>
 *   <Reasoning.Trigger />
 *   <Reasoning.Content>{text}</Reasoning.Content>
 * </Reasoning>
 * ```
 *
 * ## Where the props come from
 *
 * With the AI SDK, `isStreaming` is whether the last part of the last message
 * is a reasoning part while the request is still streaming, and the content is
 * every `reasoning` part joined together. Joined, not one component each:
 * some models emit a run of separate reasoning parts, and one component per
 * part is a column of "Thinking…" rows for a single thought.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, ScrollView, View, type PressableProps, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tv } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { ChevronDownIcon } from '@/components/ui/icons';
import { Collapse } from '@/components/ui/collapse';
import { Text, textChildren } from '@/components/ui/text';
import { ThinkingOrb } from '@/components/ui/thinking-orb';
import { cn } from '@/lib/cn';
import { Shimmer } from '@/components/ui/shimmer';
import { asColor } from '@/utils/colors';

/**
 * How long the finished trace stays open before folding away.
 *
 * Long enough that the fold reads as a consequence of the trace ending rather
 * than as part of it, short enough that nobody is waiting on it.
 */
const AUTO_CLOSE_DELAY = 1000;

/**
 * Citadel edit — the tallest the open trace is allowed to get.
 *
 * A reasoning model can run for minutes and produce a trace far longer than
 * the screen. Left to grow it shoved the whole transcript around on every
 * token; capped, it scrolls inside its own frame and the messages hold still.
 * About nine lines at the trace's own type size.
 */
const TRACE_MAX_HEIGHT = 200;

/**
 * Citadel edit — the trigger's words for a finished trace.
 *
 * Upstream only ever said "Thought for N seconds", which reads wrong once a
 * reasoning model has been going for minutes: "Thought for 184 seconds" is a
 * number nobody parses at a glance. Past a minute this switches to minutes
 * (with the seconds remainder when there is one). The vague fallback stays for
 * the case where nothing measured a duration at all.
 *
 * Exported so the app's `TurnStatus` wrapper puts the same words on its own
 * custom trigger.
 */
export function thoughtForLabel(duration: number | undefined): string {
  if (duration === undefined) return 'Thought for a few seconds';
  if (duration < 60) {
    return `Thought for ${duration} ${duration === 1 ? 'second' : 'seconds'}`;
  }
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  const minutePart = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  if (seconds === 0) return `Thought for ${minutePart}`;
  return `Thought for ${minutePart} ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

const reasoningVariants = tv({
  slots: {
    root: 'w-full gap-2',
    trigger: 'flex-row items-center gap-2 py-0.5',
    label: 'text-sm text-muted-foreground',
    content: 'gap-2 ps-6',
    contentText: 'text-sm leading-relaxed text-muted-foreground',
  },
});

interface ReasoningContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  /*
   * Citadel addition (the app's thinking row needed a tap the auto rules
   * could not overrule): the reader's own toggle, which records their intent
   * so auto-open and auto-close stand down once they have spoken.
   */
  toggle: () => void;
  /** Seconds the trace took, once it has finished. */
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning(component: string): ReasoningContextValue {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error(`${component} must be used within a <Reasoning>`);
  }
  return context;
}

export interface ReasoningProps extends Omit<ViewProps, 'children'> {
  className?: string;
  /**
   * Whether the trace is still arriving. Drives the shimmer on the trigger,
   * opens the panel on the way in and closes it a beat after it goes false.
   */
  isStreaming?: boolean;
  /**
   * How long the trace took, in seconds. Measured from the first streaming
   * frame when it is not given, which is the number worth showing — it is what
   * the reader actually waited.
   */
  duration?: number;
  /** Controlled open state. */
  open?: boolean;
  /**
   * Initial state when uncontrolled. Defaults to whether it is streaming, so a
   * live trace is open and a finished one arrives folded. Passing `false`
   * explicitly also opts out of the auto-open.
   */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function ReasoningRoot({
  className,
  isStreaming = false,
  duration: durationProp,
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: ReasoningProps) {
  const { root } = reasoningVariants();
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? isStreaming);
  const [measured, setMeasured] = useState<number>();

  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  /*
   * A caller that said `defaultOpen={false}` meant it. Without this the panel
   * would spring open the moment the trace started, which is the one thing that
   * request was asking not to happen.
   */
  const optedOut = defaultOpen === false;
  const everStreamed = useRef(isStreaming);
  const startedAt = useRef<number | null>(null);
  const [autoClosed, setAutoClosed] = useState(false);
  /*
   * Citadel addition, same reason as `toggle` below. `null` is "the reader has
   * not touched it", `true`/`false` is what their last tap did. Without the
   * record, a collapse mid-stream was undone by the auto-open on the next
   * frame, and an open-for-reading was folded a second after the trace ended.
   */
  const interacted = useRef<boolean | null>(null);
  const wasStreaming = useRef(isStreaming);

  const toggle = useCallback(() => {
    interacted.current = !open;
    setOpen(!open);
  }, [open, setOpen]);

  // Timed here rather than taken on trust: `duration` is optional, and the
  // honest number is the wall clock between the first token and the last.
  useEffect(() => {
    if (isStreaming) {
      // A fresh stream wipes the slate: yesterday's collapse must not silence
      // the auto-open of a trace that only starts now.
      if (!wasStreaming.current) interacted.current = null;
      wasStreaming.current = true;
      everStreamed.current = true;
      startedAt.current ??= Date.now();
      return;
    }
    wasStreaming.current = false;
    if (startedAt.current !== null) {
      setMeasured(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      startedAt.current = null;
    }
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming && !open && !optedOut && interacted.current !== false) setOpen(true);
  }, [isStreaming, open, optedOut, setOpen]);

  /*
   * Once only. Without the latch, reopening a finished trace by hand would be
   * undone a second later by the same effect, and the panel would refuse to
   * stay open for the one reader who wanted to read it. A trace the reader
   * opened themselves while it was live stands down too — they asked for it.
   */
  useEffect(() => {
    if (!everStreamed.current || isStreaming || !open || autoClosed) return;
    if (interacted.current === true) return;
    const timer = setTimeout(() => {
      setOpen(false);
      setAutoClosed(true);
    }, AUTO_CLOSE_DELAY);
    return () => clearTimeout(timer);
  }, [isStreaming, open, autoClosed, setOpen]);

  const context = useMemo(
    () => ({ isStreaming, open, setOpen, toggle, duration: durationProp ?? measured }),
    [isStreaming, open, setOpen, toggle, durationProp, measured]
  );

  return (
    <ReasoningContext.Provider value={context}>
      <View {...props} className={cn(root(), className)}>
        {children}
      </View>
    </ReasoningContext.Provider>
  );
}
ReasoningRoot.displayName = 'Reasoning';

export interface ReasoningTriggerProps
  extends Omit<PressableProps, 'children' | 'style'> {
  className?: string;
  /**
   * What the row says. Given the streaming state and the measured duration, so
   * a caller can put its own words to both without reimplementing the timing.
   */
  label?: (isStreaming: boolean, duration?: number) => ReactNode;
  /**
   * Citadel edit — replaces the leading orb only, keeping the label and the
   * chevron. `TurnStatus` uses it to swap in a tool's own orb while a tool
   * runs mid-reasoning, so one row carries both kinds of work.
   */
  icon?: ReactNode;
  /** Replaces the whole row, icon and chevron included. */
  children?: ReactNode;
}

/** The row that says how long it thought, and folds the trace away. */
function ReasoningTrigger({ className, label, icon, children, onPress, ...props }: ReasoningTriggerProps) {
  const { isStreaming, open, toggle, duration } = useReasoning('Reasoning.Trigger');
  const { trigger, label: labelClass } = reasoningVariants();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);
  /*
   * Citadel edit — the app's live-work indicator is the orb, not a glyph, so
   * the trigger's leading icon IS a ThinkingOrb: running while the trace
   * arrives, frozen on a representative frame once it has finished, so the
   * same orb that covered the wait is what the folded row keeps beside its
   * "Thought for 8 seconds". Upstream drew a 16px sparkles glyph here.
   */
  const [primary, mutedForeground] = useCSSVariable([
    '--color-primary',
    '--color-muted-foreground',
  ]);

  useEffect(() => {
    progress.value = reducedMotion
      ? open
        ? 1
        : 0
      : withTiming(open ? 1 : 0, { duration: 180 });
  }, [open, reducedMotion, progress]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  const body = label ? (
    label(isStreaming, duration)
  ) : isStreaming ? (
    <Shimmer textClassName={labelClass()}>Thinking…</Shimmer>
  ) : (
    <Text className={labelClass()}>{thoughtForLabel(duration)}</Text>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={(event) => {
        onPress?.(event);
        toggle();
      }}
      className={cn(trigger(), className)}
      {...props}
    >
      {children ?? (
        <>
          {icon ?? (
            <ThinkingOrb
              state="solving"
              size={20}
              paused={!isStreaming}
              color={asColor(isStreaming ? primary : mutedForeground)}
              // The row's own label says what is happening; the orb's word
              // would only be read a second time.
              importantForAccessibility="no-hide-descendants"
            />
          )}
          <View className="flex-1">{body}</View>
          <Animated.View style={chevronStyle}>
            <ChevronDownIcon size={16} />
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}

export interface ReasoningContentProps extends Omit<ViewProps, 'children'> {
  className?: string;
  /** The trace. A string is wrapped for you; anything else is left alone. */
  children?: ReactNode;
}

/**
 * The trace itself.
 *
 * Kept mounted and collapsed to nothing rather than unmounted, because it is
 * usually still growing while it is folded — and a body that remounts on every
 * open would drop whatever the reader had scrolled to.
 */
function ReasoningContent({ className, children, ...props }: ReasoningContentProps) {
  const { open, isStreaming } = useReasoning('Reasoning.Content');
  const { content, contentText } = reasoningVariants();
  const scrollRef = useRef<ScrollView>(null);

  return (
    <Collapse open={open} className={cn(content(), className)} {...props}>
      {/*
       * Citadel edit — the trace scrolls inside a fixed frame rather than
       * growing without bound. Pinned to the newest line while tokens are
       * still landing; free to scroll once it stops. `nestedScrollEnabled`
       * is what lets it take the drag on Android inside the transcript's
       * own scroll view.
       */}
      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: TRACE_MAX_HEIGHT }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onContentSizeChange={() => {
          if (isStreaming) scrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
        {textChildren(children, (text) => (
          <Text className={contentText()}>{text}</Text>
        ))}
      </ScrollView>
    </Collapse>
  );
}

ReasoningTrigger.displayName = 'Reasoning.Trigger';
ReasoningContent.displayName = 'Reasoning.Content';

export const Reasoning = Object.assign(ReasoningRoot, {
  Trigger: ReasoningTrigger,
  Content: ReasoningContent,
});
