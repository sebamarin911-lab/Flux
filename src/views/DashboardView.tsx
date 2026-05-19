import React, { useEffect, useState, useMemo } from 'react';
import { fetchWeekEvents, updateEvent, deleteEvent } from '@/lib/calendar';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Activity, Flame, Trophy, ArrowRight, Clock, MapPin, Zap, Brain, TrendingUp, Sun, Moon, AlertCircle, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { format, parseISO, isToday, isBefore, startOfWeek, differenceInMinutes, addMinutes, startOfMinute } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAppContext } from '@/context/AppContext';

export function DashboardView() {
  const { recesoUniversitario } = useAppContext();
  const navigate = useNavigate();
  const [rawEvents, setRawEvents] = useState<any[]>([]);

  const events = useMemo(() => {
    if (!recesoUniversitario) return rawEvents;
    return rawEvents.filter((e: any) => {
      const locationEmpty = !e.location || e.location.trim() === '';
      const summary = (e.summary || '').toLowerCase();
      const hasAcademicKeyword = /clase|taller|laboratorio|cátedra|catedra|ayudantía|ayudantia|prueba|certamen|examen|universidad/i.test(summary);
      return !(locationEmpty || hasAcademicKeyword);
    });
  }, [rawEvents, recesoUniversitario]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [todayMentalScore, setTodayMentalScore] = useState<number | null>(null);
  const [weeklyLogCount, setWeeklyLogCount] = useState(0);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    setCalendarError(null);
    try {
      // Load user
      const { data: userData } = await supabase.auth.getUser();
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

      // Load events
      try {
        const data = await fetchWeekEvents();
        const uniqueEventsMap = data.reduce((acc: any, event: any) => {
          const timeKey = (event.start.dateTime || event.start.date) + (event.summary || '');
          if (!acc[timeKey] || (event.location && !acc[timeKey].location)) {
            acc[timeKey] = event;
          }
          return acc;
        }, {});

        const sortedEvents = Object.values(uniqueEventsMap).sort((a: any, b: any) => {
          const timeA = (a as any).start.dateTime || (a as any).start.date;
          const timeB = (b as any).start.dateTime || (b as any).start.date;
          return new Date(timeA).getTime() - new Date(timeB).getTime();
        });

        setRawEvents(sortedEvents as any[]);
      } catch (calErr: any) {
        console.error('Calendar load error:', calErr);
        setCalendarError(calErr.message);
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este evento?')) return;
    try {
      const eventToDelete = events.find(e => e.id === id);
      await deleteEvent(id);
      loadDashboard();
      
      if (eventToDelete) {
        import('@/lib/gemini').then(({ getRescheduleSuggestion }) => {
          getRescheduleSuggestion({ 
            current: eventToDelete.summary, 
            history: [] // Mock history for now
          }).then(suggestion => {
            if (suggestion && confirm(`[IA] ¿Quieres reagendar "${eventToDelete.summary}" a las ${suggestion.suggested_time}? Razón: ${suggestion.reason}`)) {
              // Simply open Agenda for now as requested by user constraints to not build complex new UI flows
              navigate('/agenda');
            }
          });
        });
      }
    } catch (err) {
      alert('Error al eliminar el evento');
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

  const toggleEventComplete = (id: string) => {
    const saved = localStorage.getItem('flux_event_status');
    const eventStatus: Record<string, boolean> = saved ? JSON.parse(saved) : {};
    eventStatus[id] = !eventStatus[id];
    localStorage.setItem('flux_event_status', JSON.stringify(eventStatus));
    // Trigger re-render by reloading dashboard or local state
    loadDashboard();
  };

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Buenos días', icon: Sun, emoji: '☀️' };
    if (hour < 19) return { text: 'Buenas tardes', icon: Sun, emoji: '🌤️' };
    return { text: 'Buenas noches', icon: Moon, emoji: '🌙' };
  }, []);

  // Today's events
  const todayEvents = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return events.filter(e => {
      const dateStr = format(parseISO(e.start.dateTime || e.start.date), 'yyyy-MM-dd');
      return dateStr === todayStr;
    });
  }, [events]);

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

  // Completed events from localStorage
  const completedStreaks = useMemo(() => {
    const saved = localStorage.getItem('flux_event_status');
    const eventStatus: Record<string, boolean> = saved ? JSON.parse(saved) : {};
    
    let gym = 0;
    let baby = 0;

    events.forEach(event => {
      if (!eventStatus[event.id]) return;
      const summary = event.summary?.toLowerCase() || '';
      if (summary.includes('gym')) gym++;
      if (summary.includes('baby')) baby++;
    });

    return { gym, baby };
  }, [events]);

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
    const saved = localStorage.getItem('flux_event_status');
    const eventStatus: Record<string, boolean> = saved ? JSON.parse(saved) : {};
    return todayEvents.filter(e => eventStatus[e.id]).length;
  }, [todayEvents]);

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
            onClick={() => {
              localStorage.removeItem('google_provider_token');
              supabase.auth.signOut().then(() => navigate('/'));
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Reconectar
          </button>
        </div>
      )}

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Next Event Card */}
        <div className="col-span-2 bg-gradient-to-br from-flux-500 to-flux-600 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div className="relative z-10">
            <p className="text-flux-100 text-xs font-medium uppercase tracking-wider mb-2">Próximo Evento</p>
            {nextEvent ? (
              <>
                <h3 className="text-xl font-bold mb-1 truncate">{nextEvent.summary}</h3>
                <div className="flex items-center gap-3 text-flux-100 text-sm">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {nextEvent.start.dateTime 
                      ? format(parseISO(nextEvent.start.dateTime), 'HH:mm')
                      : 'Todo el día'
                    }
                  </span>
                  {nextEvent.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5" />
                      {nextEvent.location}
                    </span>
                  )}
                </div>
                {timeUntilNext && (
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-medium">
                    <Zap className="w-3.5 h-3.5" /> En {timeUntilNext}
                  </div>
                )}
              </>
            ) : (
              <p className="text-flux-100 text-sm">No hay eventos próximos. ¡Disfruta tu tiempo libre!</p>
            )}
          </div>
        </div>

        {/* Today Progress */}
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
          <p className="text-surface-500 dark:text-surface-400 text-xs font-medium uppercase tracking-wider mb-2">Hoy</p>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-display font-bold text-surface-900 dark:text-surface-50">{todayCompletedCount}</span>
            <span className="text-surface-400 text-sm mb-1">/ {todayEvents.length}</span>
          </div>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Eventos completados</p>
          {todayEvents.length > 0 && (
            <div className="mt-3 h-2 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-flux-400 to-flux-500 rounded-full transition-all duration-500"
                style={{ width: `${(todayCompletedCount / todayEvents.length) * 100}%` }}
              ></div>
            </div>
          )}
        </div>

        {/* Mental State */}
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
          <p className="text-surface-500 dark:text-surface-400 text-xs font-medium uppercase tracking-wider mb-2">Estado Mental</p>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{mentalEmoji(todayMentalScore)}</span>
            <div>
              {todayMentalScore !== null ? (
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                  {todayMentalScore <= 1 ? 'Agotado' : todayMentalScore <= 2 ? 'Normal' : todayMentalScore <= 4 ? 'En Paz' : 'Con Energía'}
                </p>
              ) : (
                <Link to="/wellbeing" className="text-sm font-medium text-flux-600 dark:text-flux-400 hover:underline">
                  Registrar →
                </Link>
              )}
            </div>
          </div>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-2">
            {weeklyLogCount > 0 ? `${weeklyLogCount} registro${weeklyLogCount > 1 ? 's' : ''} esta semana` : 'Sin registros esta semana'}
          </p>
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
                
                const saved = localStorage.getItem('flux_event_status');
                const eventStatus: Record<string, boolean> = saved ? JSON.parse(saved) : {};
                const isCompleted = eventStatus[event.id];

                return (
                  <div 
                    key={event.id}
                    className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all group ${
                      isNow 
                        ? 'border-flux-500/50 bg-flux-50/50 dark:bg-flux-900/20 shadow-sm' 
                        : 'border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-900/50'
                    } ${isCompleted ? 'opacity-60 bg-surface-50/50 grayscale-[0.5]' : ''}`}
                  >
                    <div className={`w-1 self-stretch rounded-full ${isNow ? 'bg-flux-500 animate-pulse' : isCompleted ? 'bg-green-500' : 'bg-surface-200 dark:bg-surface-700'}`}></div>
                    <div className="flex-shrink-0 text-center min-w-[3rem]">
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
                      <p className={`font-medium truncate ${isNow ? 'text-flux-700 dark:text-flux-300' : 'text-surface-900 dark:text-surface-100'} ${isCompleted ? 'line-through text-surface-400' : ''}`}>
                        {event.summary}
                      </p>
                      {event.location && (
                        <p className="text-xs text-surface-500 dark:text-surface-400 flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="w-3 h-3" /> {event.location}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity">
                      <button 
                        onClick={() => toggleEventComplete(event.id)}
                        className={`p-2 rounded-lg transition-colors ${isCompleted ? 'text-green-600 bg-green-50 dark:bg-green-900/30' : 'text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}`}
                        title="Completar"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleEditEvent(event)}
                        className="p-2 text-surface-400 hover:text-flux-600 hover:bg-flux-50 dark:hover:bg-flux-900/30 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isNow && !isCompleted && (
                      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider bg-flux-500 text-white px-2 py-1 rounded-md">
                        Ahora
                      </span>
                    )}
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

        {/* Right Column - Streaks + Quick Actions */}
        <div className="space-y-5">
          {/* Streaks Mini */}
          <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-4 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" /> Mis Rachas
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                    <Flame className="w-4 h-4 text-orange-500" />
                  </div>
                  <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Baby Fútbol</span>
                </div>
                <span className="text-lg font-bold text-orange-600 dark:text-orange-400">{completedStreaks.baby}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                    <Trophy className="w-4 h-4 text-blue-500" />
                  </div>
                  <span className="text-sm font-medium text-surface-700 dark:text-surface-300">Gym</span>
                </div>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{completedStreaks.gym}</span>
              </div>
            </div>
          </div>

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
    </div>
  );
}
