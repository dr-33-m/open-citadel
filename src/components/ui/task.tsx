/**
 * Task — one step an agent took, and what it did while it was there.
 *
 * The header is the step; the body is the detail nobody reads unless something
 * went wrong. Open by default, because a task that is running is the thing the
 * reader is watching — and it stays open afterwards rather than folding itself
 * away, because unlike a reasoning trace the steps are the record of what
 * happened and are worth scrolling back through.
 *
 * ```tsx
 * <Task status="running">
 *   <Task.Trigger title="Searching the codebase" />
 *   <Task.Content>
 *     <Task.Item>
 *       Read <Task.File>calendar/index.tsx</Task.File>
 *     </Task.Item>
 *   </Task.Content>
 * </Task>
 * ```
 *
 * ## Where the props come from
 *
 * With the AI SDK a task is a tool-call part: `part.type` is `tool-<name>` and
 * `part.state` runs `input-streaming` → `input-available` → `output-available`
 * or `output-error`. Those map onto `status` as pending, running, complete and
 * error; `part.input` is usually what the body should say.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tv } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  SearchIcon,
} from '@/components/ui/icons';
import { Collapse } from '@/components/ui/collapse';
import { Text, textChildren } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { Shimmer } from '@/components/ui/shimmer';

export type TaskStatus = 'pending' | 'running' | 'complete' | 'error';

const taskVariants = tv({
  slots: {
    root: 'w-full gap-2',
    trigger: 'flex-row items-center gap-2 py-0.5',
    title: 'flex-1 text-sm text-muted-foreground',
    /*
     * Indented behind a rule rather than merely padded. The rule is what says
     * these lines belong to the step above them instead of being the next few
     * steps, which matters as soon as there is more than one task in a row.
     */
    content: 'ms-2 gap-1.5 border-s border-border ps-4',
    item: 'text-sm leading-relaxed text-muted-foreground',
    file: 'flex-row items-center gap-1 self-start rounded-md border border-border bg-muted px-1.5 py-0.5',
    fileLabel: 'font-mono text-xs text-foreground',
  },
  variants: {
    status: {
      pending: { title: 'text-muted-foreground/60' },
      running: {},
      complete: {},
      error: { title: 'text-destructive' },
    },
  },
  defaultVariants: {
    status: 'complete',
  },
});

interface TaskContextValue {
  status: TaskStatus;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TaskContext = createContext<TaskContextValue | null>(null);

function useTask(component: string): TaskContextValue {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error(`${component} must be used within a <Task>`);
  }
  return context;
}

export interface TaskProps extends Omit<ViewProps, 'children'> {
  className?: string;
  /**
   * Where the step has got to. Drives the leading glyph, and puts a shimmer on
   * the title while it is `running`.
   */
  status?: TaskStatus;
  /** Controlled open state. */
  open?: boolean;
  /** Initial state when uncontrolled. Open — the steps are the record. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function TaskRoot({
  className,
  status = 'complete',
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  children,
  ...props
}: TaskProps) {
  const { root } = taskVariants({ status });
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const context = useMemo(() => ({ status, open, setOpen }), [status, open, setOpen]);

  return (
    <TaskContext.Provider value={context}>
      <View {...props} className={cn(root(), className)}>
        {children}
      </View>
    </TaskContext.Provider>
  );
}
TaskRoot.displayName = 'Task';

export interface TaskTriggerProps extends Omit<PressableProps, 'children' | 'style'> {
  className?: string;
  /** What the step is. Shimmers while the status is `running`. */
  title?: string;
  /** Leading glyph. Derived from `status` when not given. */
  icon?: ReactNode;
  /** Replaces the whole row. */
  children?: ReactNode;
}

