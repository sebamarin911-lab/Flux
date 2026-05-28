import React, { useEffect, useState, useMemo } from 'react';
import { Clock, MapPin, Plus, X, Calendar as CalendarIcon, Flame, Trophy, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { format, parseISO, isToday, addDays, addHours, eachDayOfInterval, startOfWeek, startOfMinute, differenceInMinutes, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { useFlux } from '@/context/FluxContext';

export function AgendaView() {
  const {
    events,
    eventStatus,
    loading: globalLoading,
    calendarError: error,
    toggleEventCompletion,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent
  } = useFlux();

  const [localLoading, setLocalLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEvent, setNewEvent] = useState({
    summary: '',
    start: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    end: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
  });
  const [creating, setCreating] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(format(new Date(), 'yyyy-MM-dd'));

  const loading = globalLoading || localLoading;

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

  // Calculate real streaks
  const streaks = useMemo(() => {
    const gymSessions = new Set();
    const babyWeeks = new Set();

    events.forEach(event => {
      if (!eventStatus[event.id]) return; // Solo contar si está completado en el checklist

      const summary = event.summary?.toLowerCase() || '';
      const date = parseISO(event.start.dateTime || event.start.date);
      const dateStr = format(date, 'yyyy-MM-dd');

      if (summary.includes('gym')) {
        gymSessions.add(dateStr);
      }
      if (summary.includes('baby')) {
        const weekStart = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        babyWeeks.add(weekStart);
      }
    });

    return {
      gym: gymSessions.size,
      baby: babyWeeks.size
    };
  }, [events, eventStatus]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.summary || !newEvent.start || !newEvent.end) return;
    setCreating(true);
    try {
      await addCalendarEvent(newEvent.summary, new Date(newEvent.start), new Date(newEvent.end));
      setShowAddForm(false);
      setNewEvent({
        summary: '',
        start: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        end: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

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

    setLocalLoading(true);
    try {
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
      await deleteCalendarEvent(id);
    } catch (err) {
      alert('Error al eliminar el evento');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleConfirmReschedule = async () => {
    const { eventId, summary, suggestedTime, eventToDelete } = rescheduleDialog;
    setRescheduleDialog(prev => ({ ...prev, isOpen: false }));
    setLocalLoading(true);
    try {
      const baseDate = parseISO(eventToDelete.start.dateTime || eventToDelete.start.date);
      const [hours, mins] = suggestedTime.split(':').map(Number);
      const newStart = startOfMinute(baseDate);
      newStart.setHours(hours, mins);
      
      const duration = eventToDelete.end?.dateTime 
        ? differenceInMinutes(parseISO(eventToDelete.end.dateTime), parseISO(eventToDelete.start.dateTime))
        : 60;
      
      const newEnd = addMinutes(newStart, duration);

      await updateCalendarEvent(eventId, {
        summary: summary,
        startTime: newStart,
        endTime: newEnd
      });
    } catch (err) {
      alert('Error al reprogramar el evento');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDeclineReschedule = async () => {
    const { eventId } = rescheduleDialog;
    setRescheduleDialog(prev => ({ ...prev, isOpen: false }));
    setLocalLoading(true);
    try {
      // El usuario rechaza la postergación y prefiere eliminar definitivamente
      await deleteCalendarEvent(eventId);
    } catch (err) {
      alert('Error al eliminar el evento');
    } finally {
      setLocalLoading(false);
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

      await updateCalendarEvent(event.id, {
        summary: newTitle,
        startTime: newStart,
        endTime: newEnd
      });
    } catch (err) {
      alert('Error al actualizar el evento. Asegúrate del formato HH:mm');
    }
  };

  const toggleEventStatus = async (eventId: string) => {
    await toggleEventCompletion(eventId);
  };

  // Group events by day
  const groupedEvents = events.reduce((acc: any, event: any) => {
    const dateStr = format(parseISO(event.start.dateTime || event.start.date), 'yyyy-MM-dd');
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(event);
    return acc;
  }, {});

  const EventCard = ({ event }: { event: any }) => {
    const start = event.start.dateTime || event.start.date;
    const end = event.end.dateTime || event.end.date;
    const isAllDay = !event.start.dateTime;
    const isCompleted = eventStatus[event.id] || false;

    return (
      <div className={`p-4 bg-white/35 dark:bg-surface-950/35 backdrop-blur-md rounded-2xl border transition-all duration-300 group relative flex flex-col ${
        isCompleted ? 'border-green-500/20 bg-green-500/5 opacity-70 shadow-none' : 'border-surface-150/10 dark:border-surface-850/15 shadow-sm hover:shadow-md'
      }`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl ${isCompleted ? 'bg-emerald-500' : 'bg-flux-500'}`}></div>
        <div className="flex items-start gap-3.5 pl-1.5">
          <button 
            onClick={() => toggleEventStatus(event.id)}
            className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-xl border flex items-center justify-center transition-all duration-200 cursor-pointer ${
              isCompleted 
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20' 
                : 'border-surface-300 dark:border-surface-700 hover:border-flux-400 dark:hover:border-flux-400 bg-surface-50 dark:bg-surface-900/50'
            }`}
          >
            {isCompleted && <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5 stroke-[3px]"><path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
              <h3 className={`font-bold tracking-tight text-[15px] ${isCompleted ? 'text-surface-400 line-through font-medium' : 'text-surface-900 dark:text-white'}`}>{event.summary}</h3>
              <span className={`text-[10px] font-bold px-3 py-1 rounded-lg w-fit whitespace-nowrap border ${
                isCompleted 
                  ? 'bg-surface-100 dark:bg-surface-800 text-surface-500 border-surface-200/50 dark:border-surface-700/50' 
                  : 'bg-flux-50 dark:bg-flux-900/30 text-flux-600 dark:text-flux-400 border-flux-500/10'
              }`}>
                {isAllDay ? 'Todo el día' : `${format(parseISO(start), 'HH:mm')} - ${format(parseISO(end), 'HH:mm')}`}
              </span>
            </div>
            {event.location && (
              <div className={`flex items-center gap-1.5 text-[11px] mt-2.5 w-fit px-2.5 py-1.5 rounded-lg border ${
                isCompleted 
                  ? 'text-surface-400 bg-surface-50/50 dark:bg-surface-900/50 border-surface-200/10' 
                  : 'text-surface-500 bg-surface-50 dark:bg-surface-900/70 border-surface-150/10 dark:border-surface-800/10'
              }`}>
                <MapPin className="w-3.5 h-3.5 text-flux-500" />
                <span className="truncate max-w-[200px] sm:max-w-xs">{event.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-3 border-t border-surface-100 dark:border-surface-850/30 flex items-center gap-2 w-full justify-between sm:justify-end flex-wrap md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-all duration-300">
          <button 
            onClick={() => toggleEventStatus(event.id)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3.5 sm:py-1.5 sm:px-3 rounded-xl transition-all duration-200 text-xs font-bold cursor-pointer ${
              isCompleted 
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/20' 
                : 'text-surface-650 dark:text-surface-300 bg-surface-100/50 dark:bg-surface-800/40 hover:bg-flux-500 hover:text-white sm:bg-transparent sm:dark:bg-transparent'
            }`}
            title="Completar"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isCompleted ? 'Completado' : 'Completar'}</span>
          </button>
          
          <button 
            onClick={() => handleEditEvent(event)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3.5 sm:py-1.5 sm:px-3 text-xs font-bold text-surface-650 dark:text-surface-300 bg-surface-100/50 dark:bg-surface-800/40 hover:text-flux-600 hover:bg-flux-500/10 rounded-xl transition-all duration-200 sm:bg-transparent sm:dark:bg-transparent cursor-pointer"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
            <span>Editar</span>
          </button>
          
          <button 
            onClick={() => handleDeleteEventClick(event.id)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3.5 sm:py-1.5 sm:px-3 text-xs font-bold text-surface-650 dark:text-surface-300 bg-surface-100/50 dark:bg-surface-800/40 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all duration-200 sm:bg-transparent sm:dark:bg-transparent cursor-pointer"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
            <span>Eliminar</span>
          </button>
        </div>
      </div>
    );
  };

  // Generate week days for scrollable calendar (14 days past, 21 days future)
  const today = new Date();
  const weekDays = eachDayOfInterval({
    start: addDays(today, -14),
    end: addDays(today, 21)
  });

  const groupedEventsToRender = { ...groupedEvents };
  if (expandedDay && !groupedEventsToRender[expandedDay]) {
    groupedEventsToRender[expandedDay] = [];
  }
  
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 h-full pb-10">
      <div className="lg:col-span-2 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-150/15 dark:border-surface-800/15 pb-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold text-surface-900 dark:text-white tracking-tight">Mi Agenda</h1>
            <p className="text-xs font-semibold text-surface-450 mt-1 capitalize tracking-wide flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-flux-500" />
              {format(today, "EEEE, d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center justify-center gap-2 px-4.5 py-2.5 bg-flux-500 hover:bg-flux-600 dark:bg-flux-500 dark:hover:bg-flux-600 text-white rounded-2xl transition-all duration-300 font-bold shadow-md shadow-flux-500/10 hover:shadow-flux-500/20 hover:-translate-y-0.5 cursor-pointer text-sm"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? 'Cancelar' : 'Añadir Evento'}
          </button>
        </div>

        {/* Scrollable Calendar Slider */}
        <div className="glass-card p-5 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 text-surface-900 dark:text-white">
              <CalendarIcon className="w-4 h-4 text-flux-500" />
              Navegar Fechas
            </h3>
          </div>
          <div 
            className="flex overflow-x-auto gap-2.5 pb-2 scrollbar-thin scrollbar-thumb-surface-200 dark:scrollbar-thumb-surface-800 scrollbar-track-transparent snap-x"
            ref={el => {
              if (el && !el.dataset.scrolled) {
                const todayEl = el.querySelector('.is-today');
                if (todayEl) {
                  todayEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
                  el.dataset.scrolled = 'true';
                }
              }
            }}
          >
            {weekDays.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const dayEvents = groupedEvents[dateStr] || [];
              const isCurrentDay = isToday(date);
              const isSelected = expandedDay === dateStr;
              
              return (
                <div 
                  key={dateStr}
                  onClick={() => setExpandedDay(dateStr)}
                  className={`flex-shrink-0 w-[3.75rem] flex flex-col items-center p-3 rounded-2xl cursor-pointer transition-all duration-300 snap-center relative border ${
                    isCurrentDay ? 'is-today' : ''
                  } ${
                    isSelected 
                      ? 'bg-gradient-to-b from-flux-500/20 to-flux-500/5 text-flux-600 dark:text-flux-400 border-flux-500 ring-2 ring-flux-500/20 shadow-md shadow-flux-500/5 scale-105' 
                      : isCurrentDay
                        ? 'bg-surface-100/50 dark:bg-surface-900/40 border-surface-300 dark:border-surface-700 hover:border-flux-400'
                        : 'bg-surface-50/20 dark:bg-surface-900/10 border-transparent hover:bg-surface-50 dark:hover:bg-surface-900/35 hover:border-surface-250 dark:hover:border-surface-800'
                  }`}
                >
                  <span className="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 capitalize">{format(date, 'eee', { locale: es })}</span>
                  <span className={`text-[15px] font-black mb-2 ${isSelected || isCurrentDay ? 'text-flux-600 dark:text-flux-400' : 'text-surface-700 dark:text-surface-300'}`}>{format(date, 'd')}</span>
                  
                  {/* Event Dots */}
                  <div className="flex gap-1.5 w-full mt-auto h-2 justify-center items-center">
                     {dayEvents.slice(0, 3).map((e: any, i: number) => (
                        <div key={i} className={`h-1.5 w-1.5 rounded-full ${eventStatus[e.id] ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' : 'bg-flux-500 shadow-sm shadow-flux-500/20'}`} title={e.summary}></div>
                     ))}
                     {dayEvents.length > 3 && (
                       <div className="text-[8px] text-center text-surface-400 font-bold">+{dayEvents.length - 3}</div>
                     )}
                  </div>

                  {/* Tiny light under today */}
                  {isCurrentDay && (
                    <span className="absolute -top-1 w-2 h-2 rounded-full bg-flux-500 animate-pulse-glow" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {showAddForm && (
          <div className="glass-card p-6 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-md animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="font-extrabold mb-5 text-lg text-surface-900 dark:text-white flex items-center gap-2">
              <span className="text-xl">📆</span> Crear Nuevo Evento
            </h3>
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-surface-450 dark:text-surface-400 uppercase tracking-wider mb-1.5">Título del Evento</label>
                <input
                  type="text"
                  required
                  value={newEvent.summary}
                  onChange={e => setNewEvent({...newEvent, summary: e.target.value})}
                  className="w-full px-4 py-3 glass-input rounded-2xl outline-none text-sm font-medium"
                  placeholder="Ej. Reunión de proyecto o #Gym"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-surface-450 dark:text-surface-400 uppercase tracking-wider mb-1.5">Hora de Inicio</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEvent.start}
                    onChange={e => setNewEvent({...newEvent, start: e.target.value})}
                    className="w-full px-4 py-3 glass-input rounded-2xl outline-none [color-scheme:light] dark:[color-scheme:dark] text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-surface-450 dark:text-surface-400 uppercase tracking-wider mb-1.5">Hora de Término</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEvent.end}
                    onChange={e => setNewEvent({...newEvent, end: e.target.value})}
                    className="w-full px-4 py-3 glass-input rounded-2xl outline-none [color-scheme:light] dark:[color-scheme:dark] text-sm font-medium"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-3 bg-flux-500 hover:bg-flux-600 dark:bg-flux-500 dark:hover:bg-flux-650 text-white font-bold rounded-2xl transition-all duration-300 shadow-md shadow-flux-500/10 hover:shadow-flux-500/25 cursor-pointer disabled:opacity-60 flex justify-center text-sm"
              >
                {creating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div> : 'Guardar en Google Calendar'}
              </button>
            </form>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-sm font-bold rounded-2xl">
            ⚠️ {error}
          </div>
        )}

        {/* Selected Day View */}
        <div className="space-y-4">
          {loading ? (
             <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-flux-500"></div></div>
          ) : expandedDay ? (
            <div className="glass-card p-6 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-surface-150/10 dark:border-surface-850/10">
                <h2 className="text-xl font-extrabold capitalize text-surface-900 dark:text-white tracking-tight flex items-center gap-2">
                  <div className="w-1.5 h-5 rounded-full bg-flux-500" />
                  {isToday(parseISO(expandedDay)) ? 'Hoy, ' : ''}
                  {format(parseISO(expandedDay), "EEEE d 'de' MMMM", { locale: es })}
                </h2>
                <span className="text-xs font-bold text-flux-650 dark:text-flux-400 bg-flux-500/10 dark:bg-flux-500/20 px-3 py-1 rounded-full border border-flux-500/10">
                  {(groupedEventsToRender[expandedDay] || []).length} Actividades
                </span>
              </div>
              
              {(groupedEventsToRender[expandedDay] || []).length > 0 ? (
                <div className="space-y-4.5">
                  {(groupedEventsToRender[expandedDay] || []).map((event: any) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-12 bg-surface-50/20 dark:bg-surface-900/5 rounded-3xl border border-surface-200 dark:border-surface-800 border-dashed">
                  <CalendarIcon className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-3.5" />
                  <p className="text-surface-500 dark:text-surface-450 font-bold">Día libre de compromisos</p>
                  <p className="text-xs text-surface-400 dark:text-surface-500 mt-1 max-w-xs leading-relaxed">Tómate un respiro, disfruta de tu tiempo o planifica actividades.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="space-y-6">
        <div className="glass-card border border-surface-150/10 dark:border-surface-800/20 rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2.5 text-surface-900 dark:text-white">
            <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
            Rachas y Estadísticas
          </h2>
          
          <div className="space-y-4.5">
            {/* Baby Futbol */}
            <div className="flex items-center justify-between p-4.5 bg-gradient-to-br from-orange-500/5 via-orange-500/10 to-amber-500/5 border border-orange-500/15 rounded-2xl shadow-[0_0_15px_rgba(249,115,22,0.02)]">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500/20 p-2.5 rounded-2xl flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-inner border border-orange-500/10">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-extrabold text-surface-800 dark:text-surface-200 text-sm tracking-tight">Baby Fútbol</p>
                  <p className="text-[11px] font-medium text-surface-450 mt-0.5">Semanas consecutivas</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-display font-black text-orange-600 dark:text-orange-450 leading-none">{streaks.baby}</p>
                <p className="text-[9px] font-bold text-orange-500/80 uppercase tracking-widest mt-1">Semanas</p>
              </div>
            </div>

            {/* Gym */}
            <div className="flex items-center justify-between p-4.5 bg-gradient-to-br from-blue-500/5 via-blue-500/10 to-indigo-500/5 border border-blue-500/15 rounded-2xl shadow-[0_0_15px_rgba(59,130,246,0.02)]">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/20 p-2.5 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner border border-blue-500/10">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-extrabold text-surface-800 dark:text-surface-200 text-sm tracking-tight">Entrenamiento Gym</p>
                  <p className="text-[11px] font-medium text-surface-450 mt-0.5">Sesiones realizadas</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-display font-black text-blue-600 dark:text-blue-450 leading-none">{streaks.gym}</p>
                <p className="text-[9px] font-bold text-blue-500/80 uppercase tracking-widest mt-1">Sesiones</p>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-surface-50/50 dark:bg-surface-900/40 rounded-2xl border border-surface-200 dark:border-surface-850">
              <p className="text-xs text-surface-650 dark:text-surface-400 italic leading-relaxed text-center font-medium">
                {streaks.gym + streaks.baby > 0 
                  ? "🔥 ¡Gran disciplina! Tu compromiso físico está dando frutos excelentes." 
                  : "🎯 Comienza a marcar tus actividades deportivas (#Gym o #BabyFutbol) como completadas para activar tus rachas."}
              </p>
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
          <div className="space-y-3">
            <p>
              ¿Deseas postergar <strong>"{rescheduleDialog.summary}"</strong> a las <strong>{rescheduleDialog.suggestedTime}</strong>?
            </p>
            <div className="p-4.5 bg-gradient-to-br from-purple-500/10 via-indigo-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl text-xs sm:text-sm text-purple-800 dark:text-purple-300 italic shadow-inner">
              <span className="font-extrabold block not-italic text-purple-650 dark:text-purple-400 mb-1">💡 Razón del Reajuste:</span>
              "{rescheduleDialog.reason}"
            </div>
            <p className="text-xs text-surface-500 dark:text-surface-450 leading-relaxed mt-2.5">
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
