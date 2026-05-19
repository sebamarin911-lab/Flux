import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Clock, MapPin, Plus, X, Calendar as CalendarIcon, Flame, Trophy, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { format, parseISO, isToday, addDays, addHours, eachDayOfInterval, startOfWeek, startOfMinute, differenceInMinutes, addMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { startEventNotificationScheduler, stopEventNotificationScheduler } from '@/lib/notifications';
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

  useEffect(() => {
    return () => stopEventNotificationScheduler();
  }, []);

  // Start notification scheduler when events change
  const eventsRef = useRef(events);
  eventsRef.current = events;
  useEffect(() => {
    if (events.length > 0) {
      startEventNotificationScheduler(() => eventsRef.current);
    }
  }, [events]);

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
      <div className={`p-4 bg-white dark:bg-surface-950 rounded-2xl border ${isCompleted ? 'border-flux-500/50 opacity-70' : 'border-surface-100 dark:border-surface-800'} shadow-sm hover:shadow-md transition-all group relative flex flex-col`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${isCompleted ? 'bg-green-500' : 'bg-flux-400'}`}></div>
        <div className="flex items-start gap-3">
          <button 
            onClick={() => toggleEventStatus(event.id)}
            className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
              isCompleted 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'border-surface-300 dark:border-surface-600 hover:border-flux-400'
            }`}
          >
            {isCompleted && <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5"><path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start mb-1">
              <h3 className={`font-semibold ${isCompleted ? 'text-surface-400 line-through font-normal' : 'text-surface-900 dark:text-surface-50 font-medium'}`}>{event.summary}</h3>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ml-2 ${isCompleted ? 'bg-surface-100 dark:bg-surface-800 text-surface-500' : 'bg-flux-50 dark:bg-flux-900/30 text-flux-600 dark:text-flux-400'}`}>
                {isAllDay ? 'Todo el día' : `${format(parseISO(start), 'HH:mm')} - ${format(parseISO(end), 'HH:mm')}`}
              </span>
            </div>
            {event.location && (
              <div className={`flex items-center gap-1.5 text-xs mt-2 w-fit px-2 py-1 rounded-md ${isCompleted ? 'text-surface-400 bg-surface-50/50 dark:bg-surface-900/50' : 'text-surface-500 bg-surface-50 dark:bg-surface-900'}`}>
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{event.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons (Super responsive and elegant) */}
        <div className="mt-4 pt-3 border-t border-surface-100 dark:border-surface-800/40 flex items-center gap-2 w-full justify-between sm:justify-end flex-wrap md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity">
          <button 
            onClick={() => toggleEventStatus(event.id)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3 sm:py-1.5 sm:px-3 rounded-xl transition-colors text-xs font-semibold cursor-pointer ${
              isCompleted 
                ? 'text-green-600 bg-green-50 dark:bg-green-900/30' 
                : 'text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 sm:bg-transparent sm:dark:bg-transparent'
            }`}
            title="Completar"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="sm:hidden">Completar</span>
            <span className="hidden sm:inline">{isCompleted ? 'Completado' : 'Completar'}</span>
          </button>
          
          <button 
            onClick={() => handleEditEvent(event)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3 sm:py-1.5 sm:px-3 text-xs font-semibold text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 hover:text-flux-600 hover:bg-flux-50 dark:hover:bg-flux-900/30 rounded-xl transition-colors sm:bg-transparent sm:dark:bg-transparent cursor-pointer"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
            <span>Editar</span>
          </button>
          
          <button 
            onClick={() => handleDeleteEventClick(event.id)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3 sm:py-1.5 sm:px-3 text-xs font-semibold text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors sm:bg-transparent sm:dark:bg-transparent cursor-pointer"
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
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 h-full pb-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-surface-900 dark:text-surface-50">Mi Agenda</h1>
            <p className="text-surface-500 dark:text-surface-400 mt-1 capitalize">
              {format(today, "EEEE, d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-flux-500 hover:bg-flux-600 text-white rounded-xl transition-colors font-medium shadow-sm cursor-pointer text-sm"
          >
            {showAddForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {showAddForm ? 'Cancelar' : 'Añadir Evento'}
          </button>
        </div>

        {/* Scrollable Calendar */}
        <div className="bg-white dark:bg-surface-950 p-5 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold flex items-center gap-2 text-surface-900 dark:text-surface-50">
              <CalendarIcon className="w-4 h-4 text-flux-500" />
              Calendario
            </h3>
          </div>
          <div 
            className="flex overflow-x-auto gap-2 pb-2 scrollbar-thin scrollbar-thumb-surface-200 dark:scrollbar-thumb-surface-700 scrollbar-track-transparent snap-x"
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
                  className={`flex-shrink-0 w-[3.5rem] flex flex-col items-center p-2 rounded-xl cursor-pointer transition-colors snap-center ${isCurrentDay ? 'is-today' : ''} ${isSelected ? 'bg-flux-50 dark:bg-flux-900/30 ring-1 ring-flux-500' : 'hover:bg-surface-50 dark:hover:bg-surface-900/50'}`}
                >
                  <span className="text-xs text-surface-500 mb-1 capitalize">{format(date, 'eee', { locale: es })}</span>
                  <span className={`text-sm font-semibold mb-2 ${isSelected || isCurrentDay ? 'text-flux-600 dark:text-flux-400' : 'text-surface-700 dark:text-surface-300'}`}>{format(date, 'd')}</span>
                  <div className="flex flex-col gap-1 w-full mt-auto h-8 justify-start items-center">
                     {dayEvents.slice(0, 3).map((e: any, i: number) => {
                        return (
                          <div key={i} className="h-1.5 w-full rounded-full bg-flux-400 dark:bg-flux-500" title={e.summary}></div>
                        )
                     })}
                     {dayEvents.length > 3 && (
                       <div className="text-[10px] text-center text-surface-400 font-medium">+{dayEvents.length - 3}</div>
                     )}
                     {dayEvents.length === 0 && (
                       <div className="h-1.5 w-1 rounded-full bg-transparent"></div>
                     )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showAddForm && (
          <div className="bg-surface-50 dark:bg-surface-900 p-5 rounded-2xl border border-surface-200 dark:border-surface-800 animate-in fade-in slide-in-from-top-4">
            <h3 className="font-semibold mb-4 text-lg">Crear Nuevo Evento</h3>
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título del Evento</label>
                <input
                  type="text"
                  required
                  value={newEvent.summary}
                  onChange={e => setNewEvent({...newEvent, summary: e.target.value})}
                  className="w-full px-3 py-2 bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg focus:ring-2 focus:ring-flux-500 outline-none"
                  placeholder="Ej. Reunión de proyecto"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Hora de Inicio</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEvent.start}
                    onChange={e => setNewEvent({...newEvent, start: e.target.value})}
                    className="w-full px-3 py-2 bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg focus:ring-2 focus:ring-flux-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hora de Término</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEvent.end}
                    onChange={e => setNewEvent({...newEvent, end: e.target.value})}
                    className="w-full px-3 py-2 bg-white dark:bg-surface-950 border border-surface-200 dark:border-surface-800 rounded-lg focus:ring-2 focus:ring-flux-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 bg-surface-900 hover:bg-black dark:bg-surface-100 dark:hover:bg-white text-white dark:text-surface-950 font-medium rounded-lg transition-colors disabled:opacity-70 flex justify-center cursor-pointer"
              >
                {creating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div> : 'Guardar en Google Calendar'}
              </button>
            </form>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Selected Day View */}
        <div className="space-y-4">
          {loading ? (
             <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-flux-500"></div></div>
          ) : expandedDay ? (
            <div className="bg-white dark:bg-surface-950 p-6 rounded-3xl border border-surface-100 dark:border-surface-800 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-xl font-bold capitalize text-surface-900 dark:text-surface-50">
                  {isToday(parseISO(expandedDay)) ? 'Hoy, ' : ''}
                  {format(parseISO(expandedDay), "EEEE d 'de' MMMM", { locale: es })}
                </h2>
                <span className="text-sm font-medium text-surface-500 bg-surface-100 dark:bg-surface-800 px-2 py-0.5 rounded-full">
                  {(groupedEventsToRender[expandedDay] || []).length} Eventos
                </span>
              </div>
              
              {(groupedEventsToRender[expandedDay] || []).length > 0 ? (
                <div className="space-y-4">
                  {(groupedEventsToRender[expandedDay] || []).map((event: any) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-12 bg-surface-50 dark:bg-surface-900/50 rounded-2xl border border-surface-100 dark:border-surface-800 border-dashed">
                  <CalendarIcon className="w-10 h-10 text-surface-300 dark:text-surface-700 mb-3" />
                  <p className="text-surface-500 dark:text-surface-400 font-medium">Día libre de eventos.</p>
                  <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">Tómate un respiro o añade algo a tu agenda.</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white dark:bg-surface-950 border border-surface-100 dark:border-surface-800 rounded-3xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-surface-900 dark:text-surface-50">
            <Flame className="w-5 h-5 text-orange-500" />
            Rachas y Estadísticas
          </h2>
          
          <div className="space-y-5">
            <div className="flex items-center justify-between p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-xl">
                  <Flame className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="font-semibold text-surface-900 dark:text-surface-50">Baby Fútbol</p>
                  <p className="text-sm text-surface-500 dark:text-surface-400">Semanas activas</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-bold text-orange-600 dark:text-orange-400">{streaks.baby}</p>
                <p className="text-xs font-medium text-orange-600/80 dark:text-orange-400/80 uppercase tracking-wider">Semanas</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-xl">
                  <Trophy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-surface-900 dark:text-surface-50">Gym</p>
                  <p className="text-sm text-surface-500 dark:text-surface-400">Total sesiones</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-bold text-blue-600 dark:text-blue-400">{streaks.gym}</p>
                <p className="text-xs font-medium text-blue-600/80 dark:text-blue-400/80 uppercase tracking-wider">Sesiones</p>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
              <p className="text-sm text-surface-600 dark:text-surface-400 italic">
                {streaks.gym + streaks.baby > 0 
                  ? "¡Excelente progreso! Sigue manteniendo la constancia." 
                  : "Comienza tus actividades para ver tus rachas aquí."}
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