function TaskTrigger({
  className,
  title,
  icon,
  children,
  onPress,
  ...props
}: TaskTriggerProps) {
  const { status, open, setOpen } = useTask('Task.Trigger');
  const slots = taskVariants({ status });
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);

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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={(event) => {
        onPress?.(event);
        setOpen(!open);
      }}
      className={cn(slots.trigger(), className)}
      {...props}
    >
      {children ?? (
        <>
          {icon ?? <TaskStatusIcon status={status} />}
          {status === 'running' && title ? (
            <View className="flex-1">
              <Shimmer textClassName={slots.title()}>{title}</Shimmer>
            </View>
          ) : (
            <Text numberOfLines={1} className={slots.title()}>
              {title}
            </Text>
          )}
          <Animated.View style={chevronStyle}>
            <ChevronDownIcon size={16} />
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}

/**
 * The glyph for each status. A magnifier while running: a step is a search.
 *
 * Every one is given an explicit colour. The filled status icons fall back to
 * `currentColor`, which React Native's SVG does not resolve — it paints black,
 * which on a dark theme is a black disc floating in the row. They are built to
 * take their colour from an enclosing `IconColorProvider`, and a task row is
 * not one, so the tint is resolved here.
 */
function TaskStatusIcon({ status }: { status: TaskStatus }) {
  const muted = useTint('--color-muted-foreground');
  const success = useTint('--color-success');
  const destructive = useTint('--color-destructive');

  switch (status) {
    case 'pending':
      return <CircleIcon size={16} color={muted} />;
    case 'error':
      return <AlertTriangleIcon size={16} color={destructive} />;
    case 'complete':
      return <CheckCircleIcon size={16} color={success} />;
    default:
      return <SearchIcon size={16} color={muted} />;
  }
}

/**
 * A theme token as a colour an icon will accept.
 *
 * `useCSSVariable` answers with whatever the token holds, which for a length or
 * a number is not a colour at all — so anything that is not a string is dropped
 * and the icon falls back to what it would have used anyway.
 */
function useTint(variable: string): string | undefined {
  const raw = useCSSVariable(variable);
  return typeof raw === 'string' ? raw : undefined;
}

export interface TaskContentProps extends Omit<ViewProps, 'children'> {
  className?: string;
  children?: ReactNode;
}

function TaskContent({ className, children, ...props }: TaskContentProps) {
  const { open } = useTask('Task.Content');
  const { content } = taskVariants();

  return (
    <Collapse open={open} className={cn(content(), className)} {...props}>
      {children}
    </Collapse>
  );
}

export interface TaskItemProps extends Omit<ViewProps, 'children'> {
  className?: string;
  children?: ReactNode;
}

/** One line of what the step did. */
function TaskItem({ className, children, ...props }: TaskItemProps) {
  const { item } = taskVariants();

  return (
    <View {...props} className={cn('flex-row flex-wrap items-center gap-1', className)}>
      {textChildren(children, (text) => (
        <Text className={item()}>{text}</Text>
      ))}
    </View>
  );
}

export interface TaskFileProps extends Omit<ViewProps, 'children'> {
  className?: string;
  /** A glyph for the file's kind, drawn before the name. */
  icon?: ReactNode;
  children?: ReactNode;
}

/**
 * A filename inside a line, drawn as a chip.
 *
 * Bordered rather than merely monospaced, because a path in the middle of a
 * sentence is otherwise indistinguishable from the sentence — and the paths
 * are the part of a task line anyone actually scans for.
 */
function TaskFile({ className, icon, children, ...props }: TaskFileProps) {
  const { file, fileLabel } = taskVariants();

  return (
    <View {...props} className={cn(file(), className)}>
      {icon}
      {textChildren(children, (text) => (
        <Text className={fileLabel()}>{text}</Text>
      ))}
    </View>
  );
}

TaskTrigger.displayName = 'Task.Trigger';
TaskContent.displayName = 'Task.Content';
TaskItem.displayName = 'Task.Item';
TaskFile.displayName = 'Task.File';

export const Task = Object.assign(TaskRoot, {
  Trigger: TaskTrigger,
  Content: TaskContent,
  Item: TaskItem,
  File: TaskFile,
});
