// Push Notifications utility for Flux PWA

const NOTIFICATION_CHECK_INTERVAL = 60_000; // Check every minute

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function getNotificationStatus(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function sendNotification(title: string, options?: NotificationOptions) {
  if (Notification.permission !== 'granted') return;
  
  const notification = new Notification(title, {
    icon: '/flux-icon.png',
    badge: '/flux-icon.png',
    ...options,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  return notification;
}

// Notification scheduler that checks for upcoming events
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const notifiedEvents = new Set<string>();

export function startEventNotificationScheduler(getEvents: () => any[]) {
  if (schedulerInterval) clearInterval(schedulerInterval);

  schedulerInterval = setInterval(() => {
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const events = getEvents();

    events.forEach((event: any) => {
      const startStr = event.start?.dateTime;
      if (!startStr) return; // Skip all-day events

      const eventStart = new Date(startStr);
      const diffMs = eventStart.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / 60_000);

      // Notify 15 minutes before
      if (diffMins > 0 && diffMins <= 15 && !notifiedEvents.has(`15-${event.id}`)) {
        notifiedEvents.add(`15-${event.id}`);
        sendNotification(`⏰ ${event.summary}`, {
          body: `Comienza en ${diffMins} minutos${event.location ? ` — ${event.location}` : ''}`,
          tag: `event-15-${event.id}`,
        });
      }

      // Notify when event starts
      if (diffMins >= -1 && diffMins <= 0 && !notifiedEvents.has(`start-${event.id}`)) {
        notifiedEvents.add(`start-${event.id}`);
        sendNotification(`🟢 ${event.summary}`, {
          body: `¡Empieza ahora!${event.location ? ` — ${event.location}` : ''}`,
          tag: `event-start-${event.id}`,
        });
      }
    });
  }, NOTIFICATION_CHECK_INTERVAL);

  return () => {
    if (schedulerInterval) clearInterval(schedulerInterval);
  };
}

export function stopEventNotificationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

// Schedule nightly reminder for mental download
let nightlyTimeout: ReturnType<typeof setTimeout> | null = null;

export function scheduleNightlyReminder() {
  if (nightlyTimeout) clearTimeout(nightlyTimeout);

  const now = new Date();
  const reminderTime = new Date();
  reminderTime.setHours(21, 0, 0, 0); // 9:00 PM

  if (now > reminderTime) {
    // Already past 9 PM, schedule for tomorrow
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  const msUntilReminder = reminderTime.getTime() - now.getTime();

  nightlyTimeout = setTimeout(() => {
    sendNotification('🧠 Descarga Mental', {
      body: 'Tómate unos minutos para reflexionar sobre tu día y descargar lo que tienes en mente.',
      tag: 'nightly-reminder',
    });

    // Reschedule for tomorrow
    scheduleNightlyReminder();
  }, msUntilReminder);
}
