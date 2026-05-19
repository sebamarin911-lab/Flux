// Push Notifications utility for Flux PWA (Mocked / Disabled)

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export function getNotificationStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  return 'unsupported';
}

export async function sendNotification(title: string, options?: NotificationOptions) {
  // No-op - notifications are completely disabled
}

export function startEventNotificationScheduler(getEvents: () => any[]) {
  return () => {};
}

export function stopEventNotificationScheduler() {
  // No-op - scheduler disabled
}

export function scheduleMorningBrief() {
  // No-op - morning brief disabled
}
