import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronDown, ChevronLeft } from "@/components/icons";
import { TransitionScrollView } from "@/components/navigation/transition-scroll";
import { PageFade } from "@/components/scroll-fades";
import { ThemedView } from "@/components/themed-view";
import { ScreenHeader } from "@/components/ui/screen-header";
import { contentColumn, iconSize, layout } from "@/constants/theme";
import { useThemeTokens } from "@/hooks/use-theme-tokens";

type SettingsPageProps = {
  title: string;
  /**
   * Where the header's button goes, so it points the way it will move: `down`
   * closes Settings, a drawer; `back` returns to the list from a pane.
   */
  leaves: "back" | "down";
  onLeave: () => void;
  /** False for a pane whose body is a list with its own scrolling. */
  scrolls?: boolean;
  children: React.ReactNode;
};

/**
 * A page of Settings: its header, which never scrolls, and its body under it.
 * The list and every page are screens of their own, so this is drawn once per
 * screen and goes with it.
 */
export function SettingsPage({
  title,
  leaves,
  onLeave,
  scrolls = true,
  children,
}: SettingsPageProps) {
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const Leave = leaves === "down" ? ChevronDown : ChevronLeft;
  const padding = React.useMemo(
    () => ({
      paddingTop: layout.gutter,
      paddingBottom: layout.scrollBottom + insets.bottom,
    }),
    [insets.bottom],
  );

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title={title}
        leftIcon={
          <Leave size={iconSize.default} color={tokens["--color-foreground"]} />
        }
        leftLabel={leaves === "down" ? "Close settings" : "Back"}
        onLeftPress={onLeave}
      />
      {/* Replaces the header's bottom rule: see library-page. */}
      {scrolls ? (
        <PageFade>
          <TransitionScrollView
            className="flex-1 px-6"
            style={contentColumn}
            contentContainerStyle={padding}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </TransitionScrollView>
        </PageFade>
      ) : (
        children
      )}
    </ThemedView>
  );
}
