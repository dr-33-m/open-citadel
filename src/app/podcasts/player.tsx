import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronDown, Ellipsis } from "@/components/icons";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { ScreenHeader } from "@/components/ui/screen-header";
import { contentColumn, iconSize } from "@/constants/theme";
import { EpisodeActionSheet } from "@/features/podcasts/components/episode-action-sheet";
import { EpisodeTranscriptBar } from "@/features/podcasts/components/episode-transcript-bar";
import { PlayerArtwork } from "@/features/podcasts/components/player-artwork";
import { PlayerControls } from "@/features/podcasts/components/player-controls";
import { PlayerSheets } from "@/features/podcasts/components/player-sheets";
import { PlayerTitle } from "@/features/podcasts/components/player-title";
import { useEpisodeActions } from "@/features/podcasts/hooks/use-episode-actions";
import { usePlayerControls } from "@/features/podcasts/hooks/use-player-controls";
import { usePlayerScreen } from "@/features/podcasts/hooks/use-player-screen";
import { formatDuration } from "@/features/podcasts/utils/format";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useSettledOnce } from "@/navigation/use-settled-once";

/**
 * The full player. It rises out of the mini player at the bottom of the
 * screen and drags back down into it, so the two read as one object.
 *
 * Top to bottom, in the order a listener's eye asks: what is this (artwork,
 * title, show), where am I in it (chapter, scrubber), and what can I do (the
 * transport, then one quiet row: speed, sleep, the transcript, Samwell and
 * Up Next). Nothing else.
 */
export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const player = usePlayerScreen(landed);
  const controls = usePlayerControls(player);
  const episodeActions = useEpisodeActions();

  const { current, episode } = player;
  if (!current) return <ThemedView className="flex-1" />;
  // Big, but leaving the controls their room on a short phone.
  const art = Math.min(width - 48, height * 0.42, 380);
  const openMenu = episode ? () => episodeActions.openMenu(episode) : undefined;
  const transcriptLine = [current.showTitle, formatDuration(current.durationSec)].filter(Boolean).join(" · ");
  const gradient = [tokens["--color-card"] ?? "transparent", tokens["--color-background"] ?? "transparent"] as const;

  return (
    <ThemedView className="flex-1">
      <LinearGradient colors={gradient} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
      <View className="flex-1" style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
        <ScreenHeader
          title=""
          center={
            <ThemedText type="labelSm" color={tokens["--color-muted-foreground"]}>
              NOW PLAYING
            </ThemedText>
          }
          leftIcon={<ChevronDown size={iconSize.default} color={tokens["--color-foreground"]} />}
          leftLabel="Close the player"
          onLeftPress={controls.close}
          rightIcon={openMenu ? <Ellipsis size={iconSize.default} color={tokens["--color-foreground"]} /> : undefined}
          rightLabel="More"
          onRightPress={openMenu}
        />
        <View className="flex-1 justify-evenly px-6" style={contentColumn}>
          <View className="items-center">
            <PlayerArtwork uri={current.artworkUrl} size={art} playing={player.isPlaying} />
          </View>
          <PlayerTitle
            title={current.title}
            showTitle={current.showTitle}
            favorite={controls.favorite}
            onOpenShow={controls.openShow}
            onToggleFavorite={controls.toggleFavorite}
          />
          {/* Drawn from the first frame, with the values they will keep, so
              nothing is swapped when the player lands: only the scrubber's
              drag waits for that. */}
          <PlayerControls
            player={player}
            controls={controls}
            live={landed}
            transcript={<EpisodeTranscriptBar episode={episode} line={transcriptLine} live={landed} tools />}
          />
        </View>
      </View>
      {landed ? (
        <>
          <PlayerSheets player={player} controls={controls} />
          <EpisodeActionSheet {...episodeActions.sheet} />
        </>
      ) : null}
    </ThemedView>
  );
}
