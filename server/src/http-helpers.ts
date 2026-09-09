import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function requireOpenRouterKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new HTTPException(500, {
      message: 'OPENROUTER_API_KEY is not configured on the server.',
    });
  }
}

/** Moved here from `index.ts` so the insider admin route can share it. */
export function requireAdminKey(c: Context): void {
  if (!process.env.ADMIN_API_KEY) {
    throw new HTTPException(500, {
      message: 'ADMIN_API_KEY is not configured on the server.',
    });
  }
  const provided = c.req.header('x-admin-key');
  if (!provided || provided !== process.env.ADMIN_API_KEY) {
    throw new HTTPException(401, { message: 'Invalid or missing x-admin-key header.' });
  }
}
