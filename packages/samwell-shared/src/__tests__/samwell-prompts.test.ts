import { describe, expect, it } from 'vitest';

import { SAMWELL_CHARACTER, SAMWELL_CHARACTER_COMPACT } from '../character';
import { COMPASS_SYSTEM_PROMPT } from '../compass-prompts';
import { COMPASS_TOOL_NAMES } from '../compass-tools';
import { DISCOVERY_TOOL_NAMES, SAMWELL_DISCOVERY_TOOL_PROMPT } from '../discovery-tools';
import { SAMWELL_MOMENTS_PROMPT } from '../moments';
import {
  SAMWELL_JOURNEY_TOOL_PROMPT,
  SAMWELL_SYSTEM_PROMPT,
  SAMWELL_SYSTEM_PROMPT_COMPACT,
  SAMWELL_SYSTEM_PROMPT_NO_TOOLS,
} from '../persona';

const EVERY_PROMPT = {
  SAMWELL_CHARACTER,
  SAMWELL_CHARACTER_COMPACT,
  COMPASS_SYSTEM_PROMPT,
  SAMWELL_DISCOVERY_TOOL_PROMPT,
  SAMWELL_MOMENTS_PROMPT,
  SAMWELL_JOURNEY_TOOL_PROMPT,
  SAMWELL_SYSTEM_PROMPT,
  SAMWELL_SYSTEM_PROMPT_COMPACT,
  SAMWELL_SYSTEM_PROMPT_NO_TOOLS,
};

describe("Samwell's prompts", () => {
  it('model the punctuation he is told to use', () => {
    for (const [name, prompt] of Object.entries(EVERY_PROMPT)) {
      expect(prompt.includes('—'), name).toBe(false);
    }
  });

  it('carry what to do in a crisis on every engine, not only the cloud', () => {
    for (const character of [SAMWELL_CHARACTER, SAMWELL_CHARACTER_COMPACT]) {
      expect(character).toContain('crisis line');
      expect(character).toContain('You are an AI');
    }
  });

  it('do not reward coming back for its own sake', () => {
    for (const character of [SAMWELL_CHARACTER, SAMWELL_CHARACTER_COMPACT]) {
      expect(character).not.toContain('coming back tomorrow');
    }
  });

  it('name only tools Compass really has', () => {
    const list = COMPASS_SYSTEM_PROMPT.split('## Your tools')[1].split('## When there is no goal yet')[0];
    const named = list.match(/^- ([a-z_]+(?:, [a-z_]+)*(?:,? and [a-z_]+)?):/gm) ?? [];
    const tools = named.flatMap((line) => line.slice(2, -1).split(/, and |, | and /));
    expect(tools.length).toBeGreaterThan(8);
    for (const tool of tools) expect(COMPASS_TOOL_NAMES.has(tool), tool).toBe(true);
  });

  it('tell him to act only with the discovery tools he is given', () => {
    for (const tool of DISCOVERY_TOOL_NAMES) expect(SAMWELL_DISCOVERY_TOOL_PROMPT).toContain(tool);
  });
});
