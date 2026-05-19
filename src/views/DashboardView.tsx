import React, { useEffect, useState, useMemo } from 'react';
import { fetchWeekEvents, updateEvent, deleteEvent } from '@/lib/calendar';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Activity, Flame, Trophy, ArrowRight, Clock, MapPin, Zap, Brain, TrendingUp, Sun, Moon, AlertCircle, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { format, parseISO, isToday, isBefore, startOfWeek, differenceInMinutes, addMinutes, startOfMinute } from 'date-fns';
import { es } from 'date-fns/locale';
import { fetchCompletedEvents, saveEventCompletion, fetchUserStreak, updateUserStreak } from '@/lib/completedEvents';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { logger } from '@/lib/logger';
import { requestNotificationPermission, scheduleMorningBrief, startEventNotificationScheduler, sendNotification } from '@/lib/notifications';

export function DashboardView() {
  const navigate = useNavigate();
  const [rawEvents, setRawEvents] = useState<any[]>([]);

  const events = rawEvents;

  // Today's events
  const todayEvents = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return events.filter(e => {
      const dateStr = format(parseISO(e.start.dateTime || e.start.date), 'yyyy-MM-dd');
      return dateStr === todayStr;
    });
  }, [events]);

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [todayMentalScore, setTodayMentalScore] = useState<number | null>(null);
  const [weeklyLogCount, setWeeklyLogCount] = useState(0);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<Record<string, boolean>>({});

  const [streakInfo, setStreakInfo] = useState<{
    current_streak: number;
    max_racha_historica: number;
    last_completed_date: string | null;
  }>({ current_streak: 0, max_racha_historica: 0, last_completed_date: null });

  // Confirmation Dialog States
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    eventId: string;
    summary: string;
  }>({
    isOpen: false,
    eventId: '',
    summary: ''
  });

  const [rescheduleDialog, setRescheduleDialog] = useState<{
    isOpen: boolean;
    eventId: string;
    summary: string;
    suggestedTime: string;
    reason: string;
    eventToDelete: any;
  }>({
    isOpen: false,
    eventId: '',
    summary: '',
    suggestedTime: '',
    reason: '',
    eventToDelete: null
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setCalendarError(null);
    try {
      // Load user
      const { data: userData } = await supabase.auth.getUser();
      let statusMap: Record<string, boolean> = {};
      if (userData.user) {
        const name = userData.user.user_metadata?.full_name || userData.user.email?.split('@')[0] || '';
        setUserName(name.split(' ')[0]); // First name only
        
        // Load today's wellbeing
        const today = format(new Date(), 'yyyy-MM-dd');
        const { data: todayLog } = await supabase
          .from('wellbeing_logs')
          .select('mental_score')
          .eq('user_id', userData.user.id)
          .eq('semana', today)
          .maybeSingle();
        
        if (todayLog) setTodayMentalScore(todayLog.mental_score);

        // Load weekly log count
        const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const { data: weekLogs } = await supabase
          .from('wellbeing_logs')
          .select('id')
          .eq('user_id', userData.user.id)
          .gte('semana', weekStart);
        
        if (weekLogs) setWeeklyLogCount(weekLogs.length);
      }

      // Load completed events from DB / localStorage
      statusMap = await fetchCompletedEvents();
      setEventStatus(statusMap);

      // Load events
      let sortedEvents: any[] = [];
      try {
        const data = await fetchWeekEvents();
        const uniqueEventsMap = data.reduce((acc: any, event: any) => {
          const timeKey = (event.start.dateTime || event.start.date) + (event.summary || '');
          if (!acc[timeKey] || (event.location && !acc[timeKey].location)) {
            acc[timeKey] = event;
          }
          return acc;
        }, {});

        sortedEvents = Object.values(uniqueEventsMap).sort((a: any, b: any) => {
          const timeA = (a as any).start.dateTime || (a as any).start.date;
          const timeB = (b as any).start.dateTime || (b as any).start.date;
          return new Date(timeA).getTime() - new Date(timeB).getTime();
        });

        setRawEvents(sortedEvents as any[]);
      } catch (calErr: any) {
        console.error('Calendar load error:', calErr);
        setCalendarError(calErr.message);
      }

      // Sync and load user streak
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayEvts = sortedEvents.filter((e: any) => {
        const dateStr = format(parseISO(e.start.dateTime || e.start.date), 'yyyy-MM-dd');
        return dateStr === todayStr;
      });
      const updatedStreak = await updateUserStreak(todayEvts, statusMap);
      setStreakInfo(updatedStreak);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteEventClick = (id: string) => {
    const eventToDelete = events.find(e => e.id === id);
    if (!eventToDelete) return;
    setDeleteDialog({
      isOpen: true,
      eventId: id,
      summary: eventToDelete.summary
    });
  };

  const handleCancelDelete = () => {
    setDeleteDialog({ isOpen: false, eventId: '', summary: '' });
  };

  const handleConfirmDelete = async () => {
    const id = deleteDialog.eventId;
    const eventToDelete = events.find(e => e.id === id);
    setDeleteDialog({ isOpen: false, eventId: '', summary: '' });
    if (!eventToDelete) return;

    setLoading(true);
    try {
      let rescheduled = false;

      // 1. Intentar obtener la sugerencia de la IA
      try {
        const { getRescheduleSuggestion } = await import('@/lib/gemini');
        const suggestion = await getRescheduleSuggestion({ 
          current: eventToDelete.summary, 
          history: []
        });

        if (suggestion && suggestion.suggested_time) {
          setRescheduleDialog({
            isOpen: true,
            eventId: id,
            summary: eventToDelete.summary,
            suggestedTime: suggestion.suggested_time,
            reason: suggestion.reason,
            eventToDelete
          });
          return; // Retornamos temprano, el modal de reprogramación manejará el resto
        }
      } catch (geminiErr) {
        console.warn('No se pudo obtener sugerencia de la IA, eliminando de forma clásica:', geminiErr);
      }

      // 2. Si no hay sugerencia de la IA, se elimina definitivamente
      await deleteEvent(id);
      loadDashboard();
    } catch (err) {
      alert('Error al eliminar el evento');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReschedule = async () => {
    const { eventId, summary, suggestedTime, eventToDelete } = rescheduleDialog;
    setRescheduleDialog(prev => ({ ...prev, isOpen: false }));
    setLoading(true);
    try {
      const baseDate = parseISO(eventToDelete.start.dateTime || eventToDelete.start.date);
      const [hours, mins] = suggestedTime.split(':').map(Number);
      const newStart = startOfMinute(baseDate);
      newStart.setHours(hours, mins);
      
      const duration = eventToDelete.end?.dateTime 
        ? differenceInMinutes(parseISO(eventToDelete.end.dateTime), parseISO(eventToDelete.start.dateTime))
        : 60;
      
      const newEnd = addMinutes(newStart, duration);

      await updateEvent(eventId, {
        summary: summary,
        startTime: newStart,
        endTime: newEnd
      });
      loadDashboard();
    } catch (err) {
      alert('Error al reprogramar el evento');
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineReschedule = async () => {
    const { eventId } = rescheduleDialog;
    setRescheduleDialog(prev => ({ ...prev, isOpen: false }));
    setLoading(true);
    try {
      // El usuario rechaza la postergación y prefiere eliminar definitivamente
      await deleteEvent(eventId);
      loadDashboard();
    } catch (err) {
      alert('Error al eliminar el evento');
    } finally {
      setLoading(false);
    }
  };

  const handleEditEvent = async (event: any) => {
    const newTitle = prompt('Nuevo título:', event.summary);
    const newTime = prompt('Nueva hora (HH:mm):', format(parseISO(event.start.dateTime || event.start.date), 'HH:mm'));
    
    if (newTitle === null || newTime === null) return;

    try {
      const baseDate = parseISO(event.start.dateTime || event.start.date);
      const [hours, mins] = newTime.split(':').map(Number);
      const newStart = startOfMinute(baseDate);
      newStart.setHours(hours, mins);
      
      const duration = event.end?.dateTime 
        ? differenceInMinutes(parseISO(event.end.dateTime), parseISO(event.start.dateTime))
        : 60;
      
      const newEnd = addMinutes(newStart, duration);

      await updateEvent(event.id, {
        summary: newTitle,
        startTime: newStart,
        endTime: newEnd
      });
      loadDashboard();
    } catch (err) {
      alert('Error al actualizar el evento. Asegúrate del formato HH:mm');
    }
  };

  const toggleEventComplete = async (id: string) => {
    const currentStatus = !!eventStatus[id];
    const newStatus = !currentStatus;
    
    // UI instantánea
    const updatedStatus = { ...eventStatus, [id]: newStatus };
    setEventStatus(updatedStatus);
    
    // DB & LocalStorage
    await saveEventCompletion(id, newStatus);

    // Actualizar racha deportista de forma instantánea
    const updatedStreak = await updateUserStreak(todayEvents, updatedStatus);
    setStreakInfo(updatedStreak);
    
    // Recargar métricas del dashboard
    loadDashboard();
  };

  // Racha Deportiva en Peligro: pasadas las 20:00, hay eventos hoy y están pendientes o falta actividad crítica
  const isStreakInDanger = useMemo(() => {
    const isPast20 = new Date().getHours() >= 20;
    if (todayEvents.length === 0) return false;

    const hasPendingEvents = !todayEvents.every(e => eventStatus[e.id]);
    const hasPendingCritical = todayEvents.some(
      e => !eventStatus[e.id] && /#gym|#babyfutbol|gym|baby futbol/i.test(e.summary || '')
    );

    return isPast20 && (hasPendingEvents || hasPendingCritical);
  }, [todayEvents, eventStatus]);

  // Alerta proactiva de notificación push local cuando la racha está en peligro
  useEffect(() => {
    if (isStreakInDanger) {
      const todayKey = new Date().toLocaleDateString('en-CA');
      const notified = localStorage.getItem('flux_streak_danger_notified');
      if (notified !== todayKey) {
        requestNotificationPermission().then(granted => {
          if (granted) {
            sendNotification('🔥 ¡Racha en Peligro!', {
              body: 'Son pasadas las 20:00 y tienes actividades deportivas o de agenda pendientes. ¡Compleméntalas hoy para mantener tu racha!',
              tag: 'streak-danger',
              requireInteraction: true
            });
            localStorage.setItem('flux_streak_danger_notified', todayKey);
          }
        });
      }
    }
  }, [isStreakInDanger]);

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Buenos días', icon: Sun, emoji: '☀️' };
    if (hour < 19) return { text: 'Buenas tardes', icon: Sun, emoji: '🌤️' };
    return { text: 'Buenas noches', icon: Moon, emoji: '🌙' };
  }, []);

  // Next upcoming event (from now forward)
  const nextEvent = useMemo(() => {
    const now = new Date();
    return events.find(e => {
      const eventStart = new Date(e.start.dateTime || e.start.date);
      return eventStart > now;
    });
  }, [events]);

  // Time until next event
  const timeUntilNext = useMemo(() => {
    if (!nextEvent) return null;
    const now = new Date();
    const eventStart = new Date(nextEvent.start.dateTime || nextEvent.start.date);
    const mins = differenceInMinutes(eventStart, now);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hrs < 24) return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days} día${days > 1 ? 's' : ''}`;
  }, [nextEvent]);

  // Completed events from local state
  const completedStreaks = useMemo(() => {
    let gym = 0;
    let baby = 0;

    events.forEach(event => {
      if (!eventStatus[event.id]) return;
      const summary = event.summary?.toLowerCase() || '';
      if (summary.includes('gym')) gym++;
      if (summary.includes('baby')) baby++;
    });

    return { gym, baby };
  }, [events, eventStatus]);

  // Mental score emoji
  const mentalEmoji = (score: number | null) => {
    if (score === null) return '—';
    if (score <= 1) return '😞';
    if (score <= 2) return '😐';
    if (score <= 4) return '😌';
    return '⚡';
  };

  // Today's completed count
  const todayCompletedCount = useMemo(() => {
    return todayEvents.filter(e => eventStatus[e.id]).length;
  }, [todayEvents, eventStatus]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-flux-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-surface-500 dark:text-surface-400 text-sm font-medium capitalize">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
          </p>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-surface-900 dark:text-surface-50 mt-1">
            {greeting.emoji} {greeting.text}, {userName}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link 
            to="/agenda"
            className="flex items-center gap-2 px-4 py-2 bg-flux-500 hover:bg-flux-600 text-white rounded-xl transition-colors font-medium shadow-sm text-sm"
          >
            <Calendar className="w-4 h-4" /> Ver Agenda
          </Link>
        </div>
      </div>

      {/* Calendar Error Alert */}
      {calendarError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">Conexión con Google Calendar perdida</p>
              <p className="text-xs text-red-700 dark:text-red-400">{calendarError}</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              try {
                logger.info('Auth', 'Initiating Google Calendar silent/fast reconnection...');
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: window.location.origin,
                    scopes: 'https://www.googleapis.com/auth/calendar',
                    queryParams: {
                      access_type: 'offline',
                      prompt: 'consent',
                    },
                  },
                });
              } catch (err) {
                logger.error('Auth', 'Error initiating Google reconnection', err);
                alert('No se pudo iniciar la reconexión. Inténtalo de nuevo.');
              }
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer whitespace-nowrap"
          >
            Reconectar
          </button>
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Streak Centerpiece Card (🔥) */}
        <div className={`p-5 rounded-2xl text-white relative overflow-hidden transition-all duration-500 flex flex-col justify-between ${
          isStreakInDanger 
            ? 'bg-gradient-to-br from-red-600 via-orange-500 to-red-700 animate-pulse-slow animate-glow-red border border-red-400/30' 
            : 'bg-gradient-to-br from-orange-500 via-amber-500 to-red-600 animate-glow-orange'
        }`}>
          {/* Decorative floating shapes */}
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-white/10 rounded-full blur-lg"></div>
          <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-white/5 rounded-full blur-md"></div>
          
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
                {isStreakInDanger ? '⚠️ En Peligro' : '⚡ Racha Deportiva'}
              </span>
              <Flame className={`w-6 h-6 text-white ${isStreakInDanger ? 'animate-bounce' : 'animate-pulse'}`} />
            </div>

            <div className="my-2">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight filter drop-shadow-sm">
                  {streakInfo.current_streak}
                </span>
                <span className="text-xs font-semibold opacity-90">días 🔥</span>
              </div>
              <p className="text-[10px] opacity-90 mt-1 font-medium leading-tight">
                {isStreakInDanger 
                  ? '¡Completa tus metas deportivas hoy antes de las 00:00!' 
                  : streakInfo.current_streak > 0 
                    ? '¡Tu fuego brilla con fuerza! Sigue así.' 
                    : '¡Comienza hoy completando tu primera meta!'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/25 flex items-center justify-between text-xs font-semibold">
              <span className="opacity-80">Récord Histórico:</span>
              <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full">
                <Trophy className="w-3 h-3" /> {streakInfo.max_racha_historica}
              </span>
            </div>
          </div>
        </div>

        {/* Next Event Card */}
        <div className="bg-gradient-to-br from-flux-500 to-flux-600 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div>
              <p className="text-flux-100 text-[10px] font-semibold uppercase tracking-wider mb-2">Próximo Evento</p>
              {nextEvent ? (
                <>
                  <h3 className="text-lg font-bold mb-1 truncate leading-tight">{nextEvent.summary}</h3>
                  <div className="flex flex-col gap-1 text-flux-100 text-xs mt-2">
                    <span className="flex items-center gap-1 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      {nextEvent.start.dateTime 
                        ? format(parseISO(nextEvent.start.dateTime), 'HH:mm')
                        : 'Todo el día'
                      }
                    </span>
                    {nextEvent.location && (
                      <span className="flex items-center gap-1 truncate opacity-90">
                        <MapPin className="w-3.5 h-3.5" />
                        {nextEvent.location}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-flux-100 text-xs">No hay eventos próximos. ¡Disfruta tu tiempo libre!</p>
              )}
            </div>
            {nextEvent && timeUntilNext && (
              <div className="mt-4 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-semibold w-fit">
                <Zap className="w-3.5 h-3.5" /> En {timeUntilNext}
              </div>
            )}
          </div>
        </div>

        {/* Today Progress */}
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Completado Hoy</span>
              <Trophy className="w-4 h-4 text-flux-500" />
            </div>
            <div className="flex items-baseline gap-1.5 my-2">
              <span className="text-3xl font-bold text-surface-900 dark:text-surface-50">
                {todayCompletedCount}
              </span>
              <span className="text-sm text-surface-400">/ {todayEvents.length}</span>
            </div>
          </div>
          <div>
            <div className="w-full bg-surface-100 dark:bg-surface-800 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-flux-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${todayEvents.length > 0 ? (todayCompletedCount / todayEvents.length) * 100 : 0}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-surface-400 mt-2 font-medium">
              {todayEvents.length > 0 ? `${Math.round((todayCompletedCount / todayEvents.length) * 100)}% de tareas` : 'Sin tareas para hoy'}
            </p>
          </div>
        </div>

        {/* Mental Health */}
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Estado Mental</span>
              <Activity className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex items-center gap-3 my-2">
              <span className="text-3xl">{mentalEmoji(todayMentalScore)}</span>
              <div>
                <p className="text-base font-bold text-surface-900 dark:text-surface-50">
                  {todayMentalScore !== null ? `${todayMentalScore} / 5` : 'Sin Registro'}
                </p>
                <p className="text-[9px] text-surface-400 font-medium">
                  {weeklyLogCount} registros esta semana
                </p>
              </div>
            </div>
          </div>
          <Link 
            to="/wellbeing"
            className="text-[11px] font-semibold text-flux-600 dark:text-flux-400 hover:underline flex items-center gap-0.5 mt-4 w-fit"
          >
            Registrar ahora <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 bg-white dark:bg-surface-950 p-6 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-surface-900 dark:text-surface-50">
              <Calendar className="w-5 h-5 text-flux-500" />
              Agenda de Hoy
            </h2>
            <Link to="/agenda" className="text-sm text-flux-600 dark:text-flux-400 hover:underline flex items-center gap-1">
              Ver todo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {todayEvents.length > 0 ? (
            <div className="space-y-3">
              {todayEvents.map((event: any) => {
                const start = event.start.dateTime;
                const end = event.end.dateTime;
                const isNow = start && new Date(start) <= new Date() && new Date(end) > new Date();
                const isCompleted = eventStatus[event.id] || false;

                return (
                  <div 
                    key={event.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-3.5 rounded-xl border transition-all group ${
                      isNow 
                        ? 'border-flux-500/50 bg-flux-50/50 dark:bg-flux-900/20 shadow-sm' 
                        : 'border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900/50'
                    } ${isCompleted ? 'opacity-60 bg-surface-50/50 grayscale-[0.5]' : ''}`}
                  >
                    {/* Event main section */}
                    <div className="flex items-center gap-3.5 flex-1 min-w-0 w-full">
                      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${isNow ? 'bg-flux-500 animate-pulse' : isCompleted ? 'bg-green-500' : 'bg-surface-200 dark:bg-surface-700'}`}></div>
                      <div className="flex-shrink-0 text-center min-w-[3.5rem]">
                        {start ? (
                          <>
                            <p className={`text-sm font-bold ${isNow ? 'text-flux-600 dark:text-flux-400' : 'text-surface-900 dark:text-surface-50'}`}>
                              {format(parseISO(start), 'HH:mm')}
                            </p>
                            <p className="text-[10px] text-surface-400">{format(parseISO(end), 'HH:mm')}</p>
                          </>
                        ) : (
                          <p className="text-xs text-surface-500">Todo el día</p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold truncate ${isNow ? 'text-flux-700 dark:text-flux-300' : 'text-surface-900 dark:text-surface-100'} ${isCompleted ? 'line-through text-surface-400' : ''}`}>
                            {event.summary}
                          </p>
                          {isNow && !isCompleted && (
                            <span className="flex-shrink-0 text-[9px] font-extrabold uppercase tracking-wider bg-flux-500 text-white px-1.5 py-0.5 rounded">
                              Ahora
                            </span>
                          )}
                        </div>
                        {event.location && (
                          <p className="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1 mt-0.5 truncate">
                            <MapPin className="w-3 h-3" /> {event.location}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Event action buttons */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t border-surface-100 dark:border-surface-800/40 pt-2 sm:border-0 sm:pt-0 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity">
                      <button 
                        onClick={() => toggleEventComplete(event.id)}
                        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3 sm:p-2 rounded-xl transition-colors text-xs sm:text-sm font-medium cursor-pointer ${
                          isCompleted 
                            ? 'text-green-600 bg-green-50 dark:bg-green-900/30' 
                            : 'text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 sm:bg-transparent sm:dark:bg-transparent'
                        }`}
                        title="Completar"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="sm:hidden">Completar</span>
                      </button>
                      
                      <button 
                        onClick={() => handleEditEvent(event)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3 sm:p-2 text-xs sm:text-sm font-medium text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 hover:text-flux-600 hover:bg-flux-50 dark:hover:bg-flux-900/30 rounded-xl transition-colors sm:bg-transparent sm:dark:bg-transparent cursor-pointer"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                        <span className="sm:hidden">Editar</span>
                      </button>
                      
                      <button 
                        onClick={() => handleDeleteEventClick(event.id)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3 sm:p-2 text-xs sm:text-sm font-medium text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors sm:bg-transparent sm:dark:bg-transparent cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="sm:hidden">Eliminar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10 text-surface-400">
              <Calendar className="w-10 h-10 mb-3 text-surface-300 dark:text-surface-700" />
              <p className="font-medium text-surface-500">Día libre de eventos</p>
              <p className="text-sm mt-1">Tómate un respiro o añade algo a tu agenda.</p>
            </div>
          )}
        </div>

        {/* Right Column - Quick Actions */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-4">Accesos Rápidos</h3>
            <div className="space-y-2">
              <Link 
                to="/agenda"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-900 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <Calendar className="w-4 h-4 text-flux-500" />
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Abrir Agenda</span>
                <ArrowRight className="w-3.5 h-3.5 text-surface-400 ml-auto" />
              </Link>
              <Link 
                to="/wellbeing"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-900 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <Brain className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Descarga Mental</span>
                <ArrowRight className="w-3.5 h-3.5 text-surface-400 ml-auto" />
              </Link>
              <Link 
                to="/report"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 dark:bg-surface-900 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              >
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Reporte Semanal</span>
                <ArrowRight className="w-3.5 h-3.5 text-surface-400 ml-auto" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        title="¿Eliminar evento?"
        message={
          <p>
            ¿Estás seguro de que deseas eliminar el evento <strong>"{deleteDialog.summary}"</strong>?
          </p>
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        onClose={handleCancelDelete}
      />

      <ConfirmationDialog
        isOpen={rescheduleDialog.isOpen}
        title="🤖 Sugerencia de la IA"
        isAiSuggestion={true}
        message={
          <div className="space-y-2">
            <p>
              ¿Deseas postergar <strong>"{rescheduleDialog.summary}"</strong> a las <strong>{rescheduleDialog.suggestedTime}</strong>?
            </p>
            <div className="p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-xl text-xs sm:text-sm text-purple-700 dark:text-purple-300 italic">
              💡 Razón: {rescheduleDialog.reason}
            </div>
            <p className="text-xs text-surface-400 mt-2 leading-relaxed">
              👉 Presiona <strong>"Aceptar"</strong> para postergar el evento en esa hora.
              <br />
              👉 Presiona <strong>"Eliminar"</strong> para quitarlo de forma definitiva.
            </p>
          </div>
        }
        confirmLabel="Aceptar"
        cancelLabel="Eliminar"
        confirmVariant="primary"
        onConfirm={handleConfirmReschedule}
        onCancel={handleDeclineReschedule}
        onClose={() => setRescheduleDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
