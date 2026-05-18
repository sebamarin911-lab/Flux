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

// Schedule morning brief
let morningTimeout: ReturnType<typeof setTimeout> | null = null;

export function scheduleMorningBrief() {
  if (morningTimeout) clearTimeout(morningTimeout);

  const now = new Date();
  const reminderTime = new Date();
  reminderTime.setHours(7, 30, 0, 0); // 07:30 AM

  if (now > reminderTime) {
    // Already past 7:30 AM, schedule for tomorrow
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  const msUntilReminder = reminderTime.getTime() - now.getTime();

  morningTimeout = setTimeout(async () => {
    try {
      const { fetchWeekEvents } = await import('./calendar');
      const { getMorningBrief } = await import('./gemini');
      const { startOfDay, addDays } = await import('date-fns');

      let todayEvents: any[] = [];
      try {
        const events = await fetchWeekEvents();
        const today = startOfDay(new Date());
        const tomorrow = startOfDay(addDays(new Date(), 1));
        todayEvents = events.filter((e: any) => {
          const d = new Date(e.start.dateTime || e.start.date);
          return d >= today && d < tomorrow;
        });
      } catch (e) {
        console.warn('Could not fetch events for AI summary', e);
      }

      // Hash prompt will be calculated inside callGemini
      const summary = await getMorningBrief({
        events: todayEvents.map(e => e.summary),
        streak: Number(localStorage.getItem('flux_streak') || 0),
        last_mood: Number(localStorage.getItem('flux_last_mood') || 3)
      });

      sendNotification('🌞 Buenos días', {
        body: summary.notification,
        tag: 'morning-brief',
        data: { url: '/dashboard' }
      });
    } catch (err) {
      console.error('Error triggering AI morning brief:', err);
      // Fallback
      sendNotification('🌞 Buenos días', {
        body: 'Comienza tu día revisando tu agenda en Flux.',
        tag: 'morning-brief',
        data: { url: '/dashboard' }
      });
    }

    // Reschedule for tomorrow
    scheduleMorningBrief();
  }, msUntilReminder);
}
