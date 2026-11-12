import { useLocalSearchParams } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronLeft } from "@/components/icons";
import { Handover } from "@/components/navigation/handover";
import { TransitionScrollView } from "@/components/navigation/transition-scroll";
import { PageFade } from "@/components/scroll-fades";
import { ThemedView } from "@/components/themed-view";
import { ScreenHeader } from "@/components/ui/screen-header";
import { contentColumn, iconSize, layout } from "@/constants/theme";
import { FreeBookAbout } from "@/features/free-books/components/free-book-about";
import { FreeBookAboutSkeleton } from "@/features/free-books/components/free-book-about-skeleton";
import { FreeBookHero } from "@/features/free-books/components/free-book-hero";
import { FreeBookSkeleton } from "@/features/free-books/components/free-book-skeleton";
import type { FreeBookParams } from "@/features/free-books/hooks/use-open-catalog-book";
import { useFreeBookScreen } from "@/features/free-books/hooks/use-free-book-screen";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useScreenInteractive } from "@/hooks/use-screen-interactive";
import { useSettledOnce } from "@/navigation/use-settled-once";

/**
 * One free book: its cover, what Project Gutenberg says about it, and the
 * button that puts it in the Library folder, which then reads it in.
 *
 * The hero is drawn from the first frame, from what the list knew (title,
 * author) and the catalog entry read ahead at the tap, so the page looks
 * finished while it is still moving. What Gutenberg says about the book
 * waits for the slide to land and for that entry, behind its first lines.
 */
export default function FreeBookScreen() {
  const params = useLocalSearchParams<FreeBookParams>();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const interactive = useScreenInteractive();
  const screen = useFreeBookScreen(params);

  // Opened with nothing known (a link straight to it), there is no hero to
  // draw until the catalog answers.
  const page = screen.drawable ? (
    <PageFade>
      <TransitionScrollView
        contentContainerStyle={[contentColumn, { paddingBottom: layout.scrollBottom + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <FreeBookHero {...screen.hero} />
        <Handover onShown={interactive} fill={false} ready={landed && screen.loaded} skeleton={<FreeBookAboutSkeleton />}>
          <FreeBookAbout {...screen.about} />
        </Handover>
      </TransitionScrollView>
    </PageFade>
  ) : (
    <FreeBookSkeleton />
  );

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title=""
        leftIcon={<ChevronLeft size={iconSize.default} color={tokens["--color-foreground"]} />}
        leftLabel="Back"
        onLeftPress={screen.back}
      />
      {page}
    </ThemedView>
  );
}
