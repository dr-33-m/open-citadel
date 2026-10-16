/**
 * Which of the device's tools a request may offer the model.
 *
 * Every Samwell tool but `web_search` runs in the app, so a tool the model is
 * offered and the app cannot run is a turn that hangs: the model calls it and
 * waits for a result nobody is going to send. That happens the moment the
 * server learns a tool before a phone does, which is every release (the
 * server deploys first, and a store build lives on for weeks after an update
 * ships over the air).
 *
 * TanStack's client already says what it can run. Each request carries the
 * AG-UI `tools` list, one entry per client tool it registered, so the server
 * offers exactly the intersection: its own definitions (never the client's,
 * which are not trusted), limited to the names the app declared.
 *
 * A request that declares nothing at all predates the list; it gets every
 * tool except the ones added since, which is what such a build could run.
 */

/** Device tools added after the first builds that sent their tools list. */
export const CLIENT_TOOLS_ADDED_LATER: ReadonlySet<string> = new Set(['search_library', 'get_book_details']);

function declaredNames(declared: unknown): Set<string> | null {
  if (!Array.isArray(declared)) return null;
  const names = declared
    .map((tool) => (tool && typeof tool === 'object' ? (tool as { name?: unknown }).name : null))
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
  return names.length > 0 ? new Set(names) : null;
}

export function offeredClientTools<T extends { name: string }>(
  definitions: readonly T[],
  declared: unknown,
  addedLater: ReadonlySet<string> = CLIENT_TOOLS_ADDED_LATER,
): T[] {
  const names = declaredNames(declared);
  if (names) return definitions.filter((tool) => names.has(tool.name));
  return definitions.filter((tool) => !addedLater.has(tool.name));
}
