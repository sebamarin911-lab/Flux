import { supabase } from './supabase';
import { logger } from './logger';

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
      // 42P01 is the PostgreSQL error code for "relation does not exist"
      if (error.code === '42P01') {
        logger.warn('CompletedEvents', 'Table completed_events does not exist yet. Using localStorage fallback.');
      } else {
        logger.error('CompletedEvents', 'Error fetching completed events from Supabase', error);
      }
      return localStatus;
    }

    // Merge database status
    const dbStatus: Record<string, boolean> = {};
    data?.forEach(row => {
      dbStatus[row.event_id] = row.completed;
    });

    // Merge local storage for robust backward compatibility and offline capabilities
    const merged = { ...localStatus, ...dbStatus };
    return merged;
  } catch (err) {
    logger.warn('CompletedEvents', 'Failed to load completed events from database, falling back to local storage', err);
    return localStatus;
  }
}

export async function saveEventCompletion(eventId: string, completed: boolean): Promise<void> {
  // Always update local storage first for instant response and offline capability
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
