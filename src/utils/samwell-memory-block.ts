/**
 * What Samwell knows about them, in the words sent with a cloud turn. Pure, and
 * small on purpose: it goes with every turn, so it holds what he should have at
 * hand. Everything else is one `search_journey` away.
 */
export type MemoryFacts = {
  profile: string | null;
  /** Newest first. */
  wins: { text: string; on: string }[];
  /** Newest first. */
  commitments: { text: string; dueOn: string | null }[];
  shows: string[];
  blogs: string[];
};

const MAX_LINE = 280;

function line(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_LINE ? `${flat.slice(0, MAX_LINE - 1)}…` : flat;
}

/** The block, or an empty string when he knows nothing yet. */
export function memoryBlock({ profile, wins, commitments, shows, blogs }: MemoryFacts): string {
  const parts: string[] = [];
  if (profile?.trim()) parts.push(profile.trim());
  if (wins.length > 0) {
    parts.push(`Recent wins:\n${wins.map((win) => `- ${win.on}: ${line(win.text)}`).join('\n')}`);
  }
  if (commitments.length > 0) {
    const items = commitments.map((item) => `- ${line(item.text)}${item.dueOn ? ` (by ${item.dueOn})` : ''}`);
    parts.push(`What they said they would do, not yet closed:\n${items.join('\n')}`);
  }
  const taking = [
    shows.length > 0 ? `shows: ${shows.join(', ')}` : null,
    blogs.length > 0 ? `blogs: ${blogs.join(', ')}` : null,
  ].filter(Boolean);
  if (taking.length > 0) parts.push(`Also taking in lately: ${taking.join('; ')}`);
  return parts.length > 0 ? `What you know about them:\n${parts.join('\n\n')}` : '';
}
