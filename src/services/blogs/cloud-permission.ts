/**
 * Which posts' reader copies may not go to a cloud brain or a cloud voice,
 * because their publisher has asked (`PublisherPermissions.cloud`). Samwell
 * on the phone, and the phone's own voices, still read them.
 */
import { eq, isNotNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { blogArticles } from '@/db/schema';
import { permissionsFor, publisherRules } from '@/services/publishers';

/** The reader copies of posts kept from the cloud. Empty, at no cost, while no publisher has asked. */
export function cloudBarredBookIds(): Set<string> {
  if (!publisherRules().some((rule) => rule.cloud === false)) return new Set();
  const rows = db.select({ bookId: blogArticles.bookId, link: blogArticles.link }).from(blogArticles).where(isNotNull(blogArticles.bookId)).all();
  return new Set(rows.filter((row) => !permissionsFor(row.link).cloud).map((row) => row.bookId!));
}

/** Whether this reader copy is a post kept from the cloud. */
export function isCloudBarred(bookId: string): boolean {
  if (!publisherRules().some((rule) => rule.cloud === false)) return false;
  const row = db.select({ link: blogArticles.link }).from(blogArticles).where(eq(blogArticles.bookId, bookId)).get();
  return row ? !permissionsFor(row.link).cloud : false;
}

/** What Samwell is told when a tool reaches for such a post in the cloud. */
export const CLOUD_BARRED =
  'Its publisher asks that its posts are not sent to cloud AI, so it can only be read with Samwell on the phone. Tell the reader so, plainly.';
