import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchWeekEvents, createEvent, updateEvent, deleteEvent } from '@/lib/calendar';
import { fetchCompletedEvents, saveEventCompletion, fetchUserStreak, updateUserStreak, type StreakInfo } from '@/lib/completedEvents';
import { format, startOfWeek, isToday, parseISO } from 'date-fns';
import { logger } from '@/lib/logger';
import { safeValidate, StreakSchema, GoogleEventSchema } from '@/lib/validation';

export interface IntrospectionStreak {
  current: number;
  max: number;
}

interface FluxContextType {
  events: any[];
  eventStatus: Record<string, boolean>;
  streakInfo: StreakInfo;
  wellbeingLogs: any[];
  introspectionStreak: IntrospectionStreak;
  isReflectionCompletedToday: boolean;
  loading: boolean;
  calendarError: string | null;
  isGoogleConnected: boolean;
  refreshData: () => Promise<void>;
  toggleEventCompletion: (id: string) => Promise<void>;
  addCalendarEvent: (summary: string, start: Date, end: Date) => Promise<void>;
  updateCalendarEvent: (id: string, updates: { summary?: string; startTime?: Date; endTime?: Date }) => Promise<void>;
  deleteCalendarEvent: (id: string) => Promise<void>;
  saveWellbeingReflection: (score: number, notes: string) => Promise<boolean>;
}

const FluxContext = createContext<FluxContextType | undefined>(undefined);

const ACADEMIC_COURSES = [
  'Soft Skills',
  'Gestión de Recursos Humanos II',
  'Comercio exterior',
  'Formulación y Evaluación de Proyectos',
  'Plan de Negocio Sostenible',
  'Prospectiva y Gestión Estrategica'
];

/**
 * Global helper to process, deduplicate and filter calendar events.
 */
export function processAndDeduplicateEvents(rawEvents: any[]): any[] {
  const uniqueMap: Record<string, any> = {};

  rawEvents.forEach(event => {
    const startStr = event.start?.dateTime || event.start?.date || '';
    const summary = (event.summary || '').trim();
    // Unique key combines start time and lowercase summary
    const key = `${startStr}-${summary.toLowerCase()}`;

    if (!uniqueMap[key]) {
      uniqueMap[key] = event;
    } else {
      // Prioritize the event containing a location
      const currentHasLoc = !!event.location && event.location.trim() !== "";
      const existingHasLoc = !!uniqueMap[key].location && uniqueMap[key].location.trim() !== "";
      if (currentHasLoc && !existingHasLoc) {
        uniqueMap[key] = event;
      }
    }
  });

  return Object.values(uniqueMap).filter((event: any) => {
    const summary = (event.summary || '').trim();
    const isAcademic = ACADEMIC_COURSES.some(course => course.toLowerCase() === summary.toLowerCase());

    if (isAcademic) {
      // Keep only academic classes that have an assigned location (room)
      return !!event.location && event.location.trim() !== "";
    }
    // Independent activities (Gym, Baby fútbol, spontaneous events) are always kept
    return true;
  });
}

/**
 * Helper to calculate introspection streaks from logs.
 */
