import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Brain, Flame, Trophy, Lock, Unlock, Sparkles, AlertCircle, Heart } from 'lucide-react';
import { logger } from '@/lib/logger';
import { WellbeingLogSchema } from '@/lib/validation';
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

  // AI Daily insight state
  const [dailyInsight, setDailyInsight] = useState('');
  const [loadingInsight, setLoadingInsight] = useState(false);

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

  // Fetch Daily Insight when today reflection is completed
  useEffect(() => {
    let active = true;
    if (isReflectionCompletedToday) {
      setLoadingInsight(true);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayLog = wellbeingLogs.find(l => l.semana === todayStr);
      const todayNote = todayLog?.notas || '';

      import('@/lib/gemini').then(({ getDailyInsight }) => {
        getDailyInsight({ todayNote, history: notesHistory })
          .then(res => {
            if (active) {
              setDailyInsight(res.insight || 'Tu mente encuentra balance cuando te permites expresar tus reflexiones.');
            }
          })
          .catch(err => {
            console.error('Error fetching daily insight:', err);
            if (active) setDailyInsight('Tu mente encuentra balance cuando te permites expresar tus reflexiones.');
          })
          .finally(() => {
            if (active) setLoadingInsight(false);
          });
      });
    } else {
      setDailyInsight('');
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
    { score: 1, emoji: '😞', label: 'Agotado' },
    { score: 2, emoji: '😐', label: 'Normal' },
    { score: 4, emoji: '😌', label: 'En Paz' },
    { score: 5, emoji: '⚡', label: 'Con Energía' }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 h-full pb-8">
      {/* Title */}
      <div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-surface-900 dark:text-surface-50 flex items-center gap-3">
          <Brain className="w-8 h-8 text-purple-500" />
          Paz Mental y Bienestar
        </h1>
        <p className="text-surface-500 dark:text-surface-400 mt-1">El agotamiento mental se combate expresando tus emociones y entendiendo tu mentalidad.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left Column: Introspection Form */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-surface-950 p-6 md:p-8 rounded-3xl border border-surface-100 dark:border-surface-800 shadow-sm relative overflow-hidden">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-surface-900 dark:text-surface-50">
              <span className="text-2xl">🧠</span> Descarga Emocional
            </h2>
            
            <form onSubmit={handleSave} className="space-y-8">
              
              {/* Mood Selector */}
              <div>
                <label className="block text-sm font-medium mb-3 text-surface-700 dark:text-surface-300">
                  ¿Cómo se siente tu energía mental en este momento?
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {moods.map((mood) => (
                    <button
                      key={mood.score}
                      type="button"
                      onClick={() => setMentalScore(mood.score)}
                      className={`flex flex-col items-center justify-center py-4 px-2 rounded-2xl border transition-all cursor-pointer ${
                        mentalScore === mood.score 
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 shadow-md ring-2 ring-purple-500/40' 
                          : 'border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900 hover:bg-surface-100 dark:hover:bg-surface-800'
                      }`}
                    >
                      <span className="text-3xl mb-2 drop-shadow-sm">{mood.emoji}</span>
                      <span className={`text-xs font-bold ${mentalScore === mood.score ? 'text-purple-700 dark:text-purple-300' : 'text-surface-700 dark:text-surface-300'}`}>
                        {mood.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Journaling Textarea */}
              <div>
                <label className="block text-sm font-medium mb-3 text-surface-700 dark:text-surface-300">
                  Descarga Mental y Reflexión
                </label>
                <textarea 
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Vierte tu cabeza aquí. ¿Qué te estresa? ¿Qué aprendiste hoy? No te limites, es tu espacio privado..."
                  className="w-full bg-surface-50 dark:bg-surface-900/50 border border-surface-200 dark:border-surface-800 rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none shadow-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500 text-sm leading-relaxed"
                />
              </div>

              {/* Display Today's Speech Bubbles */}
              {todayLogs.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Reflexiones Escritas Hoy</p>
                  <div className="space-y-2">
                    {todayLogs.map((log: string, i: number) => (
                      <div 
                        key={i} 
                        className="p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-2xl border border-purple-100/50 dark:border-purple-900/20 text-sm text-purple-950 dark:text-purple-200 italic shadow-sm relative"
                      >
                        "{log}"
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={saving || mentalScore === null}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3.5 rounded-2xl font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2 cursor-pointer text-sm"
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Heart className="w-4 h-4 fill-white" /> Guardar Registro Diario
                  </>
                )}
              </button>

              {saveMessage && (
                <div className={`p-3 rounded-2xl text-xs font-semibold text-center animate-in fade-in ${
                  saveMessage.type === 'success' 
                    ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' 
                    : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}>
                  {saveMessage.text}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column: Gamification Widgets */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. Introspection Streak Widget */}
          <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-indigo-700 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between group">
            {/* Decorative background aura */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500"></div>
            <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-md"></div>

            <div className="relative z-10 flex items-center justify-between mb-4">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 backdrop-blur-md px-3 py-1 rounded-full">
                🔥 Racha de Introspección
              </span>
              <Flame className="w-6 h-6 text-purple-200 animate-pulse group-hover:scale-120 transition-transform" />
            </div>

            <div className="relative z-10 my-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-extrabold tracking-tight filter drop-shadow-md">
                  {introspectionStreak.current}
                </span>
                <span className="text-sm font-semibold opacity-90">días logrados</span>
              </div>
              <p className="text-xs opacity-85 mt-2 font-medium leading-relaxed">
                {introspectionStreak.current > 0 
                  ? '¡Excelente! Escribir todos los días ayuda a calmar la ansiedad.'
                  : 'Registra tu check-in hoy para iniciar tu racha de reflexión personal.'}
              </p>
            </div>

            <div className="relative z-10 mt-5 pt-4 border-t border-white/20 flex items-center justify-between text-xs font-bold">
              <span className="opacity-80">Récord Histórico:</span>
              <span className="flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full">
                <Trophy className="w-3.5 h-3.5 text-yellow-300" /> {introspectionStreak.max} días
              </span>
            </div>
          </div>

          {/* 2. Tu Evolución Semanal Module */}
          <div className="bg-purple-950/20 backdrop-blur-xl border border-purple-500/20 p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500 rounded-full blur-[60px] opacity-20"></div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-purple-300 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Tu Evolución Semanal
                </h3>
              </div>
              
              {loadingEvolution ? (
                <div className="flex items-center gap-2.5 py-3 text-purple-300/70 text-xs font-medium">
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-purple-400"></div>
                  Analizando tu sentir reciente...
                </div>
              ) : (
                <p className="text-sm font-semibold text-surface-900 dark:text-purple-100 leading-relaxed italic bg-white/5 dark:bg-purple-900/10 p-4 rounded-2xl border border-purple-500/10 shadow-inner">
                  "{evolutionText}"
                </p>
              )}
            </div>
            
            <p className="text-[10px] text-surface-400 dark:text-purple-400/60 mt-3 font-semibold">
              💡 Basado en tus registros y notas de bienestar
            </p>
          </div>

          {/* 3. Insight del Día Widget (AI Gamified & Locked) */}
          <div className="relative overflow-hidden rounded-3xl">
            {isReflectionCompletedToday ? (
              // UNLOCKED STATE
              <div className="bg-gradient-to-br from-indigo-900/30 via-purple-900/30 to-pink-900/30 backdrop-blur-xl border border-purple-500/30 p-6 rounded-3xl shadow-md transition-all duration-500 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-purple-300 font-bold uppercase tracking-wider text-xs">
                    <Sparkles className="w-4 h-4 text-yellow-300 animate-spin-slow" />
                    Insight del Día
                  </div>
                  <Unlock className="w-5 h-5 text-green-400 animate-pulse" />
                </div>
                
                {loadingInsight ? (
                  <div className="flex items-center gap-2.5 py-4 text-purple-300/80 text-xs font-medium">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-300"></div>
                    Descifrando tu mente...
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-base font-bold text-surface-900 dark:text-purple-50 leading-relaxed font-display">
                      "{dailyInsight}"
                    </p>
                    <div className="w-full bg-purple-500/10 h-0.5 rounded-full"></div>
                    <p className="text-[9px] text-purple-400 font-semibold leading-normal">
                      ✨ Un pensamiento personalizado por Gemini para guiar tu introspección.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              // LOCKED STATE
              <div className="bg-surface-100/50 dark:bg-surface-900/30 border border-surface-200/50 dark:border-surface-800/50 p-6 rounded-3xl shadow-sm relative overflow-hidden flex flex-col justify-between group">
                {/* Blur Cover Overlay */}
                <div className="absolute inset-0 bg-surface-50/20 dark:bg-surface-950/25 backdrop-blur-[5px] filter z-10 flex flex-col items-center justify-center p-6 text-center transition-all duration-300 group-hover:backdrop-blur-[3px]">
                  <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/20 p-3 rounded-full mb-3 text-yellow-600 dark:text-yellow-400 shadow-md animate-bounce">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-surface-900 dark:text-surface-100 mb-1">Módulo Bloqueado</h4>
                  <p className="text-xs text-surface-500 dark:text-surface-400 max-w-xs leading-relaxed font-semibold">
                    Registra tu check-in mental y escribe una reflexión hoy para desbloquear tu Insight del Día generado por la IA.
                  </p>
                </div>

                {/* Simulated content behind blur */}
                <div className="opacity-20 pointer-events-none select-none">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-purple-400">Insight del Día</span>
                    <Lock className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-display font-bold leading-relaxed mb-2">
                    Tu mente encuentra calma cuando te permites expresar tus sentimientos de forma brutalmente honesta.
                  </p>
                  <p className="text-[10px] text-surface-400">Un pensamiento para guiar tu introspección.</p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
