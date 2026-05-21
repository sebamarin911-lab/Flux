import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Home, Calendar, Activity, TrendingUp, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { supabase } from '@/lib/supabase';

export function AppLayout() {
  const location = useLocation();

  const handleLogout = async () => {
    localStorage.removeItem('google_provider_token');
    await supabase.auth.signOut();
  };

  const navItems = [
    { name: 'Inicio', href: '/', icon: Home },
    { name: 'Agenda', href: '/agenda', icon: Calendar },
    { name: 'Bienestar', href: '/wellbeing', icon: Activity },
    { name: 'Reporte', href: '/report', icon: TrendingUp },
    { name: 'Ajustes', href: '/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-surface-100/50 dark:border-surface-800/40 bg-surface-50/80 dark:bg-surface-950/60 backdrop-blur-xl shadow-lg">
        <div className="p-6 flex items-center gap-3 border-b border-surface-100/30 dark:border-surface-850/30">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-flux-400 to-flux-600 flex items-center justify-center shadow-md shadow-flux-500/10">
            <Logo className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-display font-bold tracking-tight bg-gradient-to-r from-flux-600 to-flux-400 dark:from-flux-400 dark:to-flux-300 bg-clip-text text-transparent">Flux</span>
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative font-sans text-sm font-medium",
                  isActive 
                    ? "bg-gradient-to-r from-flux-500/10 to-flux-500/5 text-flux-600 dark:text-flux-400 font-semibold border-l-4 border-flux-500 shadow-sm shadow-flux-500/5 pl-3" 
                    : "text-surface-500 dark:text-surface-400 hover:bg-surface-100/50 dark:hover:bg-surface-900/35 hover:text-surface-900 dark:hover:text-surface-100 border-l-4 border-transparent pl-3"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 transition-transform duration-300 group-hover:scale-110",
                  isActive ? "text-flux-500 dark:text-flux-400" : "text-surface-400 dark:text-surface-500"
                )} />
                {item.name}
                {isActive && (
                  <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-flux-500 animate-pulse-glow" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-surface-100/30 dark:border-surface-850/30">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-surface-500 dark:text-surface-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-600 dark:hover:text-red-400 hover:shadow-sm border border-transparent hover:border-red-100 dark:hover:border-red-950/50 transition-all duration-300 font-sans text-sm font-medium cursor-pointer"
          >
            <LogOut className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-surface-100/50 dark:border-surface-800/40 bg-surface-50/80 dark:bg-surface-950/60 backdrop-blur-xl shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-flux-400 to-flux-600 flex items-center justify-center shadow-sm">
              <Logo className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-display font-bold tracking-tight bg-gradient-to-r from-flux-600 to-flux-400 dark:from-flux-400 dark:to-flux-300 bg-clip-text text-transparent">Flux</span>
          </div>
          <button 
            onClick={handleLogout} 
            className="p-2 rounded-xl text-surface-500 hover:text-red-500 dark:text-surface-400 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-800/50 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Dynamic Inner page container */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-surface-50/30 dark:bg-surface-900/10">
          <Outlet />
        </div>

        {/* Mobile Navigation */}
        <nav className="md:hidden flex items-center justify-around p-3 border-t border-surface-100/50 dark:border-surface-800/40 bg-surface-50/80 dark:bg-surface-950/60 backdrop-blur-xl shadow-lg">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-1 px-3.5 rounded-xl transition-all duration-300 min-w-0 relative",
                  isActive 
                    ? "text-flux-600 dark:text-flux-400 scale-105 font-semibold" 
                    : "text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:hover:text-surface-300"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "stroke-[2.5px]")} />
                <span className="text-[10px] font-medium tracking-tight truncate">{item.name}</span>
                {isActive && (
                  <span className="absolute -bottom-1 w-4 h-1 rounded-full bg-flux-500 shadow-sm shadow-flux-500" />
                )}
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
