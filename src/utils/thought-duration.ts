/**
 * How long he thought, as the footer under a reply says it: "12s", "2m 20s",
 * "2m". Short, because it sits beside the copy button and the sources; the
 * sheet it opens says it in full (`thoughtForLabel`).
 */
export function thoughtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
