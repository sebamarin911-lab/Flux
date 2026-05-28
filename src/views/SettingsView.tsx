import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useFlux } from '@/context/FluxContext';
import { 
  Flame, 
  Trophy, 
  RefreshCw, 
  Calendar, 
  ShieldCheck, 
  AlertTriangle, 
  Database, 
  Cpu, 
  ExternalLink,
  Sparkles,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { fetchUserStreak } from '@/lib/completedEvents';
import { logger } from '@/lib/logger';

export function SettingsView() {
  const { isGoogleConnected, refreshData, calendarError } = useFlux();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
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

  const handleGoogleReconnect = async () => {
    logger.info('Auth', 'Initiating Google Calendar forced consent reconnection...');
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/settings',
          scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
    } catch (err) {
      logger.error('Auth', 'Error initiating Google forced consent login', err);
      showToast('Error al iniciar la reconexión con Google. Inténtalo de nuevo.', 'error');
    }
  };

  const handleManualSync = async () => {
    logger.info('Calendar', 'Triggering manual calendar sync Edge Function...');
    setSyncLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error('No active user session');
      }

      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || 'Synchronization failed');
      }

      await refreshData();
      showToast("Sincronización bidireccional exitosa. Agenda de la UBB y deportes al día.", "success");
    } catch (err: any) {
      logger.error('Calendar', 'Error during manual sync invocation', err);
      showToast("Error de sincronización: " + (err.message || "revisa tu conexión."), "error");
    } finally {
      setSyncLoading(false);
    }
  };

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 h-full pb-10 select-none relative">
      
      {/* Toast Notification Widget */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-sm w-full">
          <div className={`p-4 rounded-2xl border backdrop-blur-2xl shadow-xl flex items-start gap-3.5 ${
            toastType === 'success' 
              ? 'bg-zinc-900/90 border-emerald-500/25 text-white shadow-emerald-500/5' 
              : 'bg-zinc-900/90 border-red-500/25 text-white shadow-red-500/5'
          }`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              toastType === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {toastType === 'success' ? <CheckCircle2 className="w-4.5 h-4.5" /> : <XCircle className="w-4.5 h-4.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black tracking-tight">Sincronización de Flux</p>
              <p className="text-[11px] text-surface-400 leading-normal font-medium mt-1">{toastMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Title Header */}
      <div className="border-b border-surface-150/15 dark:border-surface-800/15 pb-5">
        <h1 className="text-3xl md:text-4xl font-display font-extrabold text-surface-900 dark:text-white flex items-center gap-3.5 tracking-tight">
          Ajustes
        </h1>
        <p className="text-xs font-semibold text-surface-450 mt-1 uppercase tracking-wider">
          Administra tus conexiones, logros e integraciones de Flux.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Context Description */}
        <div className="lg:col-span-1 space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-surface-900 dark:text-white">Perfil y Conectividad</h2>
            <p className="text-xs text-surface-450 font-semibold leading-relaxed">
              Configura y monitorea tus estadísticas de alto rendimiento acumuladas en Flux, así como la persistencia OAuth robusta inspirada en Google Workspace 3.0.
            </p>
          </div>
          
          {/* Quick Informational Tip Card */}
          <div className="p-5 rounded-2xl bg-flux-500/5 border border-flux-500/10 text-[11px] leading-relaxed text-surface-600 dark:text-surface-400 font-semibold space-y-2.5">
            <div className="flex items-center gap-2 text-flux-600 dark:text-flux-400">
              <Sparkles className="w-4 h-4" />
              <span className="font-extrabold uppercase tracking-wider">Tip de Sincronización</span>
            </div>
            <p>
              Para mantener la sincronización de tu calendario activa indefinidamente en tu cuenta personal, asegúrate de activar el estado <strong>"En Producción"</strong> en tu consola de GCP según la guía de mitigación de 7 días.
            </p>
          </div>
        </div>

        {/* Right Column: Settings Bento Grid */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Bento Block 1: Logros y Rachas Deportivas */}
          <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-[60px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-yellow-500/10 rounded-full blur-[50px] pointer-events-none"></div>

            <h3 className="text-sm font-black flex items-center gap-2.5 mb-6 text-surface-950 dark:text-white uppercase tracking-widest">
              <Flame className="w-4.5 h-4.5 text-orange-500 animate-pulse" />
              <span>Logros y Rachas Deportivas</span>
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Active Streak */}
              <div className="flex items-center gap-4.5 p-4.5 bg-orange-500/5 dark:bg-orange-500/10 rounded-2xl border border-orange-500/20 dark:border-orange-500/10 hover:scale-[1.01] transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md shadow-orange-500/20 flex-shrink-0">
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

          {/* Bento Block 2: Google Workspace 3.0 Advanced Sync Controller */}
          <div className="space-y-5">
            <h3 className="text-xs font-black text-surface-450 dark:text-surface-400 uppercase tracking-widest pl-1">
              Google Workspace 3.0 Integrations
            </h3>

            {/* Main Bento Layout Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Card 1: Connection & Account Info (2 grid columns span for widescreen) */}
              <div className="md:col-span-2 glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden flex flex-col justify-between gap-6 group">
                <div className="absolute top-0 right-0 w-36 h-36 bg-flux-500/5 rounded-full blur-[50px] pointer-events-none group-hover:scale-110 transition-transform duration-500"></div>
                
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 border border-surface-150/10 dark:border-surface-850/20 shadow-inner flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                          <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                          <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                          <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                          <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                        </g>
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-base font-black text-surface-900 dark:text-white leading-tight">Google Calendar</h4>
                      <p className="text-xs text-surface-450 font-bold leading-none mt-1.5">{userEmail ? `${userEmail}` : 'Cargando cuenta...'}</p>
                    </div>
                  </div>

                  {/* Status Indicator Badge */}
                  {isGoogleConnected ? (
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 shadow-[0_0_15px_rgba(16,185,129,0.1)] text-emerald-500 transition-all duration-300">
                      <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider">Google Workspace Activo (Sincronización Bidireccional)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/25 shadow-[0_0_15px_rgba(239,68,68,0.1)] text-red-400 transition-all duration-300 animate-pulse">
                      <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider">Desconectado / Requiere Permisos</span>
                    </div>
                  )}
                </div>

                {/* Description and Trigger Action */}
                <div className="space-y-4">
                  <p className="text-xs text-surface-500 dark:text-surface-400 leading-relaxed font-semibold">
                    Flux gestiona de forma segura el acceso bidireccional mediante Supabase Edge Functions a las API oficiales de Google Workspace. Esto permite sincronizar las asignaturas de la UBB y las sesiones deportivas (#Gym, #BabyFutbol) sin intervención manual.
                  </p>
                  
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleGoogleReconnect}
                      className="px-5 py-3 rounded-2xl bg-gradient-to-r from-surface-100 to-surface-50 hover:from-surface-200 hover:to-surface-100 dark:from-surface-900 dark:to-surface-850 dark:hover:from-surface-800 dark:hover:to-surface-750 text-surface-800 dark:text-surface-100 border border-surface-200 dark:border-surface-800 font-bold text-xs shadow-md transition-all duration-300 hover:-translate-y-0.5 cursor-pointer active:scale-95 flex items-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4 text-flux-500" />
                      <span>Reconectar Cuenta de Google (Forzar Permisos)</span>
                    </button>

                    {calendarError && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl text-[10px] font-bold">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Expirado: {calendarError}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 2: Manual Sync Controller (1 column on md screens) */}
              <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden flex flex-col justify-between gap-5 group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-[40px] pointer-events-none group-hover:scale-110 transition-transform duration-500"></div>

                <div className="space-y-2">
                  <h4 className="text-xs font-black text-surface-450 dark:text-surface-450 uppercase tracking-widest">Sincronización Manual</h4>
                  <p className="text-[11px] text-surface-400 dark:text-surface-500 font-bold leading-normal">
                    Fuerza la ejecución inmediata de la Deno Edge Function para sincronizar la agenda del día.
                  </p>
                </div>

                <button
                  onClick={handleManualSync}
                  disabled={syncLoading}
                  className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer shadow-md hover:-translate-y-0.5 active:scale-95 ${
                    syncLoading 
                      ? 'bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-surface-400 dark:text-surface-500'
                      : 'bg-gradient-to-br from-flux-500 to-flux-600 hover:from-flux-600 hover:to-flux-700 text-white shadow-flux-500/10'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />
                  <span>{syncLoading ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
                </button>
              </div>

              {/* Card 3: Backend Metrics & System Specs (1 column on md screens) */}
              <div className="glass-card p-6 md:p-8 rounded-3xl border border-surface-150/10 dark:border-surface-800/20 shadow-sm relative overflow-hidden flex flex-col justify-between gap-5 group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-[40px] pointer-events-none group-hover:scale-110 transition-transform duration-500"></div>

                <div className="space-y-3.5">
                  <h4 className="text-xs font-black text-surface-450 dark:text-surface-450 uppercase tracking-widest flex items-center gap-2">
                    <Database className="w-4 h-4 text-purple-500" />
                    <span>Especificaciones de Conexión</span>
                  </h4>
                  
                  <div className="space-y-2 text-[10px] font-black uppercase tracking-wider text-surface-600 dark:text-surface-400">
                    <div className="flex items-center justify-between py-1 border-b border-surface-150/10 dark:border-surface-850/10">
                      <span className="opacity-75">Motor Backend:</span>
                      <span className="text-purple-400 flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> Deno Edge Runtime</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-surface-150/10 dark:border-surface-850/10">
                      <span className="opacity-75">API Google:</span>
                      <span>v3 Calendar Integration</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="opacity-75">Persistencia:</span>
                      <span className="text-emerald-400">Profiles (Supabase)</span>
                    </div>
                  </div>
                </div>

                <a 
                  href="https://console.cloud.google.com/" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="w-full text-center text-[10px] font-black text-flux-600 dark:text-flux-400 hover:underline flex items-center justify-center gap-1 mt-1 group"
                >
                  <span>Google Cloud Console</span>
                  <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
