/**
 * The one player, whatever is in it: an episode (`services/podcasts/player`)
 * or a book (`services/audiobook`). What both share lives here: the native
 * listeners, the waits the controls draw, the lock screen's commands, and
 * the controls the screens call.
 */
import '@/services/audiobook';
import '@/services/podcasts/player/events';

export {
  releasePlayerForSpeech,
  seekTo,
  setSleepTimer,
  setSpeed,
  skipBy,
  stopPlayback,
  togglePlayback,
} from '@/services/player/controls';
export { attachPlayerListeners, registerPlayerBackgroundHandler } from '@/services/player/events';
