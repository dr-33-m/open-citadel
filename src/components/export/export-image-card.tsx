import React from "react";
import { Image, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { fontFamily } from "@/constants/theme";
import { asColor } from "@/utils/colors";

const LOGO = require("../../../assets/icons/oc-adaptive-icon.png");

type ExportImageCardProps = {
  quoteText: string;
  bookTitle: string;
  authorName: string;
  coverUri: string | null;
  category: string | null;
  viewRef: React.RefObject<View | null>;
  onReady?: () => void;
};

function getQuoteFontSize(length: number): number {
  if (length < 80) return 58;
  if (length < 150) return 48;
  if (length < 300) return 40;
  if (length < 500) return 34;
  return 28;
}

export function ExportImageCard({
  quoteText,
  bookTitle,
  authorName,
  coverUri,
  category,
  viewRef,
  onReady,
}: ExportImageCardProps) {
  const [primary, foreground, mutedForeground] = useCSSVariable([
    "--color-primary",
    "--color-foreground",
    "--color-muted-foreground",
  ]);
  const quoteFontSize = getQuoteFontSize(quoteText.length);

  // Track image loading — capture should wait until all images are ready
  const needsCover = !!coverUri;
  const logoLoaded = React.useRef(false);
  const coverLoaded = React.useRef(!needsCover);

  const checkReady = React.useCallback(() => {
    if (logoLoaded.current && coverLoaded.current) {
      // Wait one frame so the rendered pixels are flushed before capture
      requestAnimationFrame(() => onReady?.());
    }
  }, [onReady]);

  return (
    <View
      ref={viewRef}
      collapsable={false}
      className="h-[1080px] w-[1080px] justify-between bg-background p-[70px]"
    >
      {/* Quote area */}
      <View className="flex-1 justify-center px-[10px]">
        <Text
          style={{
            fontFamily: fontFamily.serifBold,
            fontSize: 95,
            lineHeight: 95,
            color: asColor(primary),
            marginBottom: -30,
            marginLeft: -8,
          }}
        >
          {"\u201C"}
        </Text>

        <View className="px-5">
          <Text
            style={{
              fontFamily: fontFamily.serif,
              fontSize: quoteFontSize,
              lineHeight: quoteFontSize * 1.3,
              color: asColor(foreground),
            }}
            numberOfLines={12}
          >
            {quoteText}
          </Text>
        </View>

        <Text
          style={{
            fontFamily: fontFamily.serifBold,
            fontSize: 85,
            lineHeight: 85,
            textAlign: "right",
            color: asColor(primary),
            marginTop: -30,
            marginRight: -8,
          }}
        >
          {"\u201D"}
        </Text>
      </View>

      {/* Divider */}
      <View className="mb-[35px] mt-[40px] h-px bg-primary" />

      {/* Footer: cover + metadata + brand */}
      <View className="flex-row items-start gap-[30px]">
        {coverUri && (
          <Image
            source={{ uri: coverUri }}
            className="h-[170px] w-[120px] rounded-[6px] border"
            style={{ borderColor: `${asColor(primary)}26` }}
            fadeDuration={0}
            onLoad={() => { coverLoaded.current = true; checkReady(); }}
          />
        )}

        <View className="flex-1">
          <Text
            style={{
              fontFamily: fontFamily.sansSemiBold,
              fontSize: 28,
              letterSpacing: 1.5,
              color: asColor(foreground),
            }}
            numberOfLines={2}
          >
            {bookTitle.toUpperCase()}
          </Text>
          {authorName.length > 0 && (
            <Text
              style={{
                fontFamily: fontFamily.sans,
                fontSize: 22,
                color: asColor(mutedForeground),
                marginTop: 6,
              }}
              numberOfLines={1}
            >
              {authorName}
            </Text>
          )}
          {category && (
            <Text
              style={{
                fontFamily: fontFamily.sans,
                fontSize: 18,
                color: asColor(mutedForeground),
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {category}
            </Text>
          )}
        </View>

        <View className="items-center">
          <View className="items-center">
            <Image
              source={LOGO}
              className="-mt-[30px] h-[132px] w-[132px] opacity-80"
              fadeDuration={0}
              onLoad={() => { logoLoaded.current = true; checkReady(); }}
            />
            <Text
              style={{
                fontFamily: fontFamily.sansSemiBold,
                fontSize: 11,
                letterSpacing: 2,
                color: asColor(mutedForeground),
              }}
            >
              OPEN CITADEL
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
