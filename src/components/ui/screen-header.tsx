import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { ThemedText } from '@/components/themed-text';
import { fontFamily, MaxContentWidth } from '@/constants/theme';
import { Touchable } from '@/components/ui/touchable';

type ScreenHeaderProps = {
  title: string;
  /** Only rendered in `align="left"` mode. */
  subtitle?: string;
  onLeftPress?: () => void;
  leftIcon?: React.ReactNode;
  /** What the left button does, for screen readers — an icon alone says nothing. */
  leftLabel?: string;
  onRightPress?: () => void;
  rightIcon?: React.ReactNode;
  rightLabel?: string;
  titleItalic?: boolean;
  /**
   * 'center' is the navigation layout: a bordered icon box on each side with
   * the title between them, which is where the app's screens actually sit
   * relative to each other. 'left' is the standalone treatment — a
   * left-aligned title and subtitle — for screens that are a destination
   * rather than a stop on the hub.
   *
   * 'start' is 'center' with the title block pushed to the leading edge,
   * keeping both icon boxes. It exists for titles that are *content* rather
   * than a place: a chat is named after whatever it turned out to be about,
   * so it runs long and gets truncated, and a centred string that grows from
   * the middle and clips at both ends is unreadable and never lines up with
   * the messages underneath. Centring is kept for the case where the title is
   * a fixed word — see the chat header, which centres 'Samwell' until a
   * conversation has a name of its own.
   */
  align?: 'left' | 'center' | 'start';
  /**
   * A status line under a centered title: what the screen is currently
   * showing, when the title alone doesn't say it (the model's state and the
   * book a chat is grounded in, for instance).
   */
  children?: React.ReactNode;
};

/** Same 40dp box on every screen, so the three headers read as one bar that
 * changes contents rather than three different headers. */
const ICON_BOX = 'h-10 w-10 items-center justify-center border border-border';

function HeaderButton({
  icon,
  onPress,
  label,
}: {
  icon: React.ReactNode;
  onPress?: () => void;
  label?: string;
}) {
  if (icon == null) return null;
  if (!onPress) return <View className={ICON_BOX}>{icon}</View>;
  return (
    <Touchable
      onPress={onPress}
      // The box stays 40dp because that is the size the design wants; the
      // slop is what takes the actual target past the 44dp minimum.
      hitSlop={8}
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={label}
      className={ICON_BOX}
    >
      {icon}
    </Touchable>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onLeftPress,
  leftIcon,
  leftLabel,
  onRightPress,
  rightIcon,
  rightLabel,
  titleItalic = false,
  align = 'center',
  children,
}: ScreenHeaderProps) {
  // ThemedText's `color` prop takes a literal, never a className — resolved
  // here from the same token the container's `border-border` reads.
  const mutedForeground = useCSSVariable('--color-muted-foreground');
  const subtitleColor = typeof mutedForeground === 'string' ? mutedForeground : undefined;

  if (align === 'left') {
    return (
      // Capped to the shared content column: on a phone the cap never bites
      // (identical rendering), on a wide screen the header centres with the
      // content below it instead of stretching edge-to-edge.
      <View
        className="flex-row items-center justify-between px-6 py-4"
        style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
      >
        <View>
          <ThemedText
            type="headlineSm"
            style={titleItalic ? { fontFamily: fontFamily.serifItalic } : undefined}
          >
            {title}
          </ThemedText>
          {subtitle && (
            // fontSize/lineHeight shrink this below `bodySm`'s own scale, so
            // it stays inline style rather than className — the same
            // properties `type` already sets, and inline wins there for sure.
            <ThemedText type="bodySm" color={subtitleColor} style={{ fontSize: 12, lineHeight: 16 }}>
              {subtitle}
            </ThemedText>
          )}
        </View>

        {rightIcon != null && (
          <HeaderButton icon={rightIcon} onPress={onRightPress} label={rightLabel} />
        )}
      </View>
    );
  }

  if (align === 'start') {
    return (
      // Same bar as `center` — same height, same cap, same 40dp boxes — so
      // switching between them changes only where the title sits, not the
      // shape of the header.
      <View
        className="flex-row items-center gap-3 px-6 py-4"
        style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
      >
        {leftIcon != null ? (
          <HeaderButton icon={leftIcon} onPress={onLeftPress} label={leftLabel} />
        ) : null}

        <View className="flex-1 items-start gap-[2px]">
          <ThemedText
            type="headlineSm"
            numberOfLines={1}
            style={titleItalic ? { fontFamily: fontFamily.serifItalic } : undefined}
          >
            {title}
          </ThemedText>
          {children}
        </View>

        {rightIcon != null ? (
          <HeaderButton icon={rightIcon} onPress={onRightPress} label={rightLabel} />
        ) : (
          // Held even when empty: without it a title that fills the row would
          // slide under the notch edge the moment the button went away.
          <View className="h-10 w-10" />
        )}
      </View>
    );
  }

  return (
    // Same content-column cap as the `left` variant above.
    <View
      className="flex-row items-center gap-3 px-6 py-4"
      style={{ maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' }}
    >
      {/* An empty side still holds its 40dp, so the title is centred on the
          header rather than on whatever is left over — a title that shifts
          when a button appears reads as the whole bar twitching. */}
      {leftIcon != null ? (
        <HeaderButton icon={leftIcon} onPress={onLeftPress} label={leftLabel} />
      ) : (
        <View className="h-10 w-10" />
      )}

      <View className="flex-1 items-center gap-[2px]">
        <ThemedText
          type="headlineSm"
          numberOfLines={1}
          className="text-center"
          style={titleItalic ? { fontFamily: fontFamily.serifItalic } : undefined}
        >
          {title}
        </ThemedText>
        {children}
      </View>

      {rightIcon != null ? (
        <HeaderButton icon={rightIcon} onPress={onRightPress} label={rightLabel} />
      ) : (
        <View className="h-10 w-10" />
      )}
    </View>
  );
}
