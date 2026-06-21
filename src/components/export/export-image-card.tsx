import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { fontFamily } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

const CARD_SIZE = 1080;
const PADDING = 56;
const LOGO = require("../../../assets/icons/oc-adaptive-icon.png");

type ExportImageCardProps = {
  quoteText: string;
  bookTitle: string;
  authorName: string;
  coverUri: string | null;
  noteText: string | null;
  viewRef: React.RefObject<View | null>;
};

function getQuoteFontSize(length: number): number {
  if (length < 80) return 40;
  if (length < 150) return 34;
  if (length < 300) return 28;
  if (length < 500) return 24;
  return 20;
}

export function ExportImageCard({
  quoteText,
  bookTitle,
  authorName,
  coverUri,
  noteText,
  viewRef,
}: ExportImageCardProps) {
  const colors = useColors();
  const quoteFontSize = getQuoteFontSize(quoteText.length);

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        card: {
          width: CARD_SIZE,
          height: CARD_SIZE,
          backgroundColor: colors.surface.base,
          borderWidth: 1,
          borderColor: `${colors.primary.default}33`,
          padding: PADDING,
          justifyContent: "space-between",
        },
        topSection: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        },
        titleArea: {
          flex: 1,
          alignItems: "center",
          paddingRight: 16,
        },
        bookTitle: {
          fontFamily: fontFamily.sansSemiBold,
          fontSize: 22,
          letterSpacing: 3,
          color: colors.text.secondary,
          textAlign: "center",
        },
        authorName: {
          fontFamily: fontFamily.sans,
          fontSize: 18,
          color: colors.text.secondary,
          textAlign: "center",
          marginTop: 6,
        },
        coverImage: {
          width: 120,
          height: 165,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: `${colors.primary.default}26`,
        },
        quoteSection: {
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 6,
          marginVertical: 16,
        },
        openQuote: {
          fontFamily: fontFamily.serifBold,
          fontSize: 100,
          color: colors.primary.default,
          opacity: 0.18,
          lineHeight: 100,
          marginBottom: -40,
          marginLeft: -6,
        },
        quoteTextContainer: {
          paddingHorizontal: 16,
        },
        quoteText: {
          fontFamily: fontFamily.serifItalic,
          color: colors.text.primary,
        },
        closeQuote: {
          fontFamily: fontFamily.serifBold,
          fontSize: 100,
          color: colors.primary.default,
          opacity: 0.18,
          lineHeight: 100,
          textAlign: "right",
          marginTop: -40,
          marginRight: -6,
        },
        bottomSection: {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        },
        spacer: {
          flex: 1,
        },
        noteSection: {
          flex: 1,
          paddingRight: 32,
        },
        noteLine: {
          width: 50,
          height: 2,
          backgroundColor: colors.primary.default,
          marginBottom: 10,
        },
        noteLabel: {
          fontFamily: fontFamily.sansSemiBold,
          fontSize: 16,
          letterSpacing: 2,
          color: colors.text.primary,
          marginBottom: 6,
        },
        noteText: {
          fontFamily: fontFamily.serif,
          fontSize: 18,
          lineHeight: 26,
          color: colors.text.secondary,
        },
        logoContainer: {
          alignItems: "flex-end",
        },
        logoLine: {
          width: 50,
          height: 2,
          backgroundColor: colors.primary.default,
          marginBottom: 10,
        },
        logoText: {
          fontFamily: fontFamily.sansSemiBold,
          fontSize: 13,
          letterSpacing: 2.5,
          color: colors.text.secondary,
          marginBottom: 8,
        },
        logo: {
          width: 100,
          height: 100,
          opacity: 0.6,
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
      {/* Top section: title + author + optional cover */}
      <View style={styles.topSection}>
        <View style={styles.titleArea}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {bookTitle.toUpperCase()}
          </Text>
          {authorName.length > 0 && (
            <Text style={styles.authorName} numberOfLines={1}>
              {authorName}
            </Text>
          )}
        </View>

        {coverUri && (
          <Image source={{ uri: coverUri }} style={styles.coverImage} />
        )}
      </View>

      {/* Center: quote with decorative marks */}
      <View style={styles.quoteSection}>
        <Text style={styles.openQuote}>{"\u201C"}</Text>

        <View style={styles.quoteTextContainer}>
          <Text
            style={[styles.quoteText, { fontSize: quoteFontSize, lineHeight: quoteFontSize * 1.45 }]}
            numberOfLines={12}
          >
            {quoteText}
          </Text>
        </View>

        <Text style={styles.closeQuote}>{"\u201D"}</Text>
      </View>

      {/* Bottom section: note (optional) + logo (always) */}
      <View style={styles.bottomSection}>
        {noteText ? (
          <View style={styles.noteSection}>
            <View style={styles.noteLine} />
            <Text style={styles.noteLabel}>NOTE</Text>
            <Text style={styles.noteText} numberOfLines={4}>
              {noteText}
            </Text>
          </View>
        ) : (
          <View style={styles.spacer} />
        )}

        <View style={styles.logoContainer}>
          <View style={styles.logoLine} />
          <Text style={styles.logoText}>OPEN CITADEL</Text>
          <Image source={LOGO} style={styles.logo} />
        </View>
      </View>
    </View>
  );
}
