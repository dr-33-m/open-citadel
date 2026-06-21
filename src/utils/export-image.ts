import { Alert } from "react-native";
import type { RefObject } from "react";
import type { View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { shareAsync } from "expo-sharing";

export async function captureAndShare(viewRef: RefObject<View | null>): Promise<void> {
  try {
    const uri = await captureRef(viewRef, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
    await shareAsync(uri, {
      mimeType: "image/png",
      dialogTitle: "Share Quote",
    });
  } catch (error) {
    Alert.alert("Export failed", "Could not create the image. Please try again.");
  }
}
