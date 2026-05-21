import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Flame, Trophy } from 'lucide-react';
import { fetchUserStreak } from '@/lib/completedEvents';

export function SettingsView() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [streakInfo, setStreakInfo] = useState<{
    current_streak: number;
    max_racha_historica: number;
  }>({ current_streak: 0, max_racha_historica: 0 });

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUserEmail(data.user.email ?? null);
      }
    }
    loadUser();

    async function loadStreak() {
      const info = await fetchUserStreak();
      setStreakInfo({
        current_streak: info.current_streak,
        max_racha_historica: info.max_racha_historica
      });
    }
    loadStreak();
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8 h-full pb-10">
      {/* Title */}
      <div className="border-b border-surface-150/15 dark:border-surface-800/15 pb-5">
        <h1 className="text-3xl md:text-4xl font-display font-extrabold text-surface-900 dark:text-white flex items-center gap-3.5 tracking-tight">
          Ajustes
        </h1>
        <p className="text-xs font-semibold text-surface-450 mt-1 uppercase tracking-wider">
          Administra tus conexiones, logros e integraciones de Flux.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column: Quick settings description */}
        <div className="md:col-span-1 space-y-3">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">Perfil y Conectividad</h2>
          <p className="text-xs text-surface-450 font-semibold leading-relaxed">
            Configura y monitorea tus estadísticas personales logradas a lo largo del tiempo, así como tus conexiones con Google Calendar y tu sesión actual.
          </p>
        </div>

        {/* Right column: Settings cards */}
        <div className="md:col-span-2 space-y-6">
          {/* Logros y Rachas Deportivas */}
          <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden">
            {/* Glassmorphism accent lines/effects */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-[60px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-yellow-500/10 rounded-full blur-[50px] pointer-events-none"></div>

            <h3 className="text-base font-extrabold flex items-center gap-2.5 mb-6 text-surface-900 dark:text-white uppercase tracking-wider">
              <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
              <span>Logros y Rachas Deportivas</span>
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Active Streak */}
              <div className="flex items-center gap-4.5 p-4.5 bg-orange-500/5 dark:bg-orange-500/10 rounded-2xl border border-orange-500/20 dark:border-orange-500/10 hover:scale-[1.01] transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/20 flex-shrink-0 animate-glow-orange">
                  <Flame className="w-6 h-6 text-white animate-bounce" />
                </div>
                <div>
                  <p className="text-[10px] text-surface-450 dark:text-surface-400 font-bold uppercase tracking-wider">Racha Activa</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-surface-900 dark:text-white tracking-tight">{streakInfo.current_streak}</span>
                    <span className="text-xs text-surface-450 font-bold uppercase tracking-widest">días</span>
                  </div>
                </div>
              </div>

              {/* Historic Record */}
              <div className="flex items-center gap-4.5 p-4.5 bg-yellow-500/5 dark:bg-yellow-500/10 rounded-2xl border border-yellow-500/20 dark:border-yellow-500/10 hover:scale-[1.01] transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center shadow-md shadow-yellow-500/20 flex-shrink-0">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-[10px] text-surface-450 dark:text-surface-400 font-bold uppercase tracking-wider">Récord Personal</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-surface-900 dark:text-white tracking-tight">{streakInfo.max_racha_historica}</span>
                    <span className="text-xs text-surface-450 font-bold uppercase tracking-widest">días</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-surface-500/5 border border-surface-150/10 dark:border-surface-800/15 rounded-2xl text-center">
              <p className="text-xs text-surface-600 dark:text-surface-300 italic font-semibold leading-relaxed">
                {streakInfo.current_streak > 0 
                  ? `🔥 ¡Tu racha actual de ${streakInfo.current_streak} días está activa! Sigue completando tus metas.` 
                  : '🎯 Completa tus metas diarias (#Gym o #BabyFutbol) para activar tu racha y registrar tu récord.'}
              </p>
            </div>
          </div>

          {/* Google Account / Integrations */}
          <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-flux-500/10 rounded-full blur-[40px] pointer-events-none"></div>

            <h3 className="text-base font-extrabold mb-6 text-surface-900 dark:text-white uppercase tracking-wider">
              Integraciones Conectadas
            </h3>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4.5 bg-surface-500/5 rounded-2xl border border-surface-150/10 dark:border-surface-800/15 gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 flex items-center justify-center shadow-inner border border-surface-150/10 dark:border-surface-800/10">
                  <svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
                    <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                      <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                      <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                      <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                      <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                    </g>
                  </svg>
                </div>
                <div>
                  <p className="font-extrabold text-surface-900 dark:text-white tracking-tight">Google Calendar</p>
                  <p className="text-xs text-surface-450 font-bold leading-none mt-1">
                    {userEmail ? `${userEmail}` : 'Conectado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto bg-flux-500/10 border border-flux-500/20 px-3 py-1 rounded-full">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flux-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-flux-500"></span>
                </span>
                <span className="text-[10px] font-extrabold text-flux-600 dark:text-flux-400 uppercase tracking-wider">Activo</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
