import React from 'react';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/ui/Logo';
import { Calendar, Activity, Sparkles } from 'lucide-react';

export function LoginView() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950 p-4 relative overflow-hidden">
      {/* Decorative Cinematic Background Spheres */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-flux-500/10 dark:bg-flux-500/5 blur-[120px] animate-float-slow" />
      <div className="absolute -bottom-45 -right-45 w-96 h-96 rounded-full bg-purple-500/10 dark:bg-purple-500/5 blur-[120px] animate-float" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-flux-500/5 to-transparent blur-3xl opacity-50" />

      {/* Main Glass Card */}
      <div className="max-w-md w-full space-y-8 p-8 md:p-10 glass-card rounded-3xl relative z-10 shadow-2xl border border-white/20 dark:border-surface-800/40">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-flux-400 via-flux-500 to-flux-600 flex items-center justify-center shadow-xl shadow-flux-500/20 mb-6 animate-pulse-slow">
            <Logo className="w-10 h-10 text-white" />
          </div>
          
          <h2 className="text-4xl font-display font-extrabold tracking-tight bg-gradient-to-r from-surface-900 to-surface-700 dark:from-white dark:to-surface-300 bg-clip-text text-transparent">
            Bienvenido a Flux
          </h2>
          
          <p className="mt-3 text-sm text-surface-500 dark:text-surface-400 max-w-sm leading-relaxed">
            Tu centro de productividad integral, seguimiento de hábitos de alto rendimiento y diario emocional con inteligencia artificial.
          </p>
        </div>

        {/* Brand Value Features List */}
        <div className="space-y-4 py-6 border-y border-surface-100/55 dark:border-surface-800/40">
          <div className="flex items-center gap-3.5 text-left text-sm font-medium text-surface-700 dark:text-surface-300">
            <div className="w-8 h-8 rounded-lg bg-flux-50 dark:bg-flux-900/30 text-flux-600 dark:text-flux-400 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-surface-800 dark:text-surface-200">Agenda Productiva</p>
              <p className="text-xs text-surface-500">Sincronización bidireccional con Google Calendar.</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 text-left text-sm font-medium text-surface-700 dark:text-surface-300">
            <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/30 text-orange-500 flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-surface-800 dark:text-surface-200">Rachas Deportivas</p>
              <p className="text-xs text-surface-500">Monitorea tus entrenamientos, Gym y partidos.</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 text-left text-sm font-medium text-surface-700 dark:text-surface-300">
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-purple-500 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-surface-800 dark:text-surface-200">Salud Mental & IA</p>
              <p className="text-xs text-surface-500">Reencuadre cognitivo y análisis de bienestar por IA.</p>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl shadow-md bg-white dark:bg-surface-900 hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-200 border border-surface-200 dark:border-surface-800 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg font-bold text-sm cursor-pointer shadow-flux-500/5 group"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" className="group-hover:scale-110 transition-transform duration-300" xmlns="http://www.w3.org/2000/svg">
            <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
              <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
              <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
              <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
              <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
            </g>
          </svg>
          Continuar con Google
        </button>
      </div>
    </div>
  );
}
