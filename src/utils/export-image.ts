import { Alert } from "react-native";
import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { shareAsync } from "expo-sharing";
import * as MediaLibrary from "expo-media-library";

export async function captureAndShare(viewRef: RefObject<View | null>): Promise<void> {
  try {
    const uri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });

    // Save to gallery first so the image persists even if sharing times out
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === "granted") {
      await MediaLibrary.saveToLibraryAsync(uri);
    }

    await shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: "Share Quote",
    });
  } catch (error) {
    Alert.alert("Export failed", "Could not create the image. Please try again.");
  }
}
