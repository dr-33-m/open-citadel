import { beforeAll, describe, expect, it, vi } from 'vitest';

import { migrateAppDb } from '@/db/__tests__/app-db';

import { db } from '@/db/client';
import { books, collections, highlights, notes } from '@/db/schema';
import { executeToolCall, formatSearchResultsForLLM, type SearchResult } from '@/services/chat-tools';

// The real database, migrated; the stores are the parts under test only
// through what the tools hand them.
vi.mock('@/db/client', async () => {
  const { appDb } = await import('@/db/__tests__/app-db');
  return { db: appDb() };
});
const reader = vi.hoisted(() => ({
  addNote: vi.fn(async () => 'note-new'),
  updateNote: vi.fn(async () => {}),
  deleteNote: vi.fn(async () => {}),
  deleteHighlight: vi.fn(async () => {}),
}));
vi.mock('@/stores/reader', () => ({ useReaderStore: { getState: () => reader } }));
vi.mock('@/stores/timeline', () => ({ useTimelineStore: { getState: () => ({ loadTimeline: vi.fn(), deleteThought: vi.fn() }) } }));
const shelf = vi.hoisted(() => ({ setFavorite: vi.fn(async () => {}) }));
const shelves = vi.hoisted(() => ({ createCollection: vi.fn(async () => 'col-new') }));
vi.mock('@/stores/books', () => ({ useBooksStore: { getState: () => shelf } }));
vi.mock('@/stores/collections', () => ({ useCollectionsStore: { getState: () => shelves } }));
vi.mock('@/services/book-context', () => ({}));
vi.mock('@/services/reading-tools', () => ({}));
vi.mock('@/services/book-text/locate-passage', () => ({}));
vi.mock('@/services/journey', () => ({ formatJourneyNotes: () => '', searchJourneyNotes: () => [] }));

const ctx = { sessionId: 's1', bookId: null, runtime: 'cloud' as const };
const at = (minute: number) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

beforeAll(async () => {
  await migrateAppDb();
  db.insert(books)
    .values([
      { id: 'bk1', title: 'Deep Work', author: 'Cal Newport', addedAt: at(0), isFavorite: 1 },
      { id: 'bk2', title: 'Atomic Habits', author: 'James Clear', addedAt: at(0) },
    ])
    .run();
  db.insert(collections).values({ id: 'col1', name: 'Fashion', createdAt: at(0) }).run();
  db.insert(highlights)
    .values([
      { id: 'hl1', bookId: 'bk1', text: 'Attention is the scarce thing.', tags: '["focus"]', createdAt: at(1) },
      { id: 'hl2', bookId: 'bk1', text: 'Shallow work is easy to replicate.', tags: 'not json', createdAt: at(2) },
      { id: 'hl3', bookId: 'bk1', text: 'Rituals beat willpower.', createdAt: at(3) },
    ])
    .run();
  db.insert(notes)
    .values([
      { id: 'n1', highlightId: 'hl1', bookId: 'bk1', text: 'Mine is my phone', createdAt: at(4) },
      { id: 'n2', highlightId: 'hl1', bookId: 'bk1', text: 'Try mornings', createdAt: at(5) },
      { id: 'n3', highlightId: 'hl3', bookId: 'bk1', text: 'Gym at six', createdAt: at(6) },
    ])
    .run();
});

const search = async (args: Record<string, unknown>) =>
  (await executeToolCall('search_highlights', args, ctx)).result as SearchResult[];

