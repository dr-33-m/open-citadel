/**
 * The words for sharing app performance (EAS Observe). Pure.
 *
 * Written to the stores' rules, which shape it: Apple's App Review 5.1.1
 * (consent first, nothing manipulated or forced, easy to withdraw) and its
 * privacy labels, Google Play's User Data policy (an in-app disclosure right
 * before an affirmative choice). So it says what is sent without rounding it
 * up to "anonymous" (each phone is counted by a random id), recommends without
 * pressing, and gives the two answers equal plainness. Nothing here is a
 * reason to turn it on except what it is for.
 */
import type { InfoContent } from '@/components/info-sheet';

/** The line under the row's title: short enough never to be cut off beside a switch. */
export function performanceLine(sharing: boolean): string {
  return sharing ? 'Helping make it faster' : 'Recommended';
}

/** What the "i" says, and what the choice to turn it on is made after. */
export const PERFORMANCE_INFO: InfoContent = {
  label: 'APP PERFORMANCE',
  title: 'Help make Open Citadel faster',
  line: 'When this is on, the app sends how it performed, so slow and broken parts can be found and fixed.',
  points: [
    'How long the app takes to open, each screen to be ready, and Samwell to answer.',
    'Errors it ran into, with web addresses and file names taken out.',
    "Your phone's model, system, language, network and battery state, and the app's version.",
    'Your rough country, from your IP address, and the website of the slowest request as the app opens.',
    'Never what you read, write or say to Samwell, and never your name or account.',
  ],
  notice: {
    title: 'Off until you turn it on',
    body: 'Used only by Open Citadel, to find and fix slow parts. Your phone is counted by a random id, not by who you are. Turn it off here at any time.',
  },
};

/** The two answers, as plain as each other. */
export const PERFORMANCE_ACCEPT = 'SHARE PERFORMANCE';
export const PERFORMANCE_DECLINE = 'NOT NOW';
export const PERFORMANCE_TURN_OFF = 'TURN OFF';
