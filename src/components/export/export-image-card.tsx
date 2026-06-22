import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { fontFamily } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

const CARD_SIZE = 1080;
const PADDING = 70;
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
  const colors = useColors();
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

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        card: {
          width: CARD_SIZE,
          height: CARD_SIZE,
          backgroundColor: colors.surface.base,
          padding: PADDING,
          justifyContent: "space-between",
        },

        // ── Quote section (top ~70%) ──
        quoteSection: {
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 10,
        },
        openQuote: {
          fontFamily: fontFamily.serifBold,
          fontSize: 95,
          color: colors.primary.default,
          lineHeight: 95,
          marginBottom: -30,
          marginLeft: -8,
        },
        quoteTextContainer: {
          paddingHorizontal: 20,
        },
        quoteText: {
          fontFamily: fontFamily.serif,
          color: colors.text.primary,
        },
        closeQuote: {
          fontFamily: fontFamily.serifBold,
          fontSize: 85,
          color: colors.primary.default,
          lineHeight: 85,
          textAlign: "right",
          marginTop: -30,
          marginRight: -8,
        },

        // ── Divider ──
        divider: {
          height: 1,
          backgroundColor: colors.primary.default,
          marginTop: 40,
          marginBottom: 35,
        },

        // ── Footer: cover + metadata + brand ──
        footer: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 30,
        },
        coverImage: {
          width: 120,
          height: 170,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: `${colors.primary.default}26`,
        },
        metadataArea: {
          flex: 1,
        },
        bookTitle: {
          fontFamily: fontFamily.sansSemiBold,
          fontSize: 28,
          letterSpacing: 1.5,
          color: colors.text.primary,
        },
        authorName: {
          fontFamily: fontFamily.sans,
          fontSize: 22,
          color: colors.text.secondary,
          marginTop: 6,
        },
        category: {
          fontFamily: fontFamily.sans,
          fontSize: 18,
          color: colors.text.secondary,
          marginTop: 4,
        },
        brandContainer: {
          alignItems: "center",
        },
        brandRow: {
          alignItems: "center",
        },
        brandText: {
          fontFamily: fontFamily.sansSemiBold,
          fontSize: 11,
          letterSpacing: 2,
          color: colors.text.secondary,
        },
        brandLogo: {
          width: 132,
          height: 132,
          opacity: 0.8,
          marginTop: -30,
        },
      }),
    [colors],
  );

  return (
    <View
      ref={viewRef}
      style={styles.card}
      collapsable={false}
    >
      {/* Quote area */}
      <View style={styles.quoteSection}>
        <Text style={styles.openQuote}>{"\u201C"}</Text>

        <View style={styles.quoteTextContainer}>
          <Text
            style={[styles.quoteText, { fontSize: quoteFontSize, lineHeight: quoteFontSize * 1.3 }]}
            numberOfLines={12}
          >
            {quoteText}
          </Text>
        </View>

        <Text style={styles.closeQuote}>{"\u201D"}</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Footer: cover + metadata + brand */}
      <View style={styles.footer}>
        {coverUri && (
          <Image
            source={{ uri: coverUri }}
            style={styles.coverImage}
            onLoad={() => { coverLoaded.current = true; checkReady(); }}
          />
        )}

        <View style={styles.metadataArea}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {bookTitle.toUpperCase()}
          </Text>
          {authorName.length > 0 && (
            <Text style={styles.authorName} numberOfLines={1}>
              {authorName}
            </Text>
          )}
          {category && (
            <Text style={styles.category} numberOfLines={1}>
              {category}
            </Text>
          )}
        </View>

        <View style={styles.brandContainer}>
          <View style={styles.brandRow}>
            <Image
              source={LOGO}
              style={styles.brandLogo}
              onLoad={() => { logoLoaded.current = true; checkReady(); }}
            />
            <Text style={styles.brandText}>OPEN CITADEL</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
