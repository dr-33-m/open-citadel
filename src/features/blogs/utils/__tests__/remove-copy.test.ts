import { describe, expect, it } from 'vitest';

import { removeCopyConfirm } from '@/features/blogs/utils/remove-copy';

describe('removeCopyConfirm', () => {
  it('says what goes, and that the post stays', () => {
    const copy = removeCopyConfirm('Maps', 'Farnam Street');
    expect(`${copy.lead} ${copy.subject} ${copy.rest}`).toBe(
      'Your highlights and notes on Maps go with its copy. The post stays in Farnam Street, to open again.',
    );
    expect(copy.confirmLabel).toBe('REMOVE');
  });
});
