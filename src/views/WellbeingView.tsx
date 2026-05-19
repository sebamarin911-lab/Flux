import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { logger } from '@/lib/logger';
import { WellbeingLogSchema } from '@/lib/validation';

export function WellbeingView() {
  const [mentalScore, setMentalScore] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  
  const [todayLogs, setTodayLogs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);

  useEffect(() => {
    loadHistoricalData();
    loadTodayEntry();
  }, []);

  async function loadHistoricalData() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase
      .from('wellbeing_logs')
      .select('semana, mental_score')
      .eq('user_id', userData.user.id)
      .order('semana', { ascending: true })
      .limit(30);

    if (data) {
      const chartData = data.map(log => ({
        date: format(new Date(log.semana + 'T12:00:00'), 'd MMM', { locale: es }),
        Bienestar: log.mental_score
      }));
      setHistoricalData(chartData);
    }
  }

  async function loadTodayEntry() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const { data } = await supabase
      .from('wellbeing_logs')
      .select('mental_score, notas')
      .eq('user_id', userData.user.id)
      .eq('semana', today)
      .maybeSingle();

    if (data) {
      setMentalScore(data.mental_score);
      if (data.notas) {
        // Split by our separator or just store as is
        const logs = data.notas.split('\n---\n').filter(Boolean);
        setTodayLogs(logs);
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (mentalScore === null) return;
    
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      return;
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    
    // UPSERT log for today
    const existingNotes = todayLogs.join('\n---\n');
    const newNotes = existingNotes && notes
      ? `${existingNotes}\n---\n${notes}`
      : notes || existingNotes;

    const payload = {
      user_id: userData.user.id,
      semana: today,
      mental_score: mentalScore,
      notas: newNotes
    };

    const validated = WellbeingLogSchema.safeParse(payload);
    if (!validated.success) {
      logger.error('Wellbeing', 'First wellbeing log entry validation failed', validated.error);
      setSaveMessage({ type: 'error', text: '❌ Error: Datos de registro inválidos' });
      setSaving(false);
      return;
    }

    logger.info('Wellbeing', `Saving wellbeing log for date ${today}...`);
    const { error } = await supabase
      .from('wellbeing_logs')
      .upsert(validated.data, { onConflict: 'user_id,semana' });

    if (!error) {
      logger.info('Wellbeing', `Wellbeing log for date ${today} saved successfully.`);
      await loadHistoricalData();
      if (notes.trim()) {
        setTodayLogs(prev => [...prev, notes.trim()]);
      }
      setNotes('');
      setMentalScore(null);
      setSaveMessage({ type: 'success', text: '✅ Reflexión guardada correctamente' });

      // AI TRIGGERS (Background)
      const currentNotes = notes.trim();
      if (currentNotes) {
        import('@/lib/gemini').then(({ getAutoTags }) => {
          getAutoTags({ note: currentNotes }).then(async (aiData) => {
            if (!aiData?.tags) return;
            const updatedText = `${currentNotes}\n[IA] Etiquetas: ${aiData.tags.join(', ')} | Tema: ${aiData.primary_theme}`;
            
            const updatedExisting = existingNotes ? `${existingNotes}\n---\n${updatedText}` : updatedText;
            const aiPayload = {
              user_id: userData.user.id,
              semana: today,
              mental_score: mentalScore,
              notas: updatedExisting
            };

            const validatedAI = WellbeingLogSchema.safeParse(aiPayload);
            if (validatedAI.success) {
              logger.info('Wellbeing', 'Saving AI auto-tag updates to wellbeing logs...');
              await supabase.from('wellbeing_logs').upsert(validatedAI.data, { onConflict: 'user_id,semana' });
              loadTodayEntry(); // refresh to show tags
            } else {
              logger.error('Wellbeing', 'AI augmented log validation failed', validatedAI.error);
            }
          });
        });
      }

      // Dominical Weekly Summary
      if (new Date().getDay() === 0) {
        import('@/lib/gemini').then(({ getWeeklySummary }) => {
          getWeeklySummary({ 
            sliders: { mental: mentalScore, fisico: 3 }, // using 3 as default fisico 
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
      console.error('Error guardando reflexión:', error);
      setSaveMessage({ type: 'error', text: `❌ Error al guardar: ${error.message}` });
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
    <div className="max-w-4xl mx-auto space-y-8 h-full pb-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Bienestar y Paz Mental</h1>
        <p className="text-surface-500 dark:text-surface-400 mt-1">El agotamiento mental se combate con reflexión y hábitos saludables.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-surface-950 p-6 rounded-3xl border border-surface-100 dark:border-surface-800 shadow-sm">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <span className="text-2xl">🧠</span> Check-in Mental Diario
            </h2>
            
            <form onSubmit={handleSave} className="space-y-8">
              
              {/* Mood Selector */}
              <div>
                <label className="block text-sm font-medium mb-3 text-surface-700 dark:text-surface-300">
                  ¿Cómo está tu energía mental hoy?
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {moods.map((mood) => (
                    <button
                      key={mood.score}
                      type="button"
                      onClick={() => setMentalScore(mood.score)}
                      className={`flex flex-col items-center justify-center py-4 rounded-2xl border transition-all ${
                        mentalScore === mood.score 
                          ? 'border-flux-600 bg-flux-100 dark:bg-flux-900/60 shadow-md ring-2 ring-flux-500/40' 
                          : 'border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700'
                      }`}
                    >
                      <span className="text-3xl mb-2 drop-shadow-sm">{mood.emoji}</span>
                      <span className={`text-sm font-semibold ${mentalScore === mood.score ? 'text-flux-900 dark:text-flux-100' : 'text-surface-900 dark:text-surface-100'}`}>
                        {mood.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>



              {/* Journaling */}
              <div>
                <label className="block text-sm font-medium mb-3 text-surface-700 dark:text-surface-300">
                  Descarga Mental y Reflexión
                </label>
                <textarea 
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Escribe tus reflexiones de la semana, aprendizajes o simplemente descarga lo que tienes en mente para despejar tu cabeza..."
                  className="w-full bg-surface-50 dark:bg-surface-900/50 border border-surface-200 dark:border-surface-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-flux-500 resize-none shadow-inner text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500"
                />
              </div>

              {/* Display Today's Reflections */}
              {todayLogs.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Reflexiones de hoy</p>
                  <div className="space-y-2">
                    {todayLogs.map((log, i) => (
                      <div key={i} className="p-3 bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-100 dark:border-surface-800 text-sm text-surface-700 dark:text-surface-300 italic">
                        "{log}"
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={saving || mentalScore === null}
                className="w-full bg-flux-600 hover:bg-flux-700 text-white py-3.5 rounded-xl font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:shadow-none flex justify-center"
              >
                {saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : 'Guardar Reflexión de Hoy'}
              </button>

              {saveMessage && (
                <div className={`p-3 rounded-xl text-sm font-medium text-center animate-in fade-in ${
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

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gradient-to-br from-surface-800 to-surface-950 dark:from-surface-900 dark:to-black text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-flux-500 rounded-full blur-[80px] opacity-30"></div>
            <h2 className="text-xl font-semibold mb-2 relative z-10">Tu Paz Mental</h2>
            {(() => {
              const summaryStr = localStorage.getItem('ai_weekly_summary');
              const summary = summaryStr ? JSON.parse(summaryStr) : null;
              if (summary) {
                return (
                  <div className="relative z-10 mb-6 bg-white/10 rounded-xl p-3 border border-white/20">
                    <p className="text-sm font-medium text-flux-200 mb-1">Tendencia: {summary.trend === 'up' ? '↗️ Al alza' : summary.trend === 'down' ? '↘️ A la baja' : '➡️ Estable'}</p>
                    <p className="text-xs text-surface-200 mb-2">💡 {summary.micro_tip}</p>
                    <p className="text-xs text-surface-300">🎯 Próximo foco: {summary.next_focus}</p>
                  </div>
                );
              }
              return (
                <p className="text-surface-300 text-sm mb-6 relative z-10 leading-relaxed">
                  La verdadera productividad no es hacer más, es hacer lo correcto con la mente clara. Protege tu energía.
                </p>
              );
            })()}
            
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-surface-200">Tendencia de Bienestar</span>
                <span className="text-xs bg-flux-500/30 text-flux-200 px-2 py-1 rounded-full">Últimos 30 días</span>
              </div>
              <div className="h-[120px] w-full mt-4">
                {historicalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historicalData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorMental" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', background: 'rgba(15, 23, 42, 0.9)', color: 'white' }}
                        itemStyle={{ color: '#c4b5fd' }}
                      />
                      <Area type="monotone" dataKey="Bienestar" stroke="#a78bfa" strokeWidth={2} fillOpacity={1} fill="url(#colorMental)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-surface-400 text-sm text-center px-4">
                    Comienza a registrar tu bienestar para ver tus tendencias
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
