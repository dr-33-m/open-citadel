import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const books = sqliteTable('books', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  coverUrl: text('cover_url'),
  filePath: text('file_path'),
  sourceUri: text('source_uri'),
  fileSize: integer('file_size'),
  lastModified: text('last_modified'),
  totalPages: integer('total_pages'),
  category: text('category'),
  status: text('status', {
    enum: ['reading', 'queued', 'archived', 'favorite'],
  }),
  isFavorite: integer('is_favorite').notNull().default(0),
  addedAt: text('added_at').notNull(),
  completedAt: text('completed_at'),
});

export const readingProgress = sqliteTable('reading_progress', {
  id: text('id').primaryKey(),
  bookId: text('book_id')
    .notNull()
    .references(() => books.id),
  currentPage: integer('current_page').notNull(),
  percentage: real('percentage').notNull(),
  locator: text('locator'),
  updatedAt: text('updated_at').notNull(),
});

export const highlights = sqliteTable('highlights', {
  id: text('id').primaryKey(),
  bookId: text('book_id')
    .notNull()
    .references(() => books.id),
  text: text('text').notNull(),
  locator: text('locator'),
  page: integer('page'),
  chapter: text('chapter'),
  color: text('color').default('#f2ca50'),
  tags: text('tags'),
  createdAt: text('created_at').notNull(),
});

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  highlightId: text('highlight_id').references(() => highlights.id),
  bookId: text('book_id')
    .notNull()
    .references(() => books.id),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
});

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  createdAt: text('created_at').notNull(),
});

export const bookCollections = sqliteTable('book_collections', {
  bookId: text('book_id')
    .notNull()
    .references(() => books.id),
  collectionId: text('collection_id')
    .notNull()
    .references(() => collections.id),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
