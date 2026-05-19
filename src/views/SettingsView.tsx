import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, BellOff, Clock, Brain, Smartphone, Flame, Trophy } from 'lucide-react';
import { 
  getNotificationStatus, 
  requestNotificationPermission,
  scheduleMorningBrief 
} from '@/lib/notifications';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '@/lib/pushSubscription';
import { fetchUserStreak } from '@/lib/completedEvents';

export function SettingsView() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState(getNotificationStatus());
  const [morningEnabled, setMorningEnabled] = useState(() => {
    return localStorage.getItem('flux_morning_brief') !== 'false';
  });
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
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

    // Check push subscription status
    isPushSubscribed().then(setPushSubscribed);
  }, []);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
    if (granted) {
      scheduleMorningBrief();
    }
  };

  const toggleMorning = () => {
    const newVal = !morningEnabled;
    setMorningEnabled(newVal);
    localStorage.setItem('flux_morning_brief', newVal.toString());
    if (newVal) {
      scheduleMorningBrief();
    }
  };

  const togglePushSubscription = async () => {
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
      } else {
        const success = await subscribeToPush();
        setPushSubscribed(success);
      }
    } catch (err) {
      console.error('Error toggling push:', err);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Ajustes</h1>
        <p className="text-surface-500 mt-1">Administra tus conexiones, notificaciones e integraciones.</p>
      </div>

      <div className="space-y-6">
        {/* Logros y Rachas Deportivas */}
        <div className="bg-white dark:bg-surface-950 p-6 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm relative overflow-hidden">
          {/* Glassmorphism accent lines/effects */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-16 h-16 bg-yellow-500/10 rounded-full blur-lg pointer-events-none"></div>

          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
            <span>Logros y Rachas Deportivas</span>
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Active Streak */}
            <div className="flex items-center gap-4 p-4 bg-orange-50/50 dark:bg-orange-950/10 rounded-xl border border-orange-100 dark:border-orange-900/30">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-md animate-glow-orange flex-shrink-0">
                <Flame className="w-6 h-6 text-white animate-bounce" />
              </div>
              <div>
                <p className="text-xs text-surface-400 font-semibold uppercase tracking-wider">Racha Activa</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-surface-900 dark:text-surface-50">{streakInfo.current_streak}</span>
                  <span className="text-xs text-surface-500 font-medium">días</span>
                </div>
              </div>
            </div>

            {/* Historic Record */}
            <div className="flex items-center gap-4 p-4 bg-yellow-50/50 dark:bg-yellow-950/10 rounded-xl border border-yellow-100 dark:border-yellow-900/30">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-500 flex items-center justify-center shadow-md flex-shrink-0">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-surface-400 font-semibold uppercase tracking-wider">Récord Personal</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold text-surface-900 dark:text-surface-50">{streakInfo.max_racha_historica}</span>
                  <span className="text-xs text-surface-500 font-medium">días</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-surface-50 dark:bg-surface-900/50 rounded-xl border border-surface-200/50 dark:border-surface-800/50 text-center">
            <p className="text-xs text-surface-500 dark:text-surface-400 italic">
              {streakInfo.current_streak > 0 
                ? `🔥 ¡Tu racha actual de ${streakInfo.current_streak} días está activa! Sigue completando tus metas.` 
                : '🎯 Completa tus metas diarias (#Gym o #BabyFutbol) para activar tu racha y registrar tu récord.'}
            </p>
          </div>
        </div>

        {/* Google Account */}
        <div className="bg-white dark:bg-surface-950 p-6 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Integraciones</h2>
          <div className="flex items-center justify-between p-4 bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                  <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                  <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                  <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                  <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                </g>
              </svg>
              <div>
                <p className="font-medium">Cuenta de Google</p>
                <p className="text-sm text-surface-500">
                  {userEmail ? `Conectado como ${userEmail}` : 'Conectado'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
               <span className="flex h-3 w-3 relative">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-flux-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-flux-500"></span>
               </span>
               <span className="text-sm font-medium text-flux-600 dark:text-flux-400">Activo</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white dark:bg-surface-950 p-6 rounded-2xl border border-surface-100 dark:border-surface-800 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Notificaciones</h2>
          <div className="space-y-4">
            {/* Permission Status */}
            <div className="flex items-center justify-between p-4 bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
              <div className="flex items-center gap-3">
                {notifStatus === 'granted' 
                  ? <Bell className="w-5 h-5 text-flux-500" />
                  : <BellOff className="w-5 h-5 text-surface-400" />
                }
                <div>
                  <p className="font-medium">Notificaciones Push</p>
                  <p className="text-sm text-surface-500">
                    {notifStatus === 'granted' ? 'Activadas' : 
                     notifStatus === 'denied' ? 'Bloqueadas por el navegador' : 
                     notifStatus === 'unsupported' ? 'No soportadas' : 'Desactivadas'}
                  </p>
                </div>
              </div>
              {notifStatus !== 'granted' && notifStatus !== 'unsupported' && (
                <button 
                  onClick={handleEnableNotifications}
                  className="px-4 py-2 bg-flux-500 hover:bg-flux-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Activar
                </button>
              )}
              {notifStatus === 'granted' && (
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">Activo</span>
                </div>
              )}
            </div>

            {/* Push Subscription (Service Worker) */}
            <div className="flex items-center justify-between p-4 bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-flux-500" />
                <div>
                  <p className="font-medium">Notificaciones en Pantalla de Bloqueo</p>
                  <p className="text-sm text-surface-500">
                    {pushSubscribed 
                      ? 'Recibirás notificaciones incluso con la app cerrada' 
                      : 'Activa para recibir notificaciones en tu pantalla de bloqueo'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={togglePushSubscription}
                disabled={notifStatus !== 'granted' || pushLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  pushSubscribed ? 'bg-flux-500' : 'bg-surface-300 dark:bg-surface-600'
                } ${notifStatus !== 'granted' || pushLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  pushSubscribed ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Event Reminders */}
            <div className="flex items-center justify-between p-4 bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">Recordatorios de Eventos</p>
                  <p className="text-sm text-surface-500">15 minutos antes de cada evento</p>
                </div>
              </div>
              <span className={`text-sm font-medium ${notifStatus === 'granted' ? 'text-green-600 dark:text-green-400' : 'text-surface-400'}`}>
                {notifStatus === 'granted' ? 'Activo' : 'Requiere notificaciones'}
              </span>
            </div>

            {/* Morning Brief */}
            <div className="flex items-center justify-between p-4 bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="font-medium">Brief Matutino</p>
                  <p className="text-sm text-surface-500">Resumen y motivación a las 07:30</p>
                </div>
              </div>
              <button
                onClick={toggleMorning}
                disabled={notifStatus !== 'granted'}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  morningEnabled && notifStatus === 'granted' ? 'bg-flux-500' : 'bg-surface-300 dark:bg-surface-600'
                } ${notifStatus !== 'granted' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  morningEnabled && notifStatus === 'granted' ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
