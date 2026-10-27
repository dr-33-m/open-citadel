import type { WebSource } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { earlierToolUseNote, type EarlierMessage } from '../earlier-tool-use';
import type { TurnStep } from '../turn-activity';

function step(tool: string, title: string, detail: string | null, status: TurnStep['status'] = 'done'): TurnStep {
  return { id: `${tool}-${title}`, tool, title, detail, status };
}

function reply(content: string, steps: TurnStep[], sources: WebSource[] = []): EarlierMessage {
  return { role: 'assistant', content, activity: { steps, sources } };
}

function page(n: number, snippet = `What page ${n} says`): WebSource {
  return { title: `Page ${n}`, url: `https://example.com/${n}`, snippet };
}

function searched(asked: string, sources: WebSource[]): EarlierMessage[] {
  return [
    { role: 'user', content: asked },
    reply('Found it', [step('web_search', `Searched the web for "${asked}"`, 'Found pages')], sources),
  ];
}

describe('earlierToolUseNote', () => {
  it('says nothing when no earlier reply used a tool', () => {
    expect(earlierToolUseNote([])).toBeNull();
    expect(
      earlierToolUseNote([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello', activity: null },
        { role: 'assistant', content: 'Hello again' },
      ]),
    ).toBeNull();
  });

  it('lists what he did before a reply, under the question it answered', () => {
    const note = earlierToolUseNote([
      { role: 'system', content: 'persona' },
      { role: 'user', content: 'Hie Samwell' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Do a psycho analysis of me from my books, podcasts and blogs' },
      reply('What stands out', [
        step('search_highlights', 'Searched your highlights', 'Found 9 matches'),
        step('list_my_podcasts', 'Looked over your podcasts', 'Found 4 shows'),
        step('list_my_blogs', 'Looked over your blogs', null),
      ]),
    ]);
    expect(note).toContain('Do not apologise');
    expect(note).toContain(
      [
        'Before your reply to "Do a psycho analysis of me from my books, podcasts and blogs":',
        '- search_highlights: Searched your highlights (Found 9 matches)',
        '- list_my_podcasts: Looked over your podcasts (Found 4 shows)',
        '- list_my_blogs: Looked over your blogs',
      ].join('\n'),
    );
    expect(note).not.toContain('Hie Samwell');
  });

  it('says when a step failed or was refused, and leaves out one still running', () => {
    const note = earlierToolUseNote([
      { role: 'user', content: 'Delete it' },
      reply('Done', [
        step('web_search', 'Searched the web', null, 'failed'),
        step('delete_book', 'Removed a book', null, 'declined'),
        step('search_library', 'Looking through your library', null, 'running'),
      ]),
    ]);
    expect(note).toContain('- web_search: Searched the web (it failed)');
    expect(note).toContain('- delete_book: Removed a book (the reader said no, so it did not run)');
    expect(note).not.toContain('search_library');
  });

  it('shortens a long question to one line', () => {
    const note = earlierToolUseNote([
      { role: 'user', content: `Tell me\nabout ${'books '.repeat(40)}` },
      reply('Here', [step('search_library', 'Looked through your library', 'Found 3 books')]),
    ]);
    const heading = note?.split('\n').find((line) => line.startsWith('Before your reply to'));
    expect(heading).toMatch(/^Before your reply to "Tell me about books books .*…":$/);
    expect(heading!.length).toBeLessThan(110);
  });

  it('counts the steps past eight rather than listing them', () => {
    const steps = Array.from({ length: 11 }, (_, i) => step('read_chapter', `Read "Chapter ${i + 1}"`, null));
    const note = earlierToolUseNote([{ role: 'user', content: 'Read it all' }, reply('Read', steps)]);
    expect(note).toContain('Read "Chapter 8"');
    expect(note).not.toContain('Read "Chapter 9"');
    expect(note).toContain('- and 3 more');
  });

  it('keeps only the twelve most recent replies', () => {
    const history: EarlierMessage[] = [];
    for (let i = 1; i <= 14; i += 1) {
      history.push({ role: 'user', content: `Question ${i}` });
      history.push(reply(`Answer ${i}`, [step('search_library', 'Looked through your library', null)]));
    }
    const note = earlierToolUseNote(history);
    expect(note).not.toContain('"Question 2"');
    expect(note).toContain('"Question 3"');
    expect(note).toContain('"Question 14"');
  });

  it('names no question when the reply came first', () => {
    const note = earlierToolUseNote([reply('Hello', [step('search_journey', 'Looked back over your journey', null)])]);
    expect(note).toContain('Before an earlier reply:');
  });

  it('carries the pages his latest web search found, with what each said', () => {
    const note = earlierToolUseNote(searched('Chip Wilson book', [page(1, 'Publisher: RosettaBooks;\n November 27, 2018')]));
    expect(note).toContain('- the web pages those searches found:\n  - Page 1 (https://example.com/1): Publisher: RosettaBooks; November 27, 2018');
  });

  it('carries pages for the two latest searches only, six apiece, each said briefly', () => {
    const many = Array.from({ length: 8 }, (_, i) => page(i + 1, 'x'.repeat(500)));
    const note = earlierToolUseNote([
      ...searched('first', [page(90)]),
      ...searched('second', many),
      { role: 'user', content: 'no search' },
      reply('Answer', [step('search_library', 'Looked through your library', null)]),
      ...searched('third', [page(91)]),
    ]);
    expect(note).toContain('Searched the web for "first"');
    expect(note).not.toContain('example.com/90');
    expect(note).toContain('example.com/6');
    expect(note).not.toContain('example.com/7');
    expect(note).toContain('example.com/91');
    const longest = Math.max(...note!.split('\n').filter((line) => line.startsWith('  - ')).map((line) => line.length));
    expect(longest).toBeLessThan(450);
  });
});
