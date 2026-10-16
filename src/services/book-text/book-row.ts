import type { books } from '@/db/schema';

/**
 * A `books` row, as the reading tools take one. From the schema rather than
 * the books store, which warms the index and so may not be imported by it.
 */
export type BookRow = typeof books.$inferSelect;
