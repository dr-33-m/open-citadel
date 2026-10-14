import React from "react";

import { LibrarySkeleton } from "@/components/skeletons/library-skeleton";
import { ThemedView } from "@/components/themed-view";
import { BlogsHomeSkeleton } from "@/features/blogs/components/blogs-home-skeleton";
import { useContinueHint } from "@/features/library/hooks/use-continue-hint";
import { PodcastsHomeSkeleton } from "@/features/podcasts/components/podcasts-home-skeleton";
import type { LibraryTab } from "@/stores/podcast-prefs";

/**
 * A side's skeleton, standing in while the side itself is built.
 *
 * A side opened for the first time is built behind the switch, in a
 * background render (`useLibraryPage`). Until that lands there used to be no
 * side at all: the one being left faded out onto an empty page, and the
 * skeleton only began to pulse once the whole side had been built. This is
 * the skeleton the side opens on, cheap enough to draw in the tap's own
 * render, so the fade has something to bring in, and it carries on the same
 * pulse when the side takes over.
 */
export function LibrarySidePlaceholder({ side }: { side: LibraryTab }) {
  if (side === "books") {
    return (
      <ThemedView className="flex-1">
        <LibrarySkeleton />
      </ThemedView>
    );
  }
  return <FeedSidePlaceholder side={side} />;
}

/** Podcasts' or blogs': led by the Continue card when the side had one last time. */
function FeedSidePlaceholder({ side }: { side: "podcasts" | "blogs" }) {
  const hero = useContinueHint(side, undefined);
  return side === "podcasts" ? <PodcastsHomeSkeleton hero={hero} /> : <BlogsHomeSkeleton hero={hero} />;
}
