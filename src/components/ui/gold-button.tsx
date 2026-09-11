import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

import type { LucideIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { Touchable } from "@/components/ui/touchable";

import { ThemedText } from "@/components/themed-text";
import { spacing } from "@/constants/theme";
import { asColor } from "@/utils/colors";

type GoldButtonProps = {
  label: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  /**
   * The mark that leads the label, at `ActionButton`'s 14pt.
   *
   * For a gold button sharing a row with `ActionButton`s, which always carry
   * one: SIGN IN sat beside CREATE ACCOUNT's person-plus with nothing of its
   * own, and the pair read as two different kinds of control rather than two
   * doors into one flow. Left off where the button stands alone.
   */
  icon?: LucideIcon;
  /**
   * How much of a commitment the press is.
   *
   * `full` is the 56pt bar this started as, and it is right where the button
   * IS the screen's purpose: ADD BOOKS, SAVE, pick a library folder. It got
   * used for a dialog's dismiss as well, and at that size a button whose whole
   * job is "yes, I have read this" shouted louder than the thing it was
   * dismissing.
   *
   * `compact` is the size every other button in the app is — the same 40pt box
   * as FINISH GOAL and MAKE THIS THE MAIN GOAL — for an acknowledgement, or
   * for a gold button standing on its own.
   *
   * `small` is `ActionButton`'s box to the pixel: 34pt, which is its 1px
   * border, its `py-2`, and `labelSm`'s 16pt line. For a gold button sharing
   * a row WITH an `ActionButton` — the account card's SIGN IN beside CREATE
   * ACCOUNT. `compact` there stood 6pt taller than its neighbour, and two
   * buttons on one baseline at different heights read as a mistake rather
   * than as a hierarchy.
   */
  size?: "full" | "compact" | "small";
  /**
   * Nothing to commit yet — an empty note, a blank title.
   *
   * Dims the gradient and stops the press reaching through, rather than
   * letting the button answer with its commit haptic and then do nothing.
   * A control that looks live and silently no-ops reads as broken.
   */
  disabled?: boolean;
  /**
   * The press has been made and something is happening about it.
   *
   * Swaps the label for a spinner and stops the press, because a gold button
   * that still says SIGN IN after you have signed in invites a second tap at
   * exactly the moment a second tap is worst.
   */
  loading?: boolean;
};

export function GoldButton({
  label,
  accessibilityLabel,
  onPress,
  icon: Icon,
  size = "full",
  disabled = false,
  loading = false,
}: GoldButtonProps) {
  const [primary, primaryDeep, primaryForeground] = useCSSVariable([
    "--color-primary",
    "--color-primary-deep",
    "--color-primary-foreground",
  ]);
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        full: {
          minHeight: 56,
          paddingHorizontal: spacing[6],
          alignItems: "center",
          justifyContent: "center",
        },
        compact: {
          minHeight: 40,
          paddingHorizontal: spacing[5],
          alignItems: "center",
          justifyContent: "center",
        },
        // 34 = ActionButton's 1px border + its `py-2` + `labelSm`'s 16pt
        // line. Arrived at by adding up the neighbour, not by eye.
        small: {
          minHeight: 34,
          paddingHorizontal: spacing[4],
          alignItems: "center",
          justifyContent: "center",
        },
        /*
         * The disabled dim is a two-state change, so it is a CSS transition
         * - the house tool (see the chevron in the model sheet) - and not a
         * snap. It rides on an Animated.View wrapped around the gradient
         * because opacity is the one property that costs nothing to move,
         * and a button coming alive as the offering lands reads as waking
         * rather than as teleporting. Opacity-only, so reduced motion
         * already has what it needs.
         *
         * The node matters: it must NOT be the Touchable above this, because
         * `AnimatedPressable` animates opacity on the UI thread for press
         * feedback and would overwrite a static value set there every frame.
         * A separate child node keeps the two fades from fighting.
         */
        dim: {
          transitionProperty: ["opacity"],
          transitionDuration: "120ms",
          transitionTimingFunction: "ease-out",
        },
        lit: { opacity: 1 },
        dimmed: { opacity: 0.35 },
      }),
    [],
  );

  return (
    <Touchable
      onPress={onPress}
      disabled={disabled || loading}
      haptic="commit"
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Animated.View
        style={[styles.dim, disabled ? styles.dimmed : styles.lit]}
      >
        <LinearGradient
          colors={[asColor(primary)!, asColor(primaryDeep)!]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles[size]}
        >
          {loading ? (
            /* The ring is drawn in the button's own ink. `Spinner`'s default is
               gold on muted, which on a gold gradient is one invisible ring on
               another. Through `className` rather than a style prop, because
               `Spinner` is vendored PanelUI and takes no style — see the
               warning in CLAUDE.md. */
            <Spinner
              size="sm"
              className="border-transparent border-t-primary-foreground"
              label={label}
            />
          ) : (
            // The row exists only when there is an icon; without one the label
            // stays a bare child of the gradient, which is what every existing
            // GoldButton renders and what its centring is written around.
            <View className="flex-row items-center gap-2">
              {Icon ? (
                <Icon size={14} color={asColor(primaryForeground)} />
              ) : null}
              <ThemedText
                type={
                  size === "full"
                    ? "labelLg"
                    : size === "compact"
                      ? "labelMd"
                      : "labelSm"
                }
                color={asColor(primaryForeground)}
              >
                {label}
              </ThemedText>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </Touchable>
  );
}
