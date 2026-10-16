import { describe, expect, it } from 'vitest';

import { thoughtBeats } from '@/utils/thought-beats';

describe('thoughtBeats', () => {
  it('makes a beat of each paragraph', () => {
    expect(thoughtBeats('First I look.\n\nThen I answer.')).toEqual([
      { title: null, body: 'First I look.' },
      { title: null, body: 'Then I answer.' },
    ]);
  });

  it('turns a bold or hashed heading into the title, alone or on the paragraph', () => {
    expect(thoughtBeats('**Planning the search**\n\nI need the latest model.\n\n### Checking\nFord lists ten.')).toEqual([
      { title: 'Planning the search', body: 'I need the latest model.' },
      { title: 'Checking', body: 'Ford lists ten.' },
    ]);
  });

  it('joins wrapped lines and drops stray bold marks', () => {
    expect(thoughtBeats('The **2026** model\nhas ten variants.')).toEqual([{ title: null, body: 'The 2026 model has ten variants.' }]);
  });

  it('keeps a heading with nothing after it, and skips empty paragraphs', () => {
    expect(thoughtBeats('\n\nDone.\n\n\n\n**Wrapping up**')).toEqual([
      { title: null, body: 'Done.' },
      { title: 'Wrapping up', body: '' },
    ]);
    expect(thoughtBeats('   ')).toEqual([]);
  });
});
