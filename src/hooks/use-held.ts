import React from 'react';

/**
 * The value, or the last one it had once it has gone to null: what a screen
 * keeps drawing while it leaves because its subject went away (the book
 * stopped, the last episode finished), so it slides off full rather than
 * blank.
 */
export function useHeld<T>(value: T | null): T | null {
  const [held, setHeld] = React.useState(value);
  if (value !== null && value !== held) setHeld(value);
  return value ?? held;
}
