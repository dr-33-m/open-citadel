import { View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

import { Lock } from "@/components/icons";
import { RowFade, type FadeSurface } from "@/components/scroll-fades";
import { ThemedText } from "@/components/themed-text";
import { Touchable } from "@/components/ui/touchable";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { cn } from "@/lib/cn";

/**
 * One option of a choice: the value it sets, and what it is called.
 *
 * `locked` draws it shut, with a lock and the line given (the plan that
 * opens it, say). It still answers a press, with `onChange`, because the way
 * through a lock is the caller's to offer.
 */
export type Choice<T> = { value: T; label: string; locked?: string | null };

type ChoiceChipsProps<T> = {
  label?: string;
  /** A line under the label saying what the choice does. */
  hint?: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The ground the row sits on, so its fade blends. Sheets are `popover`. */
  surface?: FadeSurface;
  /** Horizontal inset: the sheet gutter by default, the page gutter on a screen, none inside a padded card. */
  gutter?: "sheet" | "page" | "none";
  /** Share the row's width between the choices instead of scrolling, for a few that always fit. */
  fill?: boolean;
};

/** The plan's name under a locked chip: the label's face, a step smaller. */
const LOCK_LINE = { fontSize: 9, lineHeight: 12 } as const;

/**
 * One setting, as a row of square chips: the chosen one lifted on a card with
 * its label in gold, the rest flat on the track. The same vocabulary as the
 * Library's switch and the chat / Compass switch, at the size of a label.
 *
 * Scrolls sideways when the choices run past the sheet, with the row fade
 * saying so.
 */
export function ChoiceChips<T extends string | number | null>({
  label,
  hint,
  choices,
  value,
  onChange,
  surface = "popover",
  gutter = "sheet",
  fill = false,
}: ChoiceChipsProps<T>) {
  const pad = gutter === "sheet" ? "px-4" : gutter === "page" ? "px-6" : "px-0";
  const tokens = useThemeTokens();
  const chips = choices.map((choice) => {
    const selected = choice.value === value;
    return (
      <Touchable
        key={String(choice.value)}
        className={cn(
          "min-h-10 justify-center border px-3.5",
          fill && "flex-1 items-center",
          selected
            ? "border-primary bg-card shadow-sm"
            : "border-border bg-muted",
        )}
        onPress={selected ? undefined : () => onChange(choice.value)}
        haptic="select"
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={choice.locked ? `${choice.label}, with ${choice.locked}` : choice.label}
      >
        {choice.locked ? (
          <View className={cn("py-1", fill && "items-center")}>
            <View className="flex-row items-center gap-1">
              <Lock size={11} color={tokens["--color-muted-foreground"]} />
              <ThemedText type="labelSm" color={tokens["--color-muted-foreground"]}>
                {choice.label}
              </ThemedText>
            </View>
            <ThemedText type="labelSm" color={tokens["--color-muted-foreground"]} style={LOCK_LINE}>
              {choice.locked}
            </ThemedText>
          </View>
        ) : (
          <ThemedText
            type="labelSm"
            color={
              selected ? tokens["--color-primary"] : tokens["--color-foreground"]
            }
          >
            {choice.label}
          </ThemedText>
        )}
      </Touchable>
    );
  });
  return (
    <View className="gap-2">
      {label ? (
        <View className={cn("gap-0.5", pad)}>
          <ThemedText type="labelSm" color={tokens["--color-muted-foreground"]}>
            {label}
          </ThemedText>
          {hint ? (
            <ThemedText
              type="bodySm"
              color={tokens["--color-muted-foreground"]}
            >
              {hint}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      {fill ? (
        <View className={cn("flex-row gap-2", pad)}>{chips}</View>
      ) : (
        <RowFade surface={surface}>
          {/* RNGH's ScrollView, not RN's: in a sheet, the sheet's own drag
              takes a plain ScrollView's sideways swipe on Android, and the
              row draws but never moves (the tag rows had the same bug). */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName={cn("gap-2", pad)}
          >
            {chips}
          </ScrollView>
        </RowFade>
      )}
    </View>
  );
}