function calculateIntrospectionStreak(logs: any[]): IntrospectionStreak {
  if (!logs || logs.length === 0) return { current: 0, max: 0 };

  const loggedDates = new Set(
    logs
      .filter(l => l.notas && l.notas.trim() !== '')
      .map(l => l.semana)
  );

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

  const hasToday = loggedDates.has(todayStr);
  const hasYesterday = loggedDates.has(yesterdayStr);

  if (!hasToday && !hasYesterday) {
    return { current: 0, max: calculateMaxStreak(loggedDates) };
  }

  let currentStreak = 0;
  const checkDate = hasToday ? new Date() : yesterday;

  while (true) {
    const dateStr = format(checkDate, 'yyyy-MM-dd');
    if (loggedDates.has(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    current: currentStreak,
    max: Math.max(currentStreak, calculateMaxStreak(loggedDates))
  };
}

function calculateMaxStreak(dates: Set<string>): number {
  if (dates.size === 0) return 0;
  const sorted = Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  let maxStreak = 0;
  let currentStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sorted) {
    const currDate = new Date(dateStr + 'T12:00:00');
    if (!prevDate) {
      currentStreak = 1;
    } else {
      const diffMs = currDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else if (diffDays > 1) {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 1;
      }
    }
    prevDate = currDate;
  }

  return Math.max(maxStreak, currentStreak);
}

export const FluxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rawEvents, setRawEvents] = useState<any[]>([]);
  const [eventStatus, setEventStatus] = useState<Record<string, boolean>>({});
  const [streakInfo, setStreakInfo] = useState<StreakInfo>({
    current_streak: 0,
    max_racha_historica: 0,
    last_completed_date: null
  });
  const [wellbeingLogs, setWellbeingLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);

  // Apply academic filtration and deduplication globally
  const events = useMemo(() => {
    return processAndDeduplicateEvents(rawEvents);
  }, [rawEvents]);

  // Today's events
  const todayEvents = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return events.filter(e => {
      const dateStr = format(parseISO(e.start.dateTime || e.start.date), 'yyyy-MM-dd');
      return dateStr === todayStr;
    });
  }, [events]);

  // Calculate introspection streak
  const introspectionStreak = useMemo(() => {
    return calculateIntrospectionStreak(wellbeingLogs);
  }, [wellbeingLogs]);

  // Check if reflection is completed today
  const isReflectionCompletedToday = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayLog = wellbeingLogs.find(l => l.semana === todayStr);
    return !!(todayLog && todayLog.notas && todayLog.notas.trim() !== '');
  }, [wellbeingLogs]);

  // Refresh all state globally
  const refreshData = async () => {
    setLoading(true);
    setCalendarError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setLoading(false);
        return;
      }

      // 0. Consultar el estado de conexión de Google OAuth desde profiles
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('google_refresh_token')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (profileErr) {
        logger.warn('FluxContext', 'Error al cargar perfil para verificar Google Calendar:', profileErr);
      }
      setIsGoogleConnected(!!profile?.google_refresh_token);

      // 1. Fetch event statuses (Completions)
      const statusMap = await fetchCompletedEvents();
      setEventStatus(statusMap);

      // 2. Fetch calendar events
      let sortedEvents: any[] = [];
      try {
        const data = await fetchWeekEvents();
        sortedEvents = data.sort((a: any, b: any) => {
          const timeA = a.start.dateTime || a.start.date;
          const timeB = b.start.dateTime || b.start.date;
          return new Date(timeA).getTime() - new Date(timeB).getTime();
        });
        setRawEvents(sortedEvents);
      } catch (calErr: any) {
        logger.error('FluxContext', 'Calendar load error', calErr);
        setCalendarError(calErr.message);
      }

      // 3. Fetch wellbeing logs (last 60 days to ensure good trend and streak tracking)
      const { data: logs, error: logsErr } = await supabase
        .from('wellbeing_logs')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('semana', { ascending: true });

      if (logsErr) {
        logger.error('FluxContext', 'Error loading wellbeing logs', logsErr);
      } else if (logs) {
        setWellbeingLogs(logs);
      }

      // 4. Update and fetch athletic streaks
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayEvts = sortedEvents.filter((e: any) => {
        const dateStr = format(parseISO(e.start.dateTime || e.start.date), 'yyyy-MM-dd');
        return dateStr === todayStr;
      });

      const updatedStreak = await updateUserStreak(todayEvts, statusMap);
      // Validate streak object using Zod wrapper
      const validatedStreak = safeValidate(
        StreakSchema,
        updatedStreak,
        { current_streak: 0, max_racha_historica: 0, last_completed_date: null },
        'FluxContext_Streak'
      );
      setStreakInfo(validatedStreak);

    } catch (err) {
      logger.error('FluxContext', 'Unexpected error refreshing global data', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync on mount
  useEffect(() => {
    refreshData();
  }, []);

  // Completion Checklist control
  const toggleEventCompletion = async (id: string) => {
    const currentStatus = !!eventStatus[id];
    const newStatus = !currentStatus;

    // Apply immediate local state update
    const updatedStatus = { ...eventStatus, [id]: newStatus };
    setEventStatus(updatedStatus);

    // Persist to Supabase and LocalStorage
    await saveEventCompletion(id, newStatus);

    // Recalculate and update athletic streak instantly
    const updatedStreak = await updateUserStreak(todayEvents, updatedStatus);
    const validatedStreak = safeValidate(
      StreakSchema,
      updatedStreak,
      { current_streak: 0, max_racha_historica: 0, last_completed_date: null },
      'FluxContext_StreakSync'
    );
    setStreakInfo(validatedStreak);
  };

  // Create event
  const addCalendarEvent = async (summary: string, start: Date, end: Date) => {
    setLoading(true);
    try {
      await createEvent(summary, start, end);
      await refreshData();
    } catch (err) {
      logger.error('FluxContext', 'Error creating calendar event', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Update event
  const updateCalendarEvent = async (id: string, updates: { summary?: string; startTime?: Date; endTime?: Date }) => {
    setLoading(true);
    try {
      await updateEvent(id, updates);
      await refreshData();
    } catch (err) {
      logger.error('FluxContext', 'Error updating calendar event', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Delete event
  const deleteCalendarEvent = async (id: string) => {
    setLoading(true);
    try {
      await deleteEvent(id);
      await refreshData();
    } catch (err) {
      logger.error('FluxContext', 'Error deleting calendar event', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Save wellbeing reflection notes
  const saveWellbeingReflection = async (score: number, notes: string): Promise<boolean> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return false;

      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Look if log already exists to merge notes
      const existingLog = wellbeingLogs.find(l => l.semana === today);
      const existingNotes = existingLog?.notas || '';
      
      const newNotes = existingNotes && notes.trim()
        ? `${existingNotes}\n---\n${notes.trim()}`
        : notes.trim() || existingNotes;

      const payload = {
        user_id: userData.user.id,
        semana: today,
        mental_score: score,
        notas: newNotes
      };

      const { error } = await supabase
        .from('wellbeing_logs')
        .upsert(payload, { onConflict: 'user_id,semana' });

      if (error) {
        logger.error('FluxContext', 'Error saving wellbeing log to Supabase', error);
        return false;
      }

      logger.info('FluxContext', `Wellbeing reflection log saved for ${today}`);

      // Refresh data to update state and trigger memo values
      await refreshData();
      return true;
    } catch (err) {
      logger.error('FluxContext', 'Unexpected error saving reflection', err);
      return false;
    }
  };

  return (
    <FluxContext.Provider
      value={{
        events,
        eventStatus,
        streakInfo,
        wellbeingLogs,
        introspectionStreak,
        isReflectionCompletedToday,
        loading,
        calendarError,
        isGoogleConnected,
        refreshData,
        toggleEventCompletion,
        addCalendarEvent,
        updateCalendarEvent,
        deleteCalendarEvent,
        saveWellbeingReflection
      }}
    >
      {children}
    </FluxContext.Provider>
  );
};

export const useFlux = () => {
  const context = useContext(FluxContext);
  if (!context) {
    throw new Error('useFlux must be used within a FluxProvider');
  }
  return context;
};
