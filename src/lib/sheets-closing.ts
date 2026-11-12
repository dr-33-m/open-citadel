/**
 * Waiting for the sheets on screen to finish closing before something else
 * moves: a menu's row that opens a screen (Listen opening the player) would
 * otherwise start the screen rising on the frame the sheet starts falling,
 * and the two raced each other. Every `Sheet` holds this from the moment it
 * mounts until its close has finished animating.
 */

/** The longest anything waits: a sheet left open somewhere never holds a screen back for good. */
const MAX_WAIT_MS = 600;

let open = 0;
let waiting: (() => void)[] = [];

function flush(): void {
  const run = waiting;
  waiting = [];
  for (const fn of run) fn();
}

/** A sheet is on screen (or closing); the returned release says it has gone. */
export function holdForSheet(): () => void {
  open += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    open -= 1;
    if (open === 0) flush();
  };
}

/** Runs `fn` once no sheet is on screen or closing: at once when none is. */
export function whenSheetsClosed(fn: () => void): void {
  if (open === 0) {
    fn();
    return;
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    fn();
  };
  const timer = setTimeout(() => {
    waiting = waiting.filter((x) => x !== once);
    once();
  }, MAX_WAIT_MS);
  waiting.push(once);
}
