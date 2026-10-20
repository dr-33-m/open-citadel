import React from 'react';

/**
 * In a chat about a podcast episode, what a cited time does: play the
 * episode from there. Null in every other chat, where "[12:04]" is words.
 *
 * A context rather than a prop, because a reply is drawn several memoised
 * layers below the page that knows which episode the chat is about, and the
 * value changes only when the chat does.
 */
export const EpisodeTimesContext = React.createContext<((seconds: number) => void) | null>(null);
