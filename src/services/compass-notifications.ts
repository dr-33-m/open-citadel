import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local daily check-in reminders. Entirely on-device — the pit wall calls the
 * driver at the times they chose. Scheduled only while a goal is active.
 */

const MORNING_ID = 'compass-morning';
const NIGHT_ID = 'compass-night';
const CHANNEL_ID = 'compass';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function parseHhMm(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute };
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function syncCompassReminders(args: {
  morningTime: string;
  nightTime: string;
  hasActiveGoal: boolean;
}): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(MORNING_ID);
    await Notifications.cancelScheduledNotificationAsync(NIGHT_ID);

    if (!args.hasActiveGoal) return;
    if (!(await ensurePermission())) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Compass check-ins',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const morning = parseHhMm(args.morningTime);
    await Notifications.scheduleNotificationAsync({
      identifier: MORNING_ID,
      content: {
        title: 'Compass',
        body: "Pit wall is up. What's the plan today?",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        channelId: CHANNEL_ID,
        hour: morning.hour,
        minute: morning.minute,
      },
    });

    const night = parseHhMm(args.nightTime);
    await Notifications.scheduleNotificationAsync({
      identifier: NIGHT_ID,
      content: {
        title: 'Compass',
        body: 'How did today actually run?',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        channelId: CHANNEL_ID,
        hour: night.hour,
        minute: night.minute,
      },
    });
  } catch (err) {
    // Reminders are best-effort; never block a check-in or setup on them.
    console.warn('[Compass] Could not sync reminders:', err);
  }
}
