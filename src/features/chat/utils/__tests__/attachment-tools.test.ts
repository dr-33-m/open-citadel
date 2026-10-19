import { describe, expect, it } from 'vitest';

import { attachmentTool } from '@/features/chat/utils/attachment-tools';

describe('attachmentTool', () => {
  it('offers every kind before a chat exists', () => {
    const state = { hasSession: false, attachedKind: null, pendingKind: null, busy: false };
    for (const kind of ['book', 'article', 'episode'] as const) {
      expect(attachmentTool(kind, state)).toEqual({ shown: true, attached: false, pickable: true, droppable: false });
    }
  });

  it('lets a waiting pick be dropped, and only that one', () => {
    const state = { hasSession: false, attachedKind: 'episode' as const, pendingKind: 'episode' as const, busy: false };
    expect(attachmentTool('episode', state)).toMatchObject({ attached: true, droppable: true });
    expect(attachmentTool('book', state)).toMatchObject({ attached: false, droppable: false, pickable: true });
  });

  it("shows only the session's own kind once a chat exists, fixed", () => {
    const state = { hasSession: true, attachedKind: 'episode' as const, pendingKind: null, busy: false };
    expect(attachmentTool('episode', state)).toEqual({ shown: true, attached: true, pickable: false, droppable: false });
    expect(attachmentTool('article', state).shown).toBe(false);
  });

  it('holds still while a reply streams', () => {
    const state = { hasSession: false, attachedKind: 'book' as const, pendingKind: 'book' as const, busy: true };
    expect(attachmentTool('book', state)).toMatchObject({ pickable: false, droppable: false });
  });
});
