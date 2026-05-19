import { supabase } from './supabase';
import { startOfDay, endOfDay, addDays } from 'date-fns';
import { logger } from './logger';
import { GoogleEventSchema } from './validation';

/**
 * Attempt to refresh the Google OAuth access token using our secure Edge Function.
 * Returns the new token or null if the refresh failed.
 */
async function refreshGoogleToken(): Promise<string | null> {
  logger.info('Calendar', 'Refreshing Google OAuth token via Edge Function...');
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      logger.error('Calendar', 'No active session found during token refresh', sessionError);
      return null;
    }

    const sessionToken = sessionData.session.access_token;

    const { data, error } = await supabase.functions.invoke('refresh-google-token', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (error) {
      logger.error('Calendar', 'Failed to invoke refresh-google-token Edge Function', error);
      return null;
    }

    const newToken = data?.access_token;
    if (newToken) {
      localStorage.setItem('google_provider_token', newToken);
      logger.info('Calendar', 'Google OAuth token refreshed successfully via Edge Function');
      return newToken;
    } else {
      logger.warn('Calendar', 'Edge Function returned no access token');
      return null;
    }
  } catch (err) {
    logger.error('Calendar', 'Unexpected error refreshing Google token via Edge Function', err);
    return null;
  }
}

/**
 * Saves the Google refresh token securely to the user_tokens table.
 */
export async function saveGoogleRefreshToken(refreshToken: string) {
  logger.info('Calendar', 'Saving Google refresh token to DB...');
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.error('Calendar', 'Cannot save refresh token: no authenticated user');
      return;
    }

    const { error } = await supabase
      .from('user_tokens')
      .upsert({
        user_id: user.id,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      logger.error('Calendar', 'Error saving Google refresh token to Supabase user_tokens table:', error);
    } else {
      logger.info('Calendar', 'Google refresh token saved to database successfully');
    }
  } catch (err) {
    logger.error('Calendar', 'Unexpected error saving Google refresh token', err);
  }
}

export async function fetchWeekEvents() {
  logger.info('Calendar', 'Fetching calendar events for the active week...');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    logger.error('Calendar', 'No active session found during event fetch');
    throw new Error('No active session');
  }

  let providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
    logger.warn('Calendar', 'Google provider token missing from localStorage, attempting silent token recovery...');
    try {
      const recoveredToken = await refreshGoogleToken();
      if (recoveredToken) {
        providerToken = recoveredToken;
      } else {
        throw new Error('Google provider token missing and silent recovery failed.');
      }
    } catch (err) {
      logger.error('Calendar', 'Failed during silent recovery of Google provider token', err);
      throw new Error('Please sign in with Google again to connect your Calendar.');
    }
  }

  const today = new Date();
  const fetchStart = startOfDay(addDays(today, -14));
  const fetchEnd = endOfDay(addDays(today, 30));

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.append('timeMin', fetchStart.toISOString());
  url.searchParams.append('timeMax', fetchEnd.toISOString());
  url.searchParams.append('singleEvents', 'true');
  url.searchParams.append('orderBy', 'startTime');

  let response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${providerToken}` },
  });

  // If 401 (token expired), attempt a silent refresh and retry once
  if (response.status === 401) {
    logger.warn('Calendar', 'Token expired (401), attempting silent OAuth refresh...');
    const newToken = await refreshGoogleToken();
    if (!newToken) {
      logger.error('Calendar', 'Token refresh failed or did not return a valid Google provider token');
      throw new Error('Google Calendar token expired. Please sign in again.');
    }
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${newToken}` },
    });
  }

  if (!response.ok) {
    logger.error('Calendar', `Google Calendar API returned error status: ${response.status}`);
    throw new Error('Failed to fetch events from Google Calendar');
  }

  const data = await response.json();
  const items = data.items || [];
  
  // Validate array of items using Zod schema to prevent unexpected frontend crashes
  const validatedItems: any[] = [];
  let formatDeviations = 0;

  for (const item of items) {
    const parseResult = GoogleEventSchema.safeParse(item);
    if (parseResult.success) {
      validatedItems.push(parseResult.data);
    } else {
      formatDeviations++;
      logger.debug('Calendar', `Event item ${item?.id || 'unknown'} omitted due to validation mismatch`, parseResult.error);
      // fallback if missing small details, but we keep core components
      if (item && item.id) {
        validatedItems.push({
          id: item.id,
          summary: item.summary || 'Sin Título',
          start: { dateTime: item.start?.dateTime || item.start?.date },
          end: { dateTime: item.end?.dateTime || item.end?.date },
          location: item.location
        });
      }
    }
  }

  if (formatDeviations > 0) {
    logger.warn('Calendar', `Successfully handled ${formatDeviations} calendar events with minor format deviations.`);
  }

  logger.info('Calendar', `Loaded ${validatedItems.length} valid events successfully`);
  return validatedItems;
}

export async function createEvent(summary: string, startTime: Date, endTime: Date) {
  logger.info('Calendar', `Creating new event: "${summary}"...`);
  const providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
    logger.error('Calendar', 'Google provider token missing during event creation');
    throw new Error('Please sign in with Google again to connect your Calendar.');
  }

  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const event = {
    summary,
    start: {
      dateTime: startTime.toISOString(),
    },
    end: {
      dateTime: endTime.toISOString(),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${providerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    logger.error('Calendar', `Google API event creation failed with status: ${response.status}`);
    throw new Error('Failed to create event in Google Calendar');
  }

  const result = await response.json();
  logger.info('Calendar', `Event created successfully: ${result.id}`);
  return result;
}

export async function updateEvent(eventId: string, updates: { summary?: string, startTime?: Date, endTime?: Date }) {
  logger.info('Calendar', `Updating event: ${eventId}...`, updates);
  const providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
    logger.error('Calendar', 'Google provider token missing during event update');
    throw new Error('Please sign in with Google again to connect your Calendar.');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
  
  const event: any = {};
  if (updates.summary) event.summary = updates.summary;
  if (updates.startTime) event.start = { dateTime: updates.startTime.toISOString() };
  if (updates.endTime) event.end = { dateTime: updates.endTime.toISOString() };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${providerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const errorData = await response.json();
    logger.error('Calendar', `Google API event update failed:`, errorData);
    throw new Error('Failed to update event in Google Calendar');
  }

  const result = await response.json();
  logger.info('Calendar', `Event updated successfully: ${result.id}`);
  return result;
}

export async function deleteEvent(eventId: string) {
  logger.info('Calendar', `Deleting event: ${eventId}...`);
  const providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
    logger.error('Calendar', 'Google provider token missing during event deletion');
    throw new Error('Please sign in with Google again to connect your Calendar.');
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${providerToken}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    logger.error('Calendar', `Google API event deletion failed with status: ${response.status}`);
    throw new Error('Failed to delete event from Google Calendar');
  }

  logger.info('Calendar', `Event ${eventId} deleted successfully`);
  return true;
}
