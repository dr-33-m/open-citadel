/**
 * Samwell's words, with the cards his markers stand for drawn in place.
 *
 * Moved out of `chat-bubble.tsx` when his replies stopped being bubbles: the
 * reply is drawn by `SamwellResponse`, and this is the part of it that reads
 * the text.
 */
import React, { useMemo } from "react";
import { View } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";

import { BookCard } from "@/components/chat/book-card";
import { HighlightCard } from "@/components/chat/highlight-card";
import { SuggestionCard } from "@/components/chat/suggestion-card";
import { useMarkdownStyle } from "@/hooks/use-markdown-style";

// Splits on the marker protocol Samwell is instructed to emit:
//   [[ref:highlight:hl-123]] / [[ref:thought:th-123]]  an existing entry, read-only
//   [[suggest:highlight:sugg-1]] / [[suggest:thought:sugg-1]]  a proposal, approve/reject
//   [[book:bk-123]]  a book from the library, shown with its cover
function createMarkerPattern() {
  return /\[\[(?:(ref|suggest):(highlight|thought)|(book)):([^\]]+)\]\]/g;
}

function MarkdownSegment({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const markdownStyle = useMarkdownStyle({
    voice: "sans",
    fontSize: 15,
    lineHeight: 22,
  });

  return (
    /*
     * One native text view, not a tree of RN views.
     *
     * `streamingAnimation` fades only the tail — the characters beyond what
     * was already rendered — which is why the old `content + ' ▍'` caret is
     * gone. That caret existed to show the reply was still coming while the
     * whole block re-rendered on every token; the library animates the
     * arrival itself, so the block cursor was standing in for motion that now
     * happens for real.
     *
     * `commonmark` rather than `github`: the GitHub flavour renders fenced
     * code as a separate scrolling pane with a header bar and copy button,
     * which is a lot of chrome for a reading companion who never emits code.
     * CommonMark keeps a code block inside the same text view, where it wraps.
     */
    <EnrichedMarkdownText
      markdown={content}
      markdownStyle={markdownStyle}
      flavor="commonmark"
      streamingAnimation={streaming}
      selectable
    />
  );
}

export const AssistantContent = React.memo(function AssistantContent({
  content,
  streaming,
  onNavigateToHighlight,
  onNavigateToTimeline,
  onNavigateToBook,
}: {
  content: string;
  streaming?: boolean;
  onNavigateToHighlight?: (bookId: string, locator: string) => void;
  onNavigateToTimeline?: () => void;
  onNavigateToBook?: (bookId: string) => void;
}) {
  // Split content into text segments and reference/suggestion markers
  const segments = useMemo(() => {
    if (
      !content.includes("[[ref:") &&
      !content.includes("[[suggest:") &&
      !content.includes("[[book:")
    ) {
      return null; // Fast path: no markers, render as plain markdown
    }

    const parts: (
      | { kind: "text"; text: string }
      | { kind: "ref"; type: "highlight" | "thought"; id: string }
      | { kind: "suggest"; type: "highlight" | "thought"; id: string }
      | { kind: "book"; id: string }
    )[] = [];
    let lastIndex = 0;
    const markerPattern = createMarkerPattern();

    let match;
    while ((match = markerPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          kind: "text",
          text: content.slice(lastIndex, match.index),
        });
      }
      parts.push(
        match[3] === "book"
          ? { kind: "book", id: match[4] }
          : {
              kind: match[1] as "ref" | "suggest",
              type: match[2] as "highlight" | "thought",
              id: match[4],
            },
      );
      lastIndex = markerPattern.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push({ kind: "text", text: content.slice(lastIndex) });
    }

    return parts;
  }, [content]);

  // No refs — render plain markdown
  if (!segments) {
    return <MarkdownSegment content={content} streaming={streaming} />;
  }

  return (
    <View>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          // The whitespace between two back-to-back cards is not a paragraph.
          // Rendered, it drew an empty line of markdown height between them.
          if (!seg.text.trim()) return null;
          const isLast = i === segments.length - 1;
          return (
            <MarkdownSegment
              key={i}
              content={seg.text}
              streaming={isLast ? streaming : false}
            />
          );
        }
        if (seg.kind === "book") {
          return (
            <BookCard
              key={`book-${seg.id}`}
              id={seg.id}
              onNavigate={onNavigateToBook}
            />
          );
        }
        if (seg.kind === "suggest") {
          return (
            <SuggestionCard
              key={`suggest-${seg.type}-${seg.id}`}
              id={seg.id}
              kind={seg.type}
            />
          );
        }
        return (
          <HighlightCard
            key={`${seg.type}-${seg.id}`}
            id={seg.id}
            type={seg.type}
            onNavigate={onNavigateToHighlight}
            onNavigateToTimeline={onNavigateToTimeline}
          />
        );
      })}
    </View>
  );
});
