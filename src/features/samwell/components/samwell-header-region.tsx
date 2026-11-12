import React from 'react';

import { WholePostsSheet } from '@/features/blogs/components/whole-posts-sheet';
import { ChatHeader } from '@/features/chat/components/chat-header';
import { useSamwellHeader } from '@/features/samwell/hooks/use-samwell-header';

/** The bar over the conversation, and the question opening a post from it can ask; see `useSamwellHeader`. */
export function SamwellHeaderRegion() {
  const { header, wholePosts } = useSamwellHeader();
  return (
    <>
      <ChatHeader {...header} />
      <WholePostsSheet {...wholePosts} />
    </>
  );
}
