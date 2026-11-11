import { PublisherRulesSchema } from 'samwell-shared';
import { describe, expect, it } from 'vitest';

import { publisherRoutes } from '../publisher-routes.js';

describe('GET /publishers/rules', () => {
  it('answers with the list in the shape the phone reads', async () => {
    const response = await publisherRoutes.request('/rules');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('max-age');
    expect(PublisherRulesSchema.safeParse(await response.json()).success).toBe(true);
  });
});
