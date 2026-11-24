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

/**
 * What the "i" says, and what the choice to turn it on is made after. In
 * the order a person asks: what is this, what is sent, what is not and can
 * I stop it. Every point is something `lib/observe` really sends: its named
 * events and the brain and plan they carry (`use-observe-context`), errors
 * scrubbed of addresses, and what EAS Observe adds itself (the phone, its
 * state at launch, the slowest request's website, a country from the
 * connection, a random install id). Change it alongside them.
 */
export const PERFORMANCE_INFO: InfoContent = {
  label: 'APP PERFORMANCE',
  title: 'Help make Open Citadel faster',
  line: 'When it is on, the app sends us how well it runs, so we can fix what is slow or broken.',
  pointsLabel: 'WHAT IS SENT',
  points: [
    'How long your library takes to load, and where its slowest download came from.',
    'How long each screen and Samwell take.',
    'Errors and crashes, with web addresses and file names removed.',
    'Your phone model, system version, language, battery and network.',
    'Your country, from your internet connection.',
    'Which brain Samwell uses, and your plan.',
  ],
  notice: {
    title: 'Never sent',
    body: 'What you read, write or say to Samwell, or who you are. Your phone is known only by a random id, and you can turn this off here at any time.',
  },
};

/** The two answers, as plain as each other. */
export const PERFORMANCE_ACCEPT = 'SHARE PERFORMANCE';
export const PERFORMANCE_DECLINE = 'NOT NOW';
export const PERFORMANCE_TURN_OFF = 'TURN OFF';
