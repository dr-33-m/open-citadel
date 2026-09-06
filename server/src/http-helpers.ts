import { HTTPException } from 'hono/http-exception';

export function requireOpenRouterKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new HTTPException(500, {
      message: 'OPENROUTER_API_KEY is not configured on the server.',
    });
  }
}
