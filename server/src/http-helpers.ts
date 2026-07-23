import { type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function requireOpenRouterKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new HTTPException(500, {
      message: 'OPENROUTER_API_KEY is not configured on the server.',
    });
  }
}

export function readDeviceId(c: Context): string {
  const headerDeviceId = c.req.header('x-samwell-device-id')?.trim();
  if (headerDeviceId) return headerDeviceId;

  throw new HTTPException(401, {
    message: 'Missing x-samwell-device-id header.',
  });
}
