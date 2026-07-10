export const CLOUD_LIMITS = {
  fiveHourWindowMs: 5 * 60 * 60 * 1000,
  weeklyWindowMs: 7 * 24 * 60 * 60 * 1000,
  fiveHourMessageCap: 60,
  weeklyMessageCap: 300,
} as const;

export interface CloudUsageWindow {
  used: number;
  cap: number;
  remaining: number;
  resetsAt: string | null;
}

export interface CloudUsageState {
  fiveHour: CloudUsageWindow;
  weekly: CloudUsageWindow;
}
