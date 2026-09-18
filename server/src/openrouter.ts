/**
 * What every OpenRouter request asks of the routing layer.
 *
 * ## Zero data retention, per request
 *
 * `zdr` restricts a request to provider endpoints that do not store prompts
 * or completions, and OpenRouter refuses the request rather than falling back
 * to one that does. It is set here, on every call, instead of being left to
 * the account's privacy settings: the promise the app makes about a reader's
 * conversations should live in the repository, where it is reviewable and
 * cannot be turned off by a toggle on a website a year from now.
 *
 * The per-request flag ORs with the account and guardrail settings, so this
 * can only ever tighten what those allow, never loosen it.
 *
 * ## Why this is safe for the catalogue
 *
 * Checked against OpenRouter's own list (`/api/v1/endpoints/zdr`): every model
 * in `CLOUD_MODEL_CATALOG` has at least one zero-retention endpoint, most of
 * them several. The Anthropic models route through Bedrock or Vertex and the
 * OpenAI ones through Azure, which is what zero retention costs here: a
 * different endpoint for the same model, not a different model.
 *
 * **A model added to the catalogue has to be checked the same way.** Without a
 * zero-retention endpoint it will not route at all, and the symptom is a
 * failed turn rather than a warning at boot:
 *
 *     curl -s https://openrouter.ai/api/v1/endpoints/zdr \
 *       | grep '"model_id": "<the new model>"'
 *
 * Implicit prompt caching is still allowed through: OpenRouter does not count
 * a provider's in-memory cache as retention, and neither do we.
 */
export const PROVIDER_PREFERENCES = { zdr: true } as const;
