import { Hono } from 'hono';
import { PUBLISHER_RULES } from 'samwell-shared';

import { rateLimit } from './rate-limit.js';

/**
 * `GET /publishers/rules`: what publishers have asked of the app, for every
 * phone to keep and apply (`samwell-shared/publishers.ts`). Open, since it is
 * about the publishers and not about who asks, and read-only. A phone asks
 * about once a day, so a long cache is right.
 */
export const publisherRoutes = new Hono();

publisherRoutes.use('/rules', rateLimit({ limit: 60, windowMs: 60_000 }));

publisherRoutes.get('/rules', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json({ rules: PUBLISHER_RULES });
});
