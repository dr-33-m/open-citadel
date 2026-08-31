import { BlankStack } from 'react-native-screen-transitions/expo-router';

/**
 * The app's one navigator.
 *
 * A *blank* stack rather than a native one: the native stack owns its
 * transitions in platform code, which is exactly the part this app replaces —
 * screens here move as one surface between the Library and its neighbours
 * (see `navigation/transitions`), and that choreography has to be ours to
 * write. Screens stay mounted while inactive (`inactiveBehavior` defaults to
 * `hide`), so returning to the Library lands on the scroll position it was
 * left at.
 *
 * The `/expo-router` entry integrates the navigator with Router's own
 * navigation tree — SDK 57's Router vendors React Navigation, so the
 * `/react-navigation` entry point would build a second, disconnected
 * navigation context. Lives outside `src/app/` on purpose: every file under
 * that directory is a route, and this is a component.
 */
export const TransitionStack = BlankStack;
