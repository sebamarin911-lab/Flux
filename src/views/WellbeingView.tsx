import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Brain, Flame, Trophy, Lock, Unlock, Sparkles, AlertCircle, Heart } from 'lucide-react';
import { logger } from '@/lib/logger';
import { WellbeingLogSchema } from '@/lib/validation';
import type { CognitiveReframing } from '@/lib/validation';
import { useFlux } from '@/context/FluxContext';

export function WellbeingView() {
  const {
    wellbeingLogs,
    introspectionStreak,
    isReflectionCompletedToday,
    saveWellbeingReflection
  } = useFlux();

  const [mentalScore, setMentalScore] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // AI evolution state
  const [evolutionText, setEvolutionText] = useState('Escribe reflexiones para comenzar a perfilar tu evolución emocional.');
  const [loadingEvolution, setLoadingEvolution] = useState(false);

  // AI Cognitive Reframing state (TCC)
  const [reframingData, setReframingData] = useState<CognitiveReframing | null>(null);
  const [loadingReframing, setLoadingReframing] = useState(false);
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});

  // Get notes history for AI
  const notesHistory = useMemo(() => {
    return wellbeingLogs
      .filter(l => l.notas && l.notas.trim() !== '')
      .map(l => l.notas);
  }, [wellbeingLogs]);

  // Fetch Weekly Evolution Summary on change
  useEffect(() => {
    let active = true;
    if (notesHistory.length > 0) {
      setLoadingEvolution(true);
      import('@/lib/gemini').then(({ getEvolutionAnalysis }) => {
        getEvolutionAnalysis({ history: notesHistory })
          .then(res => {
            if (active) {
              setEvolutionText(res.evolution || 'Sin análisis de evolución disponible en este momento.');
            }
          })
          .catch(err => {
            console.error('Error fetching weekly evolution:', err);
            if (active) setEvolutionText('Tu sentir va tomando forma. Sigue expresando tus reflexiones.');
          })
          .finally(() => {
            if (active) setLoadingEvolution(false);
          });
      });
    } else {
      setEvolutionText('Escribe reflexiones para comenzar a perfilar tu evolución emocional.');
    }
    return () => {
      active = false;
    };
  }, [notesHistory]);

  // Fetch Cognitive Reframing when today reflection is completed
  useEffect(() => {
    let active = true;
    if (isReflectionCompletedToday) {
      setLoadingReframing(true);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayLog = wellbeingLogs.find(l => l.semana === todayStr);
      // Clean up notes from any auto tags metadata to feed pure journaling text to Gemini
      const todayNote = todayLog?.notas?.split('\n[IA]')[0] || '';

      import('@/lib/gemini').then(({ getCognitiveReframing }) => {
        getCognitiveReframing({ todayNote, history: notesHistory })
          .then(res => {
            if (active) {
              setReframingData(res);
            }
          })
          .catch(err => {
            console.error('Error fetching cognitive reframing:', err);
            if (active) {
              setReframingData({
                distortion_detected: 'Ninguna detectada',
                explanation: 'No logramos analizar tu distorsión en este momento.',
                reframing: 'Tu mente encuentra balance cuando te permites expresar tus reflexiones libremente.',
                actions: [
                  'Respira hondo durante 1 minuto.',
                  'Date crédito por tomarte un momento para ti.',
                  'Continúa con tu rutina de bienestar diaria.'
                ]
              });
            }
          })
          .finally(() => {
            if (active) setLoadingReframing(false);
          });
      });
    } else {
      setReframingData(null);
      setCompletedActions({});
    }
    return () => {
      active = false;
    };
  }, [isReflectionCompletedToday, wellbeingLogs, notesHistory]);

  // Today's existing note entries
  const todayLogs = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const existingLog = wellbeingLogs.find(l => l.semana === today);
    if (existingLog && existingLog.notas) {
      return existingLog.notas.split('\n---\n').filter(Boolean);
    }
    return [];
  }, [wellbeingLogs]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (mentalScore === null) return;
    
    setSaving(true);
    setSaveMessage(null);

    const success = await saveWellbeingReflection(mentalScore, notes.trim());

    if (success) {
      const currentNotes = notes.trim();
      setNotes('');
      setMentalScore(null);
      setSaveMessage({ type: 'success', text: '✅ Reflexión guardada correctamente' });

      // Run AI Tags in background if we wrote notes
      if (currentNotes) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) {
            const today = format(new Date(), 'yyyy-MM-dd');
            const todayLog = wellbeingLogs.find(l => l.semana === today);
            const existingNotes = todayLog?.notas || '';
            
            import('@/lib/gemini').then(({ getAutoTags }) => {
              getAutoTags({ note: currentNotes }).then(async (aiData) => {
                if (!aiData?.tags) return;
                const updatedText = `${currentNotes}\n[IA] Etiquetas: ${aiData.tags.join(', ')} | Tema: ${aiData.primary_theme}`;
                
                const updatedExisting = existingNotes ? `${existingNotes}\n---\n${updatedText}` : updatedText;
                const aiPayload = {
                  user_id: userData.user.id,
                  semana: today,
                  mental_score: todayLog?.mental_score || mentalScore,
                  notas: updatedExisting
                };

                const validatedAI = WellbeingLogSchema.safeParse(aiPayload);
                if (validatedAI.success) {
                  await supabase.from('wellbeing_logs').upsert(validatedAI.data, { onConflict: 'user_id,semana' });
                }
              });
            });
          }
        } catch (err) {
          logger.error('Wellbeing', 'AI tag update error', err);
        }
      }

      // Dominical summary generation
      if (new Date().getDay() === 0) {
        import('@/lib/gemini').then(({ getWeeklySummary }) => {
          getWeeklySummary({ 
            sliders: { mental: mentalScore, fisico: 3 }, 
            notes: currentNotes, 
            streak: Number(localStorage.getItem('flux_streak') || 0) 
          }).then(summary => {
            if (summary) {
              localStorage.setItem('ai_weekly_summary', JSON.stringify(summary));
              window.dispatchEvent(new Event('flux_ai_summary_updated'));
            }
          });
        });
      }
    } else {
      setSaveMessage({ type: 'error', text: '❌ Error al guardar tu reflexión. Inténtalo nuevamente.' });
    }
    
    setSaving(false);
    setTimeout(() => setSaveMessage(null), 4000);
  }

  const moods = [
    { score: 1, emoji: '😞', label: 'Agotado', style: 'border-red-500/20 hover:border-red-500/40 focus:ring-red-500/30 text-red-650 bg-red-500/5 hover:bg-red-500/10' },
    { score: 2, emoji: '😐', label: 'Normal', style: 'border-slate-500/20 hover:border-slate-500/40 focus:ring-slate-500/30 text-slate-650 bg-slate-500/5 hover:bg-slate-500/10' },
    { score: 4, emoji: '😌', label: 'En Paz', style: 'border-purple-500/20 hover:border-purple-500/40 focus:ring-purple-500/30 text-purple-650 bg-purple-500/5 hover:bg-purple-500/10' },
    { score: 5, emoji: '⚡', label: 'Enérgico', style: 'border-yellow-500/20 hover:border-yellow-500/40 focus:ring-yellow-500/30 text-yellow-650 bg-yellow-500/5 hover:bg-yellow-500/10' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 h-full pb-10">
      {/* Title */}
      <div className="border-b border-surface-150/15 dark:border-surface-800/15 pb-5">
        <h1 className="text-3xl md:text-4xl font-display font-extrabold text-surface-900 dark:text-white flex items-center gap-3.5 tracking-tight">
          <Brain className="w-8 h-8 text-purple-500" />
          Paz Mental y Bienestar
        </h1>
        <p className="text-xs font-semibold text-surface-450 mt-1">
          Libera tensiones, vierte tu flujo de pensamiento y desbloquea el análisis de reencuadre cognitivo asistido por IA.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left Column: Introspection Form */}
        <div className="lg:col-span-3 space-y-6">
          <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2.5 text-surface-900 dark:text-white">
              <span className="text-2xl">🧠</span> Descarga Emocional
            </h2>
            
            <form onSubmit={handleSave} className="space-y-8">
              
              {/* Mood Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-3.5 text-surface-500 dark:text-surface-400">
                  ¿Cómo se siente tu nivel de energía y mente en este instante?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {moods.map((mood) => {
                    const isSelected = mentalScore === mood.score;
                    return (
                      <button
                        key={mood.score}
                        type="button"
                        onClick={() => setMentalScore(mood.score)}
                        className={`flex flex-col items-center justify-center py-4.5 px-3 rounded-2xl border transition-all duration-300 cursor-pointer ${
                          isSelected 
                            ? 'border-purple-500 bg-purple-500/10 dark:bg-purple-500/15 shadow-md shadow-purple-500/10 ring-2 ring-purple-500/35 scale-[1.03]' 
                            : mood.style
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

              {/* Journaling Textarea */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-3 text-surface-500 dark:text-surface-400">
                  Reflexión y Escritura Libre (Diario de introspección)
                </label>
                <textarea 
                  rows={6}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Vierte tu flujo de pensamiento aquí sin filtros ni límites. ¿Qué te ha estresado hoy? ¿Qué agradeces? Este es tu espacio seguro, privado y cifrado..."
                  className="w-full glass-input rounded-2xl px-4.5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none shadow-inner text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-550 text-sm leading-relaxed"
                />
              </div>

              {/* Display Today's Reflections */}
              {todayLogs.length > 0 && (
                <div className="space-y-3.5">
                  <p className="text-[10px] font-extrabold text-surface-400 uppercase tracking-widest">Registros de Reflexión Guardados Hoy</p>
                  <div className="space-y-3">
                    {todayLogs.map((log: string, i: number) => (
                      <div 
                        key={i} 
                        className="p-4 bg-purple-500/5 dark:bg-purple-500/10 rounded-2xl border border-purple-500/10 text-sm text-purple-900 dark:text-purple-300 italic shadow-sm relative pl-4"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 rounded-l-2xl" />
                        "{log}"
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={saving || mentalScore === null}
                className="w-full bg-purple-650 hover:bg-purple-700 text-white py-4 rounded-2xl font-bold transition-all duration-300 shadow-md shadow-purple-500/10 hover:shadow-purple-500/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:shadow-none disabled:-translate-y-0 flex justify-center items-center gap-2 cursor-pointer text-sm"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Heart className="w-4 h-4 fill-white" /> Guardar Registro de Introspección
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

        {/* Right Column: Gamification & Insights */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Introspection Streak Widget */}
          <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-indigo-750 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden flex flex-col justify-between group border border-white/10">
            {/* Decorative background aura */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
            <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-md"></div>

            <div className="relative z-10 flex items-center justify-between mb-4">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/10">
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
                  ? '¡Fantástico! Expresar tus emociones a diario fortalece tu equilibrio cerebral y calancifica el estrés.'
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

          {/* Tu Evolución Semanal Module */}
          <div className="bg-purple-950/15 backdrop-blur-xl border border-purple-500/15 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-inner">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500 rounded-full blur-[60px] opacity-15"></div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-purple-300 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Evolución Semanal (IA)
                </h3>
              </div>
              
              {loadingEvolution ? (
                <div className="flex items-center gap-2.5 py-4 text-purple-300/70 text-xs font-bold justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
                  Analizando tu sentir y temas recurrentes...
                </div>
              ) : (
                <p className="text-xs font-bold text-purple-900 dark:text-purple-100 leading-relaxed italic bg-purple-500/5 border border-purple-500/10 p-4 rounded-2xl shadow-inner text-left">
                  "{evolutionText}"
                </p>
              )}
            </div>
            
            <p className="text-[9px] font-bold text-surface-450 dark:text-purple-400/50 mt-4 leading-none tracking-wide text-center">
              💡 Síntesis generada según tu histórico de diario mental
            </p>
          </div>

          {/* Insight del Día Widget (AI Locked/Unlocked Card) */}
          <div className="relative overflow-hidden rounded-3xl border border-surface-150/10 dark:border-surface-800/20">
            {isReflectionCompletedToday ? (
              // UNLOCKED STATE
              <div className="bg-gradient-to-br from-indigo-900/35 via-purple-900/35 to-pink-900/35 backdrop-blur-xl p-6 rounded-3xl shadow-lg transition-all duration-500 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between mb-5 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2 text-purple-300 font-bold uppercase tracking-wider text-xs">
                    <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />
                    Reencuadre Cognitivo
                  </div>
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Unlock className="w-4 h-4" />
                  </div>
                </div>
                
                {loadingReframing ? (
                  <div className="flex items-center gap-2.5 py-10 text-purple-300/80 text-xs font-bold justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400"></div>
                    Desafiando distorsiones mentales...
                  </div>
                ) : reframingData ? (
                  <div className="space-y-4.5">
                    {/* Distortion Block */}
                    {reframingData.distortion_detected && reframingData.distortion_detected !== 'Ninguna' && reframingData.distortion_detected !== 'Ninguna detectada' ? (
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-red-400">
                          <span className="flex h-2 w-2 rounded-full bg-red-400 animate-ping"></span>
                          <span className="flex h-2 w-2 rounded-full bg-red-500 absolute"></span>
                          Distorsión Detectada: {reframingData.distortion_detected}
                        </div>
                        <p className="text-xs text-purple-200 mt-2 leading-relaxed">
                          {reframingData.explanation}
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
                        <div className="text-xs font-extrabold text-green-400 flex items-center gap-2">
                          <span className="flex h-2.5 w-2.5 rounded-full bg-green-400"></span>
                          Enfoque Mental Equilibrado
                        </div>
                        <p className="text-xs text-purple-200 mt-2 leading-relaxed font-semibold">
                          {reframingData.explanation || '¡Excelente! Tus reflexiones de hoy expresan una perspectiva muy saludable y balanceada.'}
                        </p>
                      </div>
                    )}

                    {/* Reframing Block */}
                    <div className="p-4.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl shadow-inner">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Perspectiva Saludable Recomendada
                      </div>
                      <p className="text-sm font-black text-purple-50 mt-2 leading-relaxed font-display italic">
                        "{reframingData.reframing}"
                      </p>
                    </div>

                    {/* 3 Action Steps */}
                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] font-extrabold text-purple-300 uppercase tracking-widest">
                        📋 Micro-Hábitos para tomar el control (menos de 10 min)
                      </p>
                      <div className="space-y-2">
                        {reframingData.actions?.map((action: string, idx: number) => {
                          const isDone = completedActions[idx];
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setCompletedActions(prev => ({ ...prev, [idx]: !prev[idx] }))}
                              className={`w-full text-left p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-3 transition-all duration-300 cursor-pointer ${
                                isDone 
                                  ? 'bg-purple-950/40 border-purple-500/20 text-purple-300/40 line-through scale-[0.98]' 
                                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-purple-100 hover:border-purple-500/35 hover:-translate-y-0.5'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all ${
                                isDone ? 'bg-emerald-500 border-emerald-500 text-white shadow-md' : 'border-white/20'
                              }`}>
                                {isDone && <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3 stroke-[3px]"><path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                              </span>
                              <span className="truncate">{action}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              // LOCKED STATE
              <div className="bg-surface-100/30 dark:bg-surface-900/10 border border-surface-200/40 dark:border-surface-800/40 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between group min-h-[300px]">
                {/* Blur Cover Overlay */}
                <div className="absolute inset-0 bg-surface-50/20 dark:bg-surface-950/30 backdrop-blur-[12px] filter z-10 flex flex-col items-center justify-center p-6 text-center transition-all duration-300">
                  <div className="w-12 h-12 bg-purple-500/15 dark:bg-purple-500/20 border border-purple-500/30 text-purple-650 dark:text-purple-400 rounded-full flex items-center justify-center mb-4.5 shadow-md shadow-purple-500/10 animate-bounce">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h4 className="text-[15px] font-extrabold text-surface-900 dark:text-white tracking-tight">Análisis Bloqueado</h4>
                  <p className="text-xs text-surface-500 dark:text-surface-450 max-w-xs leading-relaxed font-semibold mt-2">
                    Registra tu check-in mental y escribe una reflexión hoy para que la IA procese tu Reencuadre Cognitivo y te recomiende micro-hábitos.
                  </p>
                </div>

                {/* Simulated Content in background for premium layout styling */}
                <div className="opacity-15 pointer-events-none select-none space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-purple-400">Reencuadre Cognitivo Activo</span>
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <div className="text-xs font-bold text-red-400">Distorsión: Pensamiento Todo-o-Nada</div>
                    <div className="h-2 w-24 bg-white/20 rounded mt-1.5"></div>
                  </div>
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                    <div className="text-xs font-bold text-emerald-400">Reencuadre Saludable</div>
                    <div className="h-3 w-full bg-white/20 rounded mt-1.5"></div>
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
