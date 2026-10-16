import React from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { LucideIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Separator } from '@/components/ui/separator';
import { Touchable } from '@/components/ui/touchable';
import { usePulse } from '@/hooks/use-pulse';
import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { cn } from '@/lib/cn';
import { asColor } from '@/utils/colors';

const SlimContext = React.createContext(false);

interface ActionStripProps {
  /**
   * Icon beside its label rather than over it: half the height, for a strip
   * that rises over a conversation instead of sitting on a page.
   */
  slim?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A row of square actions on a muted ground, a hairline between each: the
 * reader's selection bar (Highlight, Copy, Chat) and a message's actions in
 * chat (Resend, Copy). One drawing for both, so a strip of actions looks the
 * same wherever the reader meets one.
 */
function ActionStripRoot({ slim = false, className, children }: ActionStripProps) {
  const actions = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <SlimContext.Provider value={slim}>
      <View className={cn('flex-row items-stretch overflow-hidden border border-border bg-muted', className)}>
        {actions.map((action, index) => (
          <React.Fragment key={action.key ?? index}>
            {index > 0 ? <Separator orientation="vertical" /> : null}
            {action}
          </React.Fragment>
        ))}
      </View>
    </SlimContext.Provider>
  );
}

interface ActionStripActionProps {
  icon: LucideIcon;
  /** Drawn in capitals, as every label in the app is. */
  label: string;
  onPress: () => void;
  /** Gold, for the one action that commits something. */
  primary?: boolean;
  /** Working: the icon beats and the action is held until it is done. */
  busy?: boolean;
  accessibilityLabel?: string;
}

function ActionStripAction({ icon: Icon, label, onPress, primary = false, busy = false, accessibilityLabel }: ActionStripActionProps) {
  const slim = React.useContext(SlimContext);
  const tokens = useThemeTokens();
  const gold = asColor(tokens['--color-primary']);
  const lit = primary || busy;
  const iconColor = lit ? gold : asColor(tokens['--color-foreground']);
  const labelColor = lit ? gold : asColor(tokens['--color-muted-foreground']);
  const pulseStyle = usePulse(busy);

  return (
    <Touchable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      className={slim ? 'flex-row items-center justify-center gap-1.5 px-3 py-1.5' : 'items-center justify-center gap-0.5 px-3 py-2'}
    >
      <Animated.View style={pulseStyle}>
        <Icon size={slim ? 13 : 14} color={iconColor} />
      </Animated.View>
      <ThemedText type="labelSm" color={labelColor} style={LABEL}>
        {label.toUpperCase()}
      </ThemedText>
    </Touchable>
  );
}

const LABEL = { fontSize: 10 };

export const ActionStrip = Object.assign(ActionStripRoot, { Action: ActionStripAction });
