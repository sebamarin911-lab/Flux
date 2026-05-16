import { supabase } from './supabase';

import { startOfDay, endOfDay, addDays } from 'date-fns';

export async function fetchWeekEvents() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw new Error('No active session');
  }

  const providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
    throw new Error('Please sign in with Google again to connect your Calendar.');
  }

  const today = new Date();
  
  // Fetch a larger window: 14 days back to 30 days forward to populate the mini calendar
  const fetchStart = startOfDay(addDays(today, -14));
  const fetchEnd = endOfDay(addDays(today, 30));

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.append('timeMin', fetchStart.toISOString());
  url.searchParams.append('timeMax', fetchEnd.toISOString());
  url.searchParams.append('singleEvents', 'true');
  url.searchParams.append('orderBy', 'startTime');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${providerToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch events from Google Calendar');
  }

  const data = await response.json();
  return data.items || [];
}

export async function createEvent(summary: string, startTime: Date, endTime: Date) {
  const providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
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
    throw new Error('Failed to create event in Google Calendar');
  }

  return await response.json();
}

export async function updateEvent(eventId: string, updates: { summary?: string, startTime?: Date, endTime?: Date }) {
  const providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
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
    console.error('Google Calendar Update Error:', errorData);
    throw new Error('Failed to update event in Google Calendar');
  }

  return await response.json();
}

export async function deleteEvent(eventId: string) {
  const providerToken = localStorage.getItem('google_provider_token');
  if (!providerToken) {
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
    throw new Error('Failed to delete event from Google Calendar');
  }

  return true;
}
