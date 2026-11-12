import { describe, expect, it } from 'vitest';

import { COMPASS_FOCUS, COMPASS_GUIDE, COMPASS_SYSTEM_PROMPT } from '../compass-prompts';
import { READING_FOCUS, SAMWELL_DEVICE_SYSTEM_PROMPT, SAMWELL_SYSTEM_PROMPT, TOOL_SILENCE } from '../persona';
import { SAMWELL_UNIFIED_SYSTEM_PROMPT } from '../samwell-prompt';

describe('SAMWELL_UNIFIED_SYSTEM_PROMPT', () => {
  it('carries both halves from the same pieces as the two older prompts', () => {
    for (const piece of [READING_FOCUS, COMPASS_FOCUS, COMPASS_GUIDE, TOOL_SILENCE]) {
      expect(SAMWELL_UNIFIED_SYSTEM_PROMPT).toContain(piece);
    }
    expect(SAMWELL_SYSTEM_PROMPT).toContain(READING_FOCUS);
    expect(COMPASS_SYSTEM_PROMPT).toContain(COMPASS_GUIDE);
  });

  it('never sends him to a switch that is no longer there', () => {
    expect(SAMWELL_UNIFIED_SYSTEM_PROMPT).not.toMatch(/switch beside the message box/);
  });

  it('ends on the tool rule, as every prompt with tools does', () => {
    expect(SAMWELL_UNIFIED_SYSTEM_PROMPT.endsWith(TOOL_SILENCE)).toBe(true);
  });

  it('has no em dashes, since he writes the way he is told to', () => {
    expect(SAMWELL_UNIFIED_SYSTEM_PROMPT).not.toContain('—');
  });
});

describe('SAMWELL_DEVICE_SYSTEM_PROMPT', () => {
  it('is the reading prompt without the switch, which this build no longer has', () => {
    expect(SAMWELL_DEVICE_SYSTEM_PROMPT).toContain(READING_FOCUS);
    expect(SAMWELL_DEVICE_SYSTEM_PROMPT).not.toMatch(/switch/);
    expect(SAMWELL_DEVICE_SYSTEM_PROMPT.endsWith(TOOL_SILENCE)).toBe(true);
  });
});
