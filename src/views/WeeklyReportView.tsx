import React, { useEffect, useState, useMemo } from 'react';
import { fetchWeekEvents } from '@/lib/calendar';
import { supabase } from '@/lib/supabase';
import { TrendingUp, Calendar, CheckCircle2, Brain, Flame, Trophy, BarChart3 } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAppContext } from '@/context/AppContext';

export function WeeklyReportView() {
  const { recesoUniversitario } = useAppContext();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wellbeingData, setWellbeingData] = useState<any[]>([]);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    setLoading(true);
    try {
      // Load events
      const data = await fetchWeekEvents();
      const uniqueEventsMap = data.reduce((acc: any, event: any) => {
        const timeKey = event.start.dateTime || event.start.date;
        if (!acc[timeKey] || (event.location && !acc[timeKey].location)) {
          acc[timeKey] = event;
        }
        return acc;
      }, {});
      setEvents(Object.values(uniqueEventsMap) as any[]);

      // Load wellbeing logs
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const wsStr = format(weekStart, 'yyyy-MM-dd');
        const weStr = format(weekEnd, 'yyyy-MM-dd');
        const { data: logs } = await supabase
          .from('wellbeing_logs')
          .select('*')
          .eq('user_id', userData.user.id)
          .gte('semana', wsStr)
          .lte('semana', weStr)
          .order('semana', { ascending: true });
        
        if (logs) setWellbeingData(logs);
      }
    } catch (err) {
      console.error('Report load error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filter events for this week only
  const weekEvents = useMemo(() => {
    let filtered = events.filter(e => {
      const d = parseISO(e.start.dateTime || e.start.date);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    });

    if (recesoUniversitario) {
      filtered = filtered.filter((e: any) => {
        const locationEmpty = !e.location || e.location.trim() === '';
        const summary = (e.summary || '').toLowerCase();
        const hasAcademicKeyword = /clase|taller|laboratorio|cátedra|catedra|ayudantía|ayudantia|prueba|certamen|examen|universidad/i.test(summary);
        return !(locationEmpty || hasAcademicKeyword);
      });
    }

    return filtered;
  }, [events, recesoUniversitario]);

  // Group by day
  const eventsByDay = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    weekDays.forEach(d => {
      grouped[format(d, 'yyyy-MM-dd')] = [];
    });
    weekEvents.forEach(e => {
      const dateStr = format(parseISO(e.start.dateTime || e.start.date), 'yyyy-MM-dd');
      if (grouped[dateStr]) grouped[dateStr].push(e);
    });
    return grouped;
  }, [weekEvents]);

  // Completed events
  const eventStatus: Record<string, boolean> = useMemo(() => {
    const saved = localStorage.getItem('flux_event_status');
    return saved ? JSON.parse(saved) : {};
  }, []);

  const totalCompleted = useMemo(() => {
    return weekEvents.filter(e => eventStatus[e.id]).length;
  }, [weekEvents, eventStatus]);

  const completionRate = weekEvents.length > 0 
    ? Math.round((totalCompleted / weekEvents.length) * 100) 
    : 0;

  // Sport streaks
  const sportStats = useMemo(() => {
    let gym = 0, baby = 0;
    weekEvents.forEach(e => {
      if (!eventStatus[e.id]) return;
      const s = e.summary?.toLowerCase() || '';
      if (s.includes('gym')) gym++;
      if (s.includes('baby')) baby++;
    });
    return { gym, baby };
  }, [weekEvents, eventStatus]);

  // Average mental score
  const avgMentalScore = useMemo(() => {
    if (wellbeingData.length === 0) return null;
    const sum = wellbeingData.reduce((acc, l) => acc + l.mental_score, 0);
    return (sum / wellbeingData.length).toFixed(1);
  }, [wellbeingData]);

  // Chart data
  const chartData = useMemo(() => {
    return weekDays.map(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayEvents = eventsByDay[dateStr] || [];
      const completed = dayEvents.filter(e => eventStatus[e.id]).length;
      const log = wellbeingData.find(l => l.semana === dateStr);
      return {
        day: format(d, 'EEE', { locale: es }),
        Eventos: dayEvents.length,
        Completados: completed,
        Bienestar: log?.mental_score || null,
      };
    });
  }, [eventsByDay, wellbeingData, eventStatus]);

  // Busiest day
  const busiestDay = useMemo(() => {
    let max = 0;
    let dayName = '';
    Object.entries(eventsByDay).forEach(([dateStr, evts]) => {
      if (evts.length > max) {
        max = evts.length;
        dayName = format(parseISO(dateStr), 'EEEE', { locale: es });
      }
    });
    return { day: dayName, count: max };
  }, [eventsByDay]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-flux-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-surface-900 dark:text-surface-50 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-flux-500" />
          Reporte Semanal
        </h1>
        <p className="text-surface-500 dark:text-surface-400 mt-1">
          Semana del {format(weekStart, "d 'de' MMMM", { locale: es })} al {format(weekEnd, "d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm text-center">
          <Calendar className="w-6 h-6 text-flux-500 mx-auto mb-2" />
          <p className="text-3xl font-display font-bold text-surface-900 dark:text-surface-50">{weekEvents.length}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Eventos Totales</p>
        </div>
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm text-center">
          <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
          <p className="text-3xl font-display font-bold text-green-600 dark:text-green-400">{completionRate}%</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Tasa de Cumplimiento</p>
        </div>
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm text-center">
          <Brain className="w-6 h-6 text-purple-500 mx-auto mb-2" />
          <p className="text-3xl font-display font-bold text-purple-600 dark:text-purple-400">{avgMentalScore ?? '—'}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Bienestar Promedio</p>
        </div>
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm text-center">
          <BarChart3 className="w-6 h-6 text-orange-500 mx-auto mb-2" />
          <p className="text-3xl font-display font-bold text-surface-900 dark:text-surface-50 capitalize">{busiestDay.day || '—'}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">Día más ocupado ({busiestDay.count})</p>
        </div>
      </div>

      {/* Weekly Chart */}
      <div className="bg-white dark:bg-surface-950 p-6 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-surface-900 dark:text-surface-50">Actividad por Día</h2>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorEventos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCompletados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', background: 'rgba(15, 23, 42, 0.9)', color: 'white', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="Eventos" stroke="#14b8a6" strokeWidth={2} fillOpacity={1} fill="url(#colorEventos)" />
              <Area type="monotone" dataKey="Completados" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorCompletados)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Day-by-Day Breakdown */}
      <div className="bg-white dark:bg-surface-950 p-6 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
        <h2 className="text-lg font-semibold mb-5 text-surface-900 dark:text-surface-50">Desglose por Día</h2>
        <div className="space-y-3">
          {weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayEvts = eventsByDay[dateStr] || [];
            const completed = dayEvts.filter(e => eventStatus[e.id]).length;
            const pct = dayEvts.length > 0 ? Math.round((completed / dayEvts.length) * 100) : 0;

            return (
              <div key={dateStr} className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-900/50 transition-colors">
                <div className="w-16 text-center">
                  <p className="text-xs text-surface-500 capitalize">{format(day, 'EEE', { locale: es })}</p>
                  <p className="text-sm font-bold text-surface-900 dark:text-surface-50">{format(day, 'd')}</p>
                </div>
                <div className="flex-1">
                  <div className="h-3 bg-surface-100 dark:bg-surface-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-flux-500' : 'bg-surface-200 dark:bg-surface-700'}`}
                      style={{ width: dayEvts.length > 0 ? `${pct}%` : '0%' }}
                    ></div>
                  </div>
                </div>
                <div className="w-20 text-right">
                  <span className="text-sm font-medium text-surface-600 dark:text-surface-400">
                    {completed}/{dayEvts.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sport Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/10 p-5 rounded-2xl border border-orange-200 dark:border-orange-800/50">
          <div className="flex items-center gap-3 mb-3">
            <Flame className="w-6 h-6 text-orange-500" />
            <h3 className="font-semibold text-surface-900 dark:text-surface-50">Baby Fútbol</h3>
          </div>
          <p className="text-4xl font-display font-bold text-orange-600 dark:text-orange-400">{sportStats.baby}</p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">partidos completados esta semana</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/10 p-5 rounded-2xl border border-blue-200 dark:border-blue-800/50">
          <div className="flex items-center gap-3 mb-3">
            <Trophy className="w-6 h-6 text-blue-500" />
            <h3 className="font-semibold text-surface-900 dark:text-surface-50">Gym</h3>
          </div>
          <p className="text-4xl font-display font-bold text-blue-600 dark:text-blue-400">{sportStats.gym}</p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">sesiones completadas esta semana</p>
        </div>
      </div>

      {/* Motivational Footer */}
      <div className="bg-gradient-to-r from-surface-800 to-surface-950 dark:from-surface-900 dark:to-black text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-flux-500 rounded-full blur-[80px] opacity-20"></div>
        <p className="text-lg font-semibold relative z-10">
          {completionRate >= 80 ? '🔥 ¡Semana increíble! Tu constancia es admirable.' :
           completionRate >= 50 ? '💪 Buen progreso. Cada paso cuenta.' :
           completionRate > 0 ? '🌱 Vas bien. La clave es no detenerse.' :
           '🚀 Empieza a completar tus eventos para ver tu progreso aquí.'}
        </p>
        <p className="text-surface-400 text-sm mt-2 relative z-10">
          "La disciplina es el puente entre metas y logros."
        </p>
      </div>
    </div>
  );
}
