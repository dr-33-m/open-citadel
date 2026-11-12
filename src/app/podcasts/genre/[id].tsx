import { useLocalSearchParams } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronLeft } from "@/components/icons";
import { ListEmpty } from "@/components/list-empty";
import { Handover } from "@/components/navigation/handover";
import { PageFade } from "@/components/scroll-fades";
import { ThemedView } from "@/components/themed-view";
import { ScreenHeader } from "@/components/ui/screen-header";
import { iconSize, layout } from "@/constants/theme";
import { ShowGrid } from "@/features/podcasts/components/show-grid";
import { TileGridSkeleton } from "@/components/skeletons/tile-grid-skeleton";
import { useGenreScreen } from "@/features/podcasts/hooks/use-genre-screen";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useScreenInteractive } from "@/hooks/use-screen-interactive";
import { useSettledOnce } from "@/navigation/use-settled-once";

/** A genre's whole chart, two shows to a row, from its Explore shelf's VIEW ALL. */
export default function GenreScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const interactive = useScreenInteractive();
  const screen = useGenreScreen(id);

  return (
    <ThemedView className="flex-1" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title={screen.title}
        leftIcon={<ChevronLeft size={iconSize.default} color={tokens["--color-foreground"]} />}
        leftLabel="Back"
        onLeftPress={screen.back}
      />
      {/* The grid mounts once the slide has landed and the chart is in. */}
      <Handover onShown={interactive} ready={landed && !screen.loading} skeleton={<TileGridSkeleton label="Loading shows" />}>
        <PageFade>
          <ShowGrid
            tiles={screen.tiles}
            empty={<ListEmpty text={screen.emptyText} />}
            bottomPadding={layout.scrollBottom + insets.bottom}
            onOpen={screen.open}
          />
        </PageFade>
      </Handover>
    </ThemedView>
  );
}
