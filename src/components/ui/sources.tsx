/**
 * Sources — where an answer came from, folded under a count.
 *
 * A cited answer usually cites more places than anyone wants listed above it,
 * so the list opens from a single line: "Used 6 sources". Folded is the resting
 * state, unlike `Reasoning`, because a citation list is a thing you go and
 * check rather than a thing you watch arrive.
 *
 * ```tsx
 * <Sources>
 *   <Sources.Trigger count={sources.length} />
 *   <Sources.Content>
 *     {sources.map((source) => (
 *       <Sources.Source key={source.url} href={source.url} title={source.title} />
 *     ))}
 *   </Sources.Content>
 * </Sources>
 * ```
 *
 * ## Where the props come from
 *
 * With the AI SDK these are the `source-url` parts of an assistant message:
 * `part.url` is the `href` and `part.title` the `title`. A part carries no
 * title of its own when the model did not supply one, in which case the host
 * of the URL is a better label than the whole of it.
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
import {
  Linking,
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { tv } from 'tailwind-variants';
import { ChevronDownIcon, LinkIcon } from '@/components/ui/icons';
import { Collapse } from '@/components/ui/collapse';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

const sourcesVariants = tv({
  slots: {
    root: 'w-full gap-2',
    trigger: 'flex-row items-center gap-2 py-0.5',
    triggerLabel: 'text-sm font-medium text-muted-foreground',
    content: 'gap-0.5',
    source: 'flex-row items-center gap-2 rounded-xl px-2 py-2 active:bg-accent',
    sourceTitle: 'flex-1 text-sm text-foreground',
    sourceHost: 'text-xs text-muted-foreground',
  },
});

interface SourcesContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SourcesContext = createContext<SourcesContextValue | null>(null);

function useSources(component: string): SourcesContextValue {
  const context = useContext(SourcesContext);
  if (!context) {
    throw new Error(`${component} must be used within a <Sources>`);
  }
  return context;
}

export interface SourcesProps extends Omit<ViewProps, 'children'> {
  className?: string;
  /** Controlled open state. */
  open?: boolean;
  /** Initial state when uncontrolled. Folded, which is where a citation list belongs. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function SourcesRoot({
  className,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: SourcesProps) {
  const { root } = sourcesVariants();
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

  const context = useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <SourcesContext.Provider value={context}>
      <View {...props} className={cn(root(), className)}>
        {children}
      </View>
    </SourcesContext.Provider>
  );
}
SourcesRoot.displayName = 'Sources';

export interface SourcesTriggerProps
  extends Omit<PressableProps, 'children' | 'style'> {
  className?: string;
  /** How many sources the list holds. Reads "Used 6 sources". */
  count?: number;
  /** Replaces the whole row. */
  children?: ReactNode;
}

function SourcesTrigger({
  className,
  count = 0,
  children,
  onPress,
  ...props
}: SourcesTriggerProps) {
  const { open, setOpen } = useSources('Sources.Trigger');
  const { trigger, triggerLabel } = sourcesVariants();
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
      className={cn(trigger(), className)}
      {...props}
    >
      {children ?? (
        <>
          <Text className={triggerLabel()}>
            Used {count} {count === 1 ? 'source' : 'sources'}
          </Text>
          <Animated.View style={chevronStyle}>
            <ChevronDownIcon size={16} />
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}

export interface SourcesContentProps extends Omit<ViewProps, 'children'> {
  className?: string;
  children?: ReactNode;
}

function SourcesContent({ className, children, ...props }: SourcesContentProps) {
  const { open } = useSources('Sources.Content');
  const { content } = sourcesVariants();

  return (
    <Collapse open={open} className={cn(content(), className)} {...props}>
      {children}
    </Collapse>
  );
}

export interface SourcesSourceProps
  extends Omit<PressableProps, 'children' | 'style'> {
  className?: string;
  /** Where the row goes. Opened with the platform's own handler. */
  href?: string;
  /**
   * What the row says. Falls back to the URL's host, which is a better label
   * than a hundred characters of path — and models often send no title at all.
   */
  title?: string;
  /** Leading glyph. A link by default; a favicon suits a real citation list. */
  icon?: ReactNode;
  children?: ReactNode;
}

/** One citation. */
function SourcesSource({
  className,
  href,
  title,
  icon,
  children,
  onPress,
  ...props
}: SourcesSourceProps) {
  const { source, sourceTitle, sourceHost } = sourcesVariants();
  const host = useMemo(() => hostOf(href), [href]);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title ?? host ?? href}
      onPress={(event) => {
        onPress?.(event);
        // No `canOpenURL` guard: it needs the scheme declared up front on iOS,
        // and a source is always http(s), which is always openable.
        if (href) void Linking.openURL(href).catch(() => undefined);
      }}
      className={cn(source(), className)}
      {...props}
    >
      {children ?? (
        <>
          {icon ?? <LinkIcon size={14} />}
          <Text numberOfLines={1} className={sourceTitle()}>
            {title ?? host ?? href}
          </Text>
          {title && host ? (
            <Text numberOfLines={1} className={sourceHost()}>
              {host}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The host of a URL, without a URL parser.
 *
 * `URL` exists in Hermes but throws on anything malformed, and a model's
 * citation is not a thing to trust with an exception. A label is worth having
 * even when the string it came from is not a URL at all.
 */
function hostOf(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(href);
  return match?.[1]?.replace(/^www\./i, '');
}

SourcesTrigger.displayName = 'Sources.Trigger';
SourcesContent.displayName = 'Sources.Content';
SourcesSource.displayName = 'Sources.Source';

export const Sources = Object.assign(SourcesRoot, {
  Trigger: SourcesTrigger,
  Content: SourcesContent,
  Source: SourcesSource,
});
