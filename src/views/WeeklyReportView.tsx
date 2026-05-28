import React, { useMemo } from 'react';
import { TrendingUp, Calendar, CheckCircle2, Brain, Flame, Trophy, BarChart3 } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useFlux } from '@/context/FluxContext';

export function WeeklyReportView() {
  const {
    events,
    eventStatus,
    wellbeingLogs,
    loading
  } = useFlux();

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Filter events for this week only
  const weekEvents = useMemo(() => {
    return events.filter(e => {
      const d = parseISO(e.start.dateTime || e.start.date);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    });
  }, [events, weekStart, weekEnd]);

  // Filter wellbeing logs for this week only
  const wellbeingData = useMemo(() => {
    const wsStr = format(weekStart, 'yyyy-MM-dd');
    const weStr = format(weekEnd, 'yyyy-MM-dd');
    return wellbeingLogs.filter(log => log.semana >= wsStr && log.semana <= weStr);
  }, [wellbeingLogs, weekStart, weekEnd]);

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
  }, [weekEvents, weekDays]);

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
      const completed = dayEvents.filter((e: any) => eventStatus[e.id]).length;
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
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-flux-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 h-full pb-10">
      {/* Header */}
      <div className="border-b border-surface-150/15 dark:border-surface-800/15 pb-5">
        <h1 className="text-3xl md:text-4xl font-display font-extrabold text-surface-900 dark:text-white flex items-center gap-3.5 tracking-tight">
          <TrendingUp className="w-8 h-8 text-flux-500 animate-pulse-glow rounded-full" />
          Reporte Semanal
        </h1>
        <p className="text-xs font-semibold text-surface-450 mt-1 uppercase tracking-wider">
          Semana del {format(weekStart, "d 'de' MMMM", { locale: es })} al {format(weekEnd, "d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Eventos Totales */}
        <div className="glass-card p-5 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 text-center relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute top-0 right-0 w-16 h-16 bg-flux-500/5 dark:bg-flux-500/10 rounded-full blur-xl pointer-events-none"></div>
          <Calendar className="w-6 h-6 text-flux-500 mx-auto mb-2.5 transition-transform duration-300 group-hover:scale-110" />
          <p className="text-3xl font-display font-extrabold text-surface-900 dark:text-white tracking-tight">{weekEvents.length}</p>
          <p className="text-[10px] font-bold text-surface-450 uppercase tracking-widest mt-1">Eventos Totales</p>
        </div>

        {/* Card 2: Tasa de Cumplimiento */}
        <div className="glass-card p-5 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 text-center relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2.5 transition-transform duration-300 group-hover:scale-110" />
          <p className="text-3xl font-display font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">{completionRate}%</p>
          <p className="text-[10px] font-bold text-surface-450 uppercase tracking-widest mt-1">Cumplimiento</p>
        </div>

        {/* Card 3: Bienestar Promedio */}
        <div className="glass-card p-5 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 text-center relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-xl pointer-events-none"></div>
          <Brain className="w-6 h-6 text-purple-500 mx-auto mb-2.5 transition-transform duration-300 group-hover:scale-110" />
          <p className="text-3xl font-display font-extrabold text-purple-650 dark:text-purple-400 tracking-tight">{avgMentalScore ?? '—'}</p>
          <p className="text-[10px] font-bold text-surface-450 uppercase tracking-widest mt-1">Bienestar Promedio</p>
        </div>

        {/* Card 4: Día más Ocupado */}
        <div className="glass-card p-5 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 text-center relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/5 dark:bg-orange-500/10 rounded-full blur-xl pointer-events-none"></div>
          <BarChart3 className="w-6 h-6 text-orange-500 mx-auto mb-2.5 transition-transform duration-300 group-hover:scale-110" />
          <p className="text-2xl font-display font-extrabold text-surface-900 dark:text-white tracking-tight capitalize truncate mt-1">{busiestDay.day || '—'}</p>
          <p className="text-[10px] font-bold text-surface-450 uppercase tracking-widest mt-1">Ocupado ({busiestDay.count})</p>
        </div>
      </div>

      {/* Weekly Chart */}
      <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-teal-500/5 rounded-full blur-[70px] pointer-events-none" />
        
        <h2 className="text-lg font-bold mb-6 text-surface-900 dark:text-white flex items-center gap-2">
          <span className="animate-float">📈</span> Actividad y Cumplimiento
        </h2>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorEventos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCompletados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.08)" />
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 'bold' }}
              />
              <Tooltip 
                contentStyle={{
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(16px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(140%)',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)',
                }}
                itemStyle={{ color: '#f1f5f9', fontWeight: 'bold' }}
                labelStyle={{ color: '#94a3b8', fontWeight: 'extrabold', marginBottom: '6px' }}
              />
              <Area type="monotone" dataKey="Eventos" stroke="#14b8a6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorEventos)" activeDot={{ r: 6, strokeWidth: 0, fill: '#14b8a6' }} />
              <Area type="monotone" dataKey="Completados" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCompletados)" activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Day-by-Day Breakdown */}
        <div className="lg:col-span-3">
          <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm h-full">
            <h2 className="text-lg font-bold mb-5 text-surface-900 dark:text-white flex items-center gap-2">
              <span>📊</span> Desglose por Día
            </h2>
            <div className="space-y-4">
              {weekDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayEvts = eventsByDay[dateStr] || [];
                const completed = dayEvts.filter(e => eventStatus[e.id]).length;
                const pct = dayEvts.length > 0 ? Math.round((completed / dayEvts.length) * 100) : 0;

                return (
                  <div key={dateStr} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-surface-50/50 dark:hover:bg-white/5 transition-all duration-300 border border-transparent hover:border-surface-150/10 dark:hover:border-white/5">
                    <div className="w-16 text-center flex-shrink-0">
                      <p className="text-[10px] font-bold text-surface-450 dark:text-surface-400 uppercase tracking-wider">{format(day, 'EEE', { locale: es })}</p>
                      <p className="text-base font-extrabold text-surface-900 dark:text-white">{format(day, 'd')}</p>
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-surface-100 dark:bg-surface-800/60 rounded-full overflow-hidden relative shadow-inner">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 relative ${
                            pct === 100 
                              ? 'bg-gradient-to-r from-emerald-500 to-green-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                              : pct > 0 
                                ? 'bg-gradient-to-r from-flux-500 to-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.3)]' 
                                : 'bg-surface-200 dark:bg-surface-850'
                          }`}
                          style={{ width: dayEvts.length > 0 ? `${pct}%` : '0%' }}
                        />
                      </div>
                    </div>
                    <div className="w-20 text-right flex-shrink-0">
                      <span className="text-sm font-extrabold text-surface-700 dark:text-surface-300">
                        {completed} <span className="text-xs text-surface-400 font-semibold">/ {dayEvts.length}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sport Activity & Motivational Footer */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sports activity card block */}
          <div className="grid grid-cols-1 gap-6">
            {/* Baby Futbol */}
            <div className="glass-card bg-gradient-to-br from-orange-500/5 via-orange-500/10 to-amber-500/5 dark:from-orange-950/10 dark:via-orange-950/15 dark:to-amber-950/5 p-6 rounded-3xl border border-orange-500/25 dark:border-orange-500/15 relative overflow-hidden group hover:scale-[1.01] transition-all duration-300 shadow-sm">
              <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-[40px] pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center border border-orange-500/20">
                  <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
                </div>
                <h3 className="font-extrabold text-surface-900 dark:text-white tracking-tight">Baby Fútbol</h3>
              </div>
              <p className="text-5xl font-display font-black text-orange-600 dark:text-orange-400 tracking-tight">{sportStats.baby}</p>
              <p className="text-xs font-bold text-surface-450 dark:text-surface-400 uppercase tracking-widest mt-2">Partidos Completados</p>
            </div>

            {/* Gym */}
            <div className="glass-card bg-gradient-to-br from-blue-500/5 via-blue-500/10 to-indigo-500/5 dark:from-blue-950/10 dark:via-blue-950/15 dark:to-indigo-950/5 p-6 rounded-3xl border border-blue-500/25 dark:border-blue-500/15 relative overflow-hidden group hover:scale-[1.01] transition-all duration-300 shadow-sm">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-[40px] pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center border border-blue-500/20">
                  <Trophy className="w-5 h-5 text-blue-500 animate-bounce" />
                </div>
                <h3 className="font-extrabold text-surface-900 dark:text-white tracking-tight">Gym</h3>
              </div>
              <p className="text-5xl font-display font-black text-blue-600 dark:text-blue-400 tracking-tight">{sportStats.gym}</p>
              <p className="text-xs font-bold text-surface-450 dark:text-surface-400 uppercase tracking-widest mt-2">Sesiones Completadas</p>
            </div>
          </div>

          {/* Motivational Footer */}
          <div className="bg-gradient-to-r from-surface-900 via-surface-950 to-black text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden border border-white/5">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-flux-500 rounded-full blur-[80px] opacity-25 animate-pulse-slow"></div>
            <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-purple-500 rounded-full blur-[60px] opacity-15"></div>
            <p className="text-base md:text-lg font-extrabold relative z-10 tracking-tight leading-snug">
              {completionRate >= 80 ? '🔥 ¡Semana increíble! Tu constancia es admirable.' :
               completionRate >= 50 ? '💪 Buen progreso. Cada paso cuenta.' :
               completionRate > 0 ? '🌱 Vas bien. La clave es no detenerse.' :
               '🚀 Empieza a completar tus eventos para ver tu progreso aquí.'}
            </p>
            <p className="text-surface-400 text-xs italic mt-3.5 relative z-10 pl-3.5 border-l-2 border-flux-400">
              "La disciplina es el puente entre metas y logros."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