describe('search_highlights', () => {
  it('lists the newest highlights, each once, with every note and its id', async () => {
    const results = await search({});
    expect(results.map((r) => r.id)).toEqual(['hl3', 'hl2', 'hl1']);
    expect(results.find((r) => r.id === 'hl1')?.notes).toEqual([
      { id: 'n1', text: 'Mine is my phone' },
      { id: 'n2', text: 'Try mornings' },
    ]);
  });

  it('reads a tag column that is not JSON as no tags, rather than throwing', async () => {
    expect((await search({})).find((r) => r.id === 'hl2')?.tags).toEqual([]);
  });

  it('finds a highlight by its note, carrying all of its notes', async () => {
    const results = await search({ query: 'mornings' });
    expect(results.map((r) => r.id)).toEqual(['hl1']);
    expect(results[0].notes?.map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('gives Samwell each note_id to edit by', async () => {
    const text = formatSearchResultsForLLM(await search({ query: 'mornings' }), 8_000);
    expect(text).toContain('Note (note_id n1): Mine is my phone');
    expect(text).toContain('Note (note_id n2): Try mornings');
  });
});

describe('the note tools', () => {
  it('adds a note through the store and hands back its id', async () => {
    const { result } = await executeToolCall('add_note_to_highlight', { highlight_id: 'hl2', text: '  Mine  ' }, ctx);
    expect(result).toEqual({ ok: true, noteId: 'note-new' });
    expect(reader.addNote).toHaveBeenCalledWith('hl2', 'Mine');
  });

  it('says so when the store finds no such highlight', async () => {
    reader.addNote.mockResolvedValueOnce(null as unknown as string);
    const { result } = await executeToolCall('add_note_to_highlight', { highlight_id: 'nope', text: 'x' }, ctx);
    expect(result).toEqual({ ok: false, error: 'highlight_not_found' });
  });

  it('rewrites the note it names, on the highlight the note is on, whatever highlight was passed', async () => {
    const { result } = await executeToolCall('update_note', { note_id: 'n3', highlight_id: 'hl1', text: 'Gym at seven' }, ctx);
    expect(result).toEqual({ ok: true, noteId: 'n3' });
    expect(reader.updateNote).toHaveBeenCalledWith('n3', 'hl3', 'Gym at seven');
  });

  it('will not report a rewrite or a delete of a note that is not there', async () => {
    expect((await executeToolCall('update_note', { note_id: 'nope', text: 'x' }, ctx)).result).toEqual({ ok: false, error: 'note_not_found' });
    expect((await executeToolCall('delete_note', { note_id: 'nope' }, ctx)).result).toEqual({ ok: false, error: 'note_not_found' });
  });

  it('deletes the note it names', async () => {
    expect((await executeToolCall('delete_note', { note_id: 'n2' }, ctx)).result).toEqual({ ok: true, noteId: 'n2' });
    expect(reader.deleteNote).toHaveBeenCalledWith('n2', 'hl1');
  });
});

describe('toggle_favorite', () => {
  it('makes a favourite stay a favourite when asked to add it', async () => {
    const { result } = await executeToolCall('toggle_favorite', { book_titles: ['Deep Work'], favorite: true }, ctx);
    expect(shelf.setFavorite).toHaveBeenLastCalledWith('bk1', true);
    expect(result).toMatchObject({ ok: true, succeeded: ['Deep Work (now a favourite)'] });
  });

  it('flips each book when no direction is given, as an older server asks', async () => {
    await executeToolCall('toggle_favorite', { book_titles: ['Deep Work', 'Atomic Habits'] }, ctx);
    expect(shelf.setFavorite).toHaveBeenCalledWith('bk1', false);
    expect(shelf.setFavorite).toHaveBeenCalledWith('bk2', true);
  });
});

describe('create_collection', () => {
  it('hands back the collection already called that, whatever its case', async () => {
    const { result } = await executeToolCall('create_collection', { name: ' fashion ' }, ctx);
    expect(result).toEqual({ ok: true, collectionId: 'col1', alreadyExisted: true });
    expect(shelves.createCollection).not.toHaveBeenCalled();
  });

  it('makes a new one otherwise', async () => {
    expect((await executeToolCall('create_collection', { name: 'Stoics' }, ctx)).result).toEqual({ ok: true, collectionId: 'col-new' });
  });
});
