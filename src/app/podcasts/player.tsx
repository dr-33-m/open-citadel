import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { BookPlayer } from "@/features/audiobook/components/book-player";
import { EpisodePlayer } from "@/features/podcasts/components/episode-player";
import { useHeld } from "@/hooks/use-held";
import { useThemeTokens } from "@/hooks/use-theme-tokens";
import { useSettledOnce } from "@/navigation/use-settled-once";
import { usePlayer } from "@/stores/player";

/**
 * The full player. It rises out of the mini player at the bottom of the
 * screen and drags back down into it, so the two read as one object.
 *
 * One player for whatever is in it: an episode, or a book heard in a cloud
 * voice. The shell is the same; what is drawn in it is the kind's own body.
 * When the player empties (the book stopped or ended, the last episode
 * finished) the body goes on drawing what it had while the player goes back
 * down (`usePlayerControls`), rather than leaving a blank screen.
 */
export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const tokens = useThemeTokens();
  const landed = useSettledOnce();
  const kind = useHeld(usePlayer((s) => s.current?.kind ?? null));

  if (!kind) return <ThemedView className="flex-1" />;
  const gradient = [tokens["--color-card"] ?? "transparent", tokens["--color-background"] ?? "transparent"] as const;

  return (
    <ThemedView className="flex-1">
      <LinearGradient colors={gradient} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
      <View className="flex-1" style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
        {kind === "book" ? <BookPlayer landed={landed} /> : <EpisodePlayer landed={landed} />}
      </View>
    </ThemedView>
  );
}
