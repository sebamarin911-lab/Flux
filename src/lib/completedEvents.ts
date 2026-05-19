import { supabase } from './supabase';
import { logger } from './logger';

export interface StreakInfo {
  current_streak: number;
  max_racha_historica: number;
  last_completed_date: string | null;
}

export async function fetchCompletedEvents(): Promise<Record<string, boolean>> {
  const localSaved = localStorage.getItem('flux_event_status');
  const localStatus: Record<string, boolean> = localSaved ? JSON.parse(localSaved) : {};

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return localStatus;

    const { data, error } = await supabase
      .from('completed_events')
      .select('event_id, completed')
      .eq('user_id', user.id);

    if (error) {
      if (error.code === '42P01') {
        logger.warn('CompletedEvents', 'Table completed_events does not exist yet. Using localStorage fallback.');
      } else {
        logger.error('CompletedEvents', 'Error fetching completed events from Supabase', error);
      }
      return localStatus;
    }

    const dbStatus: Record<string, boolean> = {};
    data?.forEach(row => {
      dbStatus[row.event_id] = row.completed;
    });

    const merged = { ...localStatus, ...dbStatus };
    return merged;
  } catch (err) {
    logger.warn('CompletedEvents', 'Failed to load completed events from database, falling back to local storage', err);
    return localStatus;
  }
}

export async function saveEventCompletion(eventId: string, completed: boolean): Promise<void> {
  const localSaved = localStorage.getItem('flux_event_status');
  const localStatus: Record<string, boolean> = localSaved ? JSON.parse(localSaved) : {};
  localStatus[eventId] = completed;
  localStorage.setItem('flux_event_status', JSON.stringify(localStatus));

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('completed_events')
      .upsert({
        user_id: user.id,
        event_id: eventId,
        completed: completed,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,event_id'
      });

    if (error) {
      if (error.code === '42P01') {
        logger.warn('CompletedEvents', 'Table completed_events does not exist yet. LocalStorage updated.');
      } else {
        logger.error('CompletedEvents', 'Error saving completed event status to Supabase', error);
      }
    } else {
      logger.info('CompletedEvents', `Event ${eventId} completion status synced to Supabase: ${completed}`);
    }
  } catch (err) {
    logger.warn('CompletedEvents', 'Failed to save completed event to database', err);
  }
}

/**
 * Loads the user's streak information from the DB with a built-in self-healing check.
 * If the last completed date is older than yesterday, the active streak is broken and reset to 0.
 */
export async function fetchUserStreak(): Promise<StreakInfo> {
  const localStreak = localStorage.getItem('flux_user_streak');
  const fallback: StreakInfo = localStreak 
    ? JSON.parse(localStreak) 
    : { current_streak: 0, max_racha_historica: 0, last_completed_date: null };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fallback;

    const { data, error } = await supabase
      .from('streaks')
      .select('current_streak, max_racha_historica, last_completed_date')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      logger.error('CompletedEvents', 'Error fetching user streak from Supabase', error);
      return fallback;
    }

    if (!data) {
      return fallback;
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA');

    let currentStreak = data.current_streak || 0;
    const lastCompleted = data.last_completed_date;

    if (lastCompleted) {
      if (lastCompleted !== todayStr && lastCompleted !== yesterdayStr) {
        currentStreak = 0; // Streak broken!
      }
    } else {
      currentStreak = 0;
    }

    const result: StreakInfo = {
      current_streak: currentStreak,
      max_racha_historica: data.max_racha_historica || 0,
      last_completed_date: lastCompleted
    };

    localStorage.setItem('flux_user_streak', JSON.stringify(result));
    return result;
  } catch (err) {
    logger.error('CompletedEvents', 'Unexpected error fetching user streak', err);
    return fallback;
  }
}

/**
 * Updates the user's streak based on today's events completion status.
 */
export async function updateUserStreak(todayEvents: any[], eventStatus: Record<string, boolean>): Promise<StreakInfo> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { current_streak: 0, max_racha_historica: 0, last_completed_date: null };
    }

    const currentStreakInfo = await fetchUserStreak();

    // Determine if today's requirements are completed:
    // Case A: there are events today, and all of them are completed
    const allCompleted = todayEvents.length > 0 && todayEvents.every(e => eventStatus[e.id]);
    // Case B: at least one critical activity (#Gym, #BabyFutbol, gym, baby futbol) is completed
    const criticalCompleted = todayEvents.some(
      e => eventStatus[e.id] && /#gym|#babyfutbol|gym|baby futbol/i.test(e.summary || '')
    );

    const isTodayCompleted = allCompleted || criticalCompleted;

    const todayStr = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA');

    let { current_streak, max_racha_historica, last_completed_date } = currentStreakInfo;

    if (isTodayCompleted) {
      if (last_completed_date === todayStr) {
        // Already completed today
      } else if (last_completed_date === yesterdayStr) {
        current_streak += 1;
        last_completed_date = todayStr;
      } else {
        current_streak = 1;
        last_completed_date = todayStr;
      }
    } else {
      // Revert if they unchecked the task that made today completed
      if (last_completed_date === todayStr) {
        current_streak = Math.max(0, current_streak - 1);
        last_completed_date = yesterdayStr;
      }
    }

    max_racha_historica = Math.max(current_streak, max_racha_historica);

    const result: StreakInfo = {
      current_streak,
      max_racha_historica,
      last_completed_date
    };

    localStorage.setItem('flux_user_streak', JSON.stringify(result));

    const { error } = await supabase
      .from('streaks')
      .upsert({
        user_id: user.id,
        current_streak,
        max_racha_historica,
        last_completed_date,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      logger.error('CompletedEvents', 'Error saving user streak to Supabase', error);
    } else {
      logger.info('CompletedEvents', `User streak successfully synced to Supabase: ${current_streak}`);
    }

    return result;
  } catch (err) {
    logger.error('CompletedEvents', 'Unexpected error updating user streak', err);
    return { current_streak: 0, max_racha_historica: 0, last_completed_date: null };
  }
}
