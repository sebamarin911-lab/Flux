import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';
import { Brain, Flame, Trophy, Lock, Unlock, Sparkles, Heart } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useFlux } from '@/context/FluxContext';

export function WellbeingView() {
  const {
    events,
    eventStatus,
    wellbeingLogs,
    introspectionStreak,
    isReflectionCompletedToday,
    saveWellbeingReflection,
    updateCalendarEvent,
    refreshData
  } = useFlux();

  const [mentalScore, setMentalScore] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados de IA RAG
  const [greeting, setGreeting] = useState('¿Cómo estuvo tu día? Escribe tu reflexión libre y directa.');
  const [loadingGreeting, setLoadingGreeting] = useState(false);
  const [reflectionRecord, setReflectionRecord] = useState<any>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const [aiQuestion, setAiQuestion] = useState<string | null>(null);
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [followUpSubmitted, setFollowUpSubmitted] = useState(false);

  const [suggestedChange, setSuggestedChange] = useState<any>(null);
  const [applyingChange, setApplyingChange] = useState(false);

  // Evolución semanal heredada del modulo gemini
  const [evolutionText, setEvolutionText] = useState('Escribe reflexiones para comenzar a perfilar tu evolución emocional.');
  const [loadingEvolution, setLoadingEvolution] = useState(false);

  // Flag de control para evitar invocaciones infinitas en bucle
  const hasLoadedEvolution = useRef(false);

  // Filtrar eventos clave de hoy (hechos consumados)
  const todayEvents = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return events.filter(e => {
      try {
        const startStr = e.start?.dateTime || e.start?.date;
        if (!startStr) return false;
        const dateStr = format(parseISO(startStr), 'yyyy-MM-dd');
        return dateStr === todayStr;
      } catch {
        return false;
      }
    });
  }, [events]);

  // [1] EFECTO: Carga inicial de saludo/icebreaker
  useEffect(() => {
    let active = true;
    async function loadGreeting() {
      if (isReflectionCompletedToday) return;
      setLoadingGreeting(true);
      try {
        const completedEventsPayload = todayEvents.map(e => ({
          id: e.id,
          summary: e.summary,
          completed: !!eventStatus[e.id],
          location: e.location,
          start_time: e.start?.dateTime || e.start?.date
        }));

        const { data, error } = await supabase.functions.invoke('process-wellbeing', {
          body: {
            action: 'init',
            completed_events: completedEventsPayload
          }
        });

        if (error) throw error;
        if (active && data?.greeting) {
          setGreeting(data.greeting);
        }
      } catch (err) {
        console.error('Error cargando el saludo personalizado del Coach:', err);
      } finally {
        if (active) setLoadingGreeting(false);
      }
    }

    if (todayEvents.length > 0) {
      loadGreeting();
    }
    return () => {
      active = false;
    };
  }, [todayEvents, eventStatus, isReflectionCompletedToday]);

  // [2] EFECTO: Cargar reflexión guardada hoy para persistencia de interfaz
  useEffect(() => {
    let active = true;
    async function fetchTodayReflection() {
      if (!isReflectionCompletedToday) {
        setReflectionRecord(null);
        setAiQuestion(null);
        setFollowUpSubmitted(false);
        setFollowUpAnswer('');
        setSuggestedChange(null);
        return;
      }

      setLoadingRecord(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('daily_reflections')
          .select('*')
          .eq('user_id', user.id)
          .eq('reflection_date', todayStr)
          .maybeSingle();

        if (error) throw error;

        if (active && data) {
          setReflectionRecord(data);
          if (data.question) {
            setAiQuestion(data.question);
          }
          if (data.question_answered) {
            setFollowUpSubmitted(true);
            setFollowUpAnswer(data.answer || '');
          }
        }
      } catch (err) {
        console.error('Error al recuperar bitácora diaria:', err);
      } finally {
        if (active) setLoadingRecord(false);
      }
    }

    fetchTodayReflection();
    return () => {
      active = false;
    };
  }, [isReflectionCompletedToday]);

  const wellbeingLogsRef = useRef(wellbeingLogs);
  
  // Mantener actualizado el ref con los logs de bienestar
  useEffect(() => {
    wellbeingLogsRef.current = wellbeingLogs;
    if (wellbeingLogs.length > 0 && !hasLoadedEvolution.current) {
      triggerEvolutionLoad();
    }
  }, [wellbeingLogs]);

  const triggerEvolutionLoad = () => {
    if (hasLoadedEvolution.current) return;
    const logs = wellbeingLogsRef.current;
    if (logs.length === 0) return;
    
    hasLoadedEvolution.current = true;
    setLoadingEvolution(true);

    const history = logs
      .filter(l => l.notas && l.notas.trim() !== '')
      .map(l => l.notas);

    if (history.length > 0) {
      import('@/lib/gemini').then(({ getEvolutionAnalysis }) => {
        getEvolutionAnalysis({ history })
          .then(res => {
            setEvolutionText(res.evolution || 'Sin análisis de evolución disponible en este momento.');
          })
          .catch(err => {
            console.error('Error cargando evolución cualitativa:', err);
            setEvolutionText('Tu sentir va tomando forma. Sigue expresando tus reflexiones.');
          })
          .finally(() => {
            setLoadingEvolution(false);
          });
      });
    } else {
      setLoadingEvolution(false);
      setEvolutionText('Escribe reflexiones para comenzar a perfilar tu evolución emocional.');
    }
  };

  // [3] EFECTO: Cargar Evolución Semanal cualitativa EXACTAMENTE UNA VEZ (Dependencia [] controlada por useRef flag)
  useEffect(() => {
    if (wellbeingLogsRef.current.length > 0 && !hasLoadedEvolution.current) {
      triggerEvolutionLoad();
    }
  }, []);

  // [4] FUNCIÓN: Guardar Reflexión Principal
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (mentalScore === null) return;

    setSaving(true);
    setSaveMessage(null);

    const currentNotes = notes.trim();

    try {
      const completedEventsPayload = todayEvents.map(e => ({
        id: e.id,
        summary: e.summary,
        completed: !!eventStatus[e.id],
        location: e.location,
        start_time: e.start?.dateTime || e.start?.date
      }));

      // Llamar a nuestra Edge Function de RAG
      const { data, error } = await supabase.functions.invoke('process-wellbeing', {
        body: {
          action: 'reflection',
          reflection: currentNotes,
          mental_score: mentalScore,
          completed_events: completedEventsPayload,
          initial_question: greeting
        }
      });

      if (error) throw error;

      if (data) {
        setNotes('');
        setMentalScore(null);
        setSaveMessage({ type: 'success', text: '✅ Reflexión procesada con éxito por tu Coach de IA.' });

        setReflectionRecord({
          reflection: currentNotes,
          feedback: data.feedback,
          question: data.question,
          question_answered: false,
          answer: null
        });

        if (data.question) {
          setAiQuestion(data.question);
          setFollowUpSubmitted(false);
          setFollowUpAnswer('');
        } else {
          setAiQuestion(null);
        }

        if (data.suggested_agenda_change) {
          setSuggestedChange(data.suggested_agenda_change);
        }

        // Sincronizar estado global
        await refreshData();
      }
    } catch (err) {
      console.error('Error al guardar y procesar bienestar:', err);
      setSaveMessage({ type: 'error', text: '❌ Error al procesar tu reflexión. Inténtalo nuevamente.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }

  // [5] FUNCIÓN: Guardar Respuesta Opcional al Seguidor
  async function handleSaveFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpAnswer.trim()) return;

    setSavingFollowUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-wellbeing', {
        body: {
          action: 'answer_question',
          answer: followUpAnswer.trim()
        }
      });

      if (error) throw error;

      setFollowUpSubmitted(true);
      setSaveMessage({ type: 'success', text: '✅ Respuesta registrada por tu Coach.' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Error al guardar respuesta de seguimiento:', err);
      setSaveMessage({ type: 'error', text: '❌ Error al guardar tu respuesta.' });
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSavingFollowUp(false);
    }
  }

  // [6] FUNCIÓN: Aplicar Cambio de Agenda Recomendado
  async function handleApplyChange() {
    if (!suggestedChange) return;
    setApplyingChange(true);
    try {
      const now = new Date().getTime();
      const nextMatchingEvent = events
        .filter((e: any) => {
          const eventTime = new Date(e.start.dateTime || e.start.date).getTime();
          return eventTime > now && e.summary.toLowerCase().includes(suggestedChange.original_event.toLowerCase());
        })
        .sort((a: any, b: any) => {
          const timeA = new Date(a.start.dateTime || a.start.date).getTime();
          const timeB = new Date(b.start.dateTime || b.start.date).getTime();
          return timeA - timeB;
        })[0];

      if (nextMatchingEvent) {
        await updateCalendarEvent(nextMatchingEvent.id, {
          summary: suggestedChange.suggested_event
        });
        setSaveMessage({ type: 'success', text: `✅ Agenda optimizada: "${suggestedChange.original_event}" cambiado por "${suggestedChange.suggested_event}"` });
        setSuggestedChange(null);
        await refreshData();
        setTimeout(() => setSaveMessage(null), 4000);
      } else {
        setSaveMessage({ type: 'error', text: '❌ No se encontró ningún evento futuro para modificar.' });
        setTimeout(() => setSaveMessage(null), 4000);
      }
    } catch (err) {
      console.error('Error al aplicar cambio de agenda:', err);
      setSaveMessage({ type: 'error', text: '❌ Ocurrió un error al aplicar el cambio de agenda.' });
      setTimeout(() => setSaveMessage(null), 4000);
    } finally {
      setApplyingChange(false);
    }
  }

  const moods = [
    { score: 1, emoji: '😞', label: 'Agotado', activeClass: 'border-red-500 bg-red-500/15 text-red-650 dark:text-red-400 ring-4 ring-red-500/20 shadow-md scale-[1.03]', normalClass: 'border-red-500/15 hover:border-red-500/30 text-red-600 dark:text-red-400/80 bg-red-500/5 hover:bg-red-500/10' },
    { score: 2, emoji: '😐', label: 'Normal', activeClass: 'border-zinc-500 bg-zinc-550/15 text-zinc-700 dark:text-zinc-300 ring-4 ring-zinc-500/20 shadow-md scale-[1.03]', normalClass: 'border-zinc-500/15 hover:border-zinc-500/30 text-zinc-650 dark:text-zinc-400 bg-zinc-500/5 hover:bg-zinc-550/10' },
    { score: 4, emoji: '😌', label: 'En Paz', activeClass: 'border-purple-500 bg-purple-550/15 text-purple-700 dark:text-purple-300 ring-4 ring-purple-500/20 shadow-md scale-[1.03]', normalClass: 'border-purple-500/15 hover:border-purple-500/30 text-purple-650 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-550/10' },
    { score: 5, emoji: '⚡', label: 'Enérgico', activeClass: 'border-amber-500 bg-amber-550/15 text-amber-700 dark:text-amber-300 ring-4 ring-amber-500/20 shadow-md scale-[1.03]', normalClass: 'border-amber-500/15 hover:border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-550/10' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 h-full pb-10">
      {/* Cabecera */}
      <div className="border-b border-surface-150/15 dark:border-surface-800/15 pb-5">
        <h1 className="text-3xl md:text-4xl font-display font-extrabold text-surface-900 dark:text-white flex items-center gap-3.5 tracking-tight">
          <Brain className="w-8 h-8 text-purple-500 animate-pulse" />
          Paz Mental y Bienestar
        </h1>
        <p className="text-xs font-semibold text-surface-450 mt-1 uppercase tracking-wider">
          Libera tensiones, vierte tu flujo de pensamiento y desbloquea el análisis de reencuadre cognitivo asistido por IA.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Columna Izquierda: Formulario de Reflexión */}
        <div className="lg:col-span-3 space-y-6">
          <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-[60px] pointer-events-none" />
            
            <h2 className="text-lg font-bold mb-5 flex items-center gap-2.5 text-surface-900 dark:text-white">
              <span className="text-2xl">🧠</span> Descarga Emocional
            </h2>

            {/* Icebreaker del Coach (Carga Dinámica inicial) */}
            {!isReflectionCompletedToday && (
              <div className="p-4 bg-purple-500/5 dark:bg-purple-900/10 border border-purple-500/10 rounded-2xl mb-6 relative pl-5 animate-in slide-in-from-top-1.5 duration-350">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-purple-500 to-indigo-500 rounded-l-2xl" />
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-purple-500 dark:text-purple-300 flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3 h-3 animate-spin" /> Tu Coach de IA sugiere:
                </p>
                <p className="text-sm font-semibold text-surface-800 dark:text-purple-100 leading-relaxed italic">
                  {loadingGreeting ? (
                    <span className="flex items-center gap-2 text-xs font-bold text-surface-450">
                      <span className="animate-ping h-1.5 w-1.5 rounded-full bg-purple-400"></span> Analizando tu día...
                    </span>
                  ) : (
                    `"${greeting}"`
                  )}
                </p>
              </div>
            )}
            
            <form onSubmit={handleSave} className="space-y-6">
              
              {/* Selector de Ánimo / Energía */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-4 text-surface-450 dark:text-surface-400">
                  ¿Cómo se siente tu nivel de energía y mente en este instante?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {moods.map((mood) => {
                    const isSelected = mentalScore === mood.score;
                    return (
                      <button
                        key={mood.score}
                        type="button"
                        onClick={() => setMentalScore(mood.score)}
                        className={`flex flex-col items-center justify-center py-4 px-3.5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                          isSelected ? mood.activeClass : mood.normalClass
                        }`}
                      >
                        <span className="text-4xl mb-2.5 drop-shadow-sm transition-transform duration-300 hover:scale-110">{mood.emoji}</span>
                        <span className="text-xs font-extrabold tracking-tight uppercase">
                          {mood.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bitácora de Reflexión Textarea */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-3 text-surface-450 dark:text-surface-400">
                  Reflexión y Escritura Libre (Diario de introspección)
                </label>
                <textarea 
                  rows={6}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Vierte tu flujo de pensamiento aquí sin filtros ni límites. ¿Qué te ha estresado hoy? ¿Qué agradeces? Este es tu espacio seguro y privado..."
                  className="w-full glass-input rounded-2xl px-4.5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none shadow-inner text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-550 text-sm leading-relaxed"
                />
              </div>

              <button 
                type="submit"
                disabled={saving || mentalScore === null}
                className="w-full bg-purple-650 hover:bg-purple-700 text-white py-4 rounded-2xl font-bold transition-all duration-300 shadow-md shadow-purple-500/10 hover:shadow-purple-500/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:shadow-none disabled:-translate-y-0 flex justify-center items-center gap-2 cursor-pointer text-sm"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Heart className="w-4 h-4 fill-white" /> Procesar Reflexión RAG con Coach
                  </>
                )}
              </button>

              {saveMessage && (
                <div className={`p-3.5 rounded-2xl text-xs font-bold text-center border animate-in fade-in duration-300 ${
                  saveMessage.type === 'success' 
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20' 
                    : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
                }`}>
                  {saveMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Columna Derecha: Gamification & Feedback RAG */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Widget de Racha de Introspección */}
          <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-pink-500 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden flex flex-col justify-between group border border-white/10">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
            <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-md"></div>

            <div className="relative z-10 flex items-center justify-between mb-4">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
                🔥 Racha de Introspección
              </span>
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm">
                <Flame className="w-4 h-4 text-purple-200 animate-pulse" />
              </div>
            </div>

            <div className="relative z-10 my-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-black tracking-tight filter drop-shadow-md">
                  {introspectionStreak.current}
                </span>
                <span className="text-sm font-semibold opacity-95">días logrados</span>
              </div>
              <p className="text-xs opacity-90 mt-2 font-medium leading-relaxed">
                {introspectionStreak.current > 0 
                  ? '¡Fantástico! Expresar tus emociones a diario fortalece tu equilibrio cerebral y alivia el estrés.'
                  : 'Registra tus reflexiones cada día para iniciar tu racha y mantener tu brújula emocional calibrada.'}
              </p>
            </div>

            <div className="relative z-10 mt-5 pt-4 border-t border-white/20 flex items-center justify-between text-xs font-bold">
              <span className="opacity-80">Récord Histórico:</span>
              <span className="flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full border border-white/15">
                <Trophy className="w-3.5 h-3.5 text-yellow-300" /> {introspectionStreak.max} días
              </span>
            </div>
          </div>

          {/* Widget de Evolución Semanal Cualitativa */}
          <div className="glass-card border border-purple-500/15 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-inner">
            <div className="absolute top-0 right-0 w-28 h-28 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none"></div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-purple-650 dark:text-purple-300 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  Evolución Semanal
                </h3>
              </div>
              
              {loadingEvolution ? (
                <div className="flex items-center gap-2.5 py-6 text-purple-600/70 dark:text-purple-350/70 text-xs font-bold justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
                  Analizando tendencias recurrentes...
                </div>
              ) : (
                <p className="text-xs font-bold text-surface-900 dark:text-purple-100 leading-relaxed italic bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/10 dark:border-purple-500/15 p-4 rounded-2xl shadow-inner text-left">
                  "{evolutionText}"
                </p>
              )}
            </div>
            
            <p className="text-[9px] font-bold text-surface-450 dark:text-purple-400/50 mt-4 leading-none tracking-wide text-center">
              💡 Síntesis generada según tu histórico de diario mental
            </p>
          </div>

          {/* MÓDULO RAG: Feedback e Insights del Coach */}
          <div className="relative overflow-hidden rounded-3xl border border-surface-150/10 dark:border-surface-800/20">
            {isReflectionCompletedToday ? (
              
              // BITÁCORA UNLOCKED: Mostrar análisis RAG
              <div className="bg-gradient-to-br from-indigo-900/15 via-purple-900/15 to-pink-900/15 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-purple-500/15 transition-all duration-500 animate-in fade-in duration-300">
                
                <div className="flex items-center justify-between mb-4 border-b border-white/10 dark:border-surface-800/15 pb-3">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-300 font-bold uppercase tracking-wider text-xs">
                    <Sparkles className="w-4 h-4 text-yellow-500 dark:text-yellow-300 animate-pulse" />
                    FeedBack del Coach de IA
                  </div>
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400 border border-emerald-500/10">
                    <Unlock className="w-4 h-4" />
                  </div>
                </div>

                {loadingRecord ? (
                  <div className="flex items-center gap-2.5 py-10 text-purple-650/80 dark:text-purple-300/80 text-xs font-bold justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
                    Extrayendo bitácora de Supabase...
                  </div>
                ) : reflectionRecord ? (
                  <div className="space-y-4">
                    
                    {/* Contenedor del Feedback Principal */}
                    <div className="p-4 bg-white/40 dark:bg-purple-950/20 border border-purple-500/10 rounded-2xl shadow-inner text-left">
                      <p className="text-xs font-extrabold text-purple-650 dark:text-purple-350 uppercase tracking-wider mb-2">
                        🧠 Perspectiva del día:
                      </p>
                      <p className="text-xs text-surface-800 dark:text-purple-100 leading-relaxed font-semibold whitespace-pre-line">
                        {reflectionRecord.feedback}
                      </p>
                    </div>

                    {/* Contenedor de la Pregunta de Seguimiento Opcional */}
                    {aiQuestion && (
                      <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl space-y-3 mt-4 text-left animate-in slide-in-from-bottom-2">
                        <p className="text-[10px] font-extrabold text-purple-650 dark:text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
                          💬 Pregunta de seguimiento:
                        </p>
                        <p className="text-xs font-bold text-surface-900 dark:text-purple-100 leading-relaxed italic">
                          "{aiQuestion}"
                        </p>
                        
                        {!followUpSubmitted ? (
                          <form onSubmit={handleSaveFollowUp} className="space-y-3">
                            <input
                              type="text"
                              value={followUpAnswer}
                              onChange={(e) => setFollowUpAnswer(e.target.value)}
                              placeholder="Tu respuesta (opcional - no te abrumes)..."
                              className="w-full glass-input rounded-xl px-3.5 py-2.5 text-xs text-surface-900 dark:text-surface-100 placeholder:text-surface-400 focus:ring-2 focus:ring-purple-500/40"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setAiQuestion(null)}
                                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-surface-500 hover:bg-surface-100 dark:hover:bg-white/5 cursor-pointer"
                              >
                                Ignorar
                              </button>
                              <button
                                type="submit"
                                disabled={savingFollowUp || !followUpAnswer.trim()}
                                className="bg-purple-650 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                              >
                                {savingFollowUp ? 'Guardando...' : 'Responder'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="p-3.5 bg-purple-950/20 border border-purple-500/10 rounded-xl text-xs text-purple-650 dark:text-purple-300 font-semibold italic">
                            ✓ Tu respuesta: "{followUpAnswer}"
                          </div>
                        )}
                      </div>
                    )}

                    {/* Contenedor de Optimización de Agenda Sugerida */}
                    {suggestedChange && (
                      <div className="glass-card border border-amber-500/20 p-5 rounded-2xl relative overflow-hidden bg-amber-500/5 text-left animate-in zoom-in-95 duration-200">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                        <h4 className="text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                          ⚡ Optimización de Agenda Sugerida
                        </h4>
                        <p className="text-xs text-surface-700 dark:text-amber-250 leading-relaxed font-semibold mb-3">
                          {suggestedChange.reason}
                        </p>
                        <p className="text-[10px] text-surface-450 dark:text-amber-300/60 font-bold mb-4">
                          ¿Quieres cambiar tu próximo bloque de "{suggestedChange.original_event}" por "{suggestedChange.suggested_event}"?
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setSuggestedChange(null)}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold text-surface-500 hover:bg-surface-100 dark:hover:bg-white/5 cursor-pointer"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={handleApplyChange}
                            disabled={applyingChange}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-amber-500/10 cursor-pointer"
                          >
                            {applyingChange ? 'Aplicando...' : 'Aceptar Cambio'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              
              // BITÁCORA LOCKED: Invitar a escribir la reflexión
              <div className="bg-surface-50/50 dark:bg-surface-900/10 border border-surface-200/40 dark:border-surface-800/40 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[300px]">
                <div className="absolute inset-0 bg-white/45 dark:bg-surface-950/30 backdrop-blur-[12px] z-10 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-12 h-12 bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/35 text-purple-650 dark:text-purple-400 rounded-full flex items-center justify-center mb-4.5 shadow-md shadow-purple-500/10 animate-bounce">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h4 className="text-[15px] font-extrabold text-surface-900 dark:text-white tracking-tight">Análisis RAG del Coach Bloqueado</h4>
                  <p className="text-xs text-surface-500 dark:text-surface-450 max-w-xs leading-relaxed font-semibold mt-2">
                    Escribe tu diario de introspección hoy para recibir feedback personalizado, desafiar rutinas y obtener recomendaciones automáticas de agenda.
                  </p>
                </div>

                <div className="opacity-15 pointer-events-none select-none space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-purple-400">Coach de IA Activo</span>
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <div className="text-xs font-bold text-red-400">Distorsión detectada</div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
