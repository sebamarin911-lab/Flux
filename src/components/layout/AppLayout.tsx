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
      {/* Sidebar - Desktop Floating Panel */}
      <aside className="hidden md:flex w-68 flex-col my-5 ml-5 mr-1 rounded-[2rem] border border-surface-200/30 dark:border-surface-800/30 bg-surface-50/50 dark:bg-surface-900/15 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.02)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.15)] select-none">
        
        {/* Header Branding */}
        <div className="p-6 flex items-center gap-3 border-b border-surface-200/20 dark:border-surface-800/15">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-flux-400 to-flux-600 flex items-center justify-center shadow-lg shadow-flux-500/15">
            <Logo className="w-5.5 h-5.5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-display font-black tracking-tight bg-gradient-to-r from-flux-600 to-flux-400 dark:from-flux-400 dark:to-flux-300 bg-clip-text text-transparent">
              Flux
            </span>
            <span className="text-[9px] font-black text-surface-450 dark:text-surface-500 uppercase tracking-widest leading-none mt-0.5">
              Premium Hub
            </span>
          </div>
        </div>
        
        {/* Nav Links */}
        <nav className="flex-1 px-4 py-8 space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative font-sans text-sm font-bold active:scale-[0.98]",
                  isActive 
                    ? "bg-gradient-to-r from-flux-500/15 to-flux-500/5 text-flux-600 dark:text-flux-400 border-l-4 border-flux-500 shadow-inner pl-3.5" 
                    : "text-surface-500 dark:text-surface-450 hover:bg-surface-100/50 dark:hover:bg-white/5 hover:text-surface-900 dark:hover:text-surface-100 border-l-4 border-transparent pl-3.5"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 transition-all duration-300 group-hover:scale-110",
                  isActive ? "text-flux-500 dark:text-flux-400 stroke-[2.5px]" : "text-surface-400 dark:text-surface-500 group-hover:text-flux-500 dark:group-hover:text-flux-400"
                )} />
                <span>{item.name}</span>
                {isActive && (
                  <span className="absolute right-4.5 w-1.5 h-1.5 rounded-full bg-flux-500 animate-pulse-glow" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer Logout */}
        <div className="p-4 border-t border-surface-200/20 dark:border-surface-800/15">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4.5 py-3.5 w-full rounded-2xl text-surface-500 dark:text-surface-450 hover:bg-red-50 dark:hover:bg-red-950/15 hover:text-red-650 dark:hover:text-red-400 hover:border-red-100 dark:hover:border-red-950/20 transition-all duration-300 font-sans text-sm font-bold border border-transparent cursor-pointer active:scale-95"
          >
            <LogOut className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        
        {/* Mobile Header Floating Style */}
        <header className="md:hidden flex items-center justify-between p-4.5 mx-4 mt-4 rounded-2xl border border-surface-200/30 dark:border-surface-800/30 bg-surface-50/50 dark:bg-surface-900/15 backdrop-blur-xl shadow-sm z-30">
          <div className="flex items-center gap-2.5">
            <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-flux-400 to-flux-600 flex items-center justify-center shadow-sm">
              <Logo className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-display font-black tracking-tight bg-gradient-to-r from-flux-600 to-flux-400 dark:from-flux-400 dark:to-flux-300 bg-clip-text text-transparent">
                Flux
              </span>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            className="p-2 rounded-xl text-surface-500 hover:text-red-500 dark:text-surface-400 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-800/40 transition-all duration-200 cursor-pointer active:scale-90"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Dynamic Inner page container */}
        <div className="flex-1 overflow-y-auto p-5 md:p-8 bg-transparent scrollbar-thin">
          <div className="pb-24 md:pb-0 h-full">
            <Outlet />
          </div>
        </div>

        {/* Mobile Navigation - Premium Floating Dock */}
        <div className="md:hidden fixed bottom-5 left-5 right-5 z-40 select-none">
          <nav className="flex items-center justify-around py-3 px-2 rounded-[2rem] border border-surface-200/40 dark:border-surface-800/40 bg-surface-50/70 dark:bg-surface-950/75 backdrop-blur-2xl shadow-[0_15px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_15px_30px_rgba(0,0,0,0.4)]">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 py-1.5 px-3.5 rounded-2xl transition-all duration-300 min-w-0 relative active:scale-90",
                    isActive 
                      ? "text-flux-600 dark:text-flux-400 scale-[1.08] font-bold" 
                      : "text-surface-450 dark:text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 transition-transform duration-200", isActive && "stroke-[2.5px]")} />
                  <span className="text-[9px] font-extrabold tracking-tight truncate uppercase leading-none">{item.name}</span>
                  {isActive && (
                    <span className="absolute -bottom-1 w-3 h-0.75 rounded-full bg-flux-500 shadow-sm shadow-flux-500 animate-pulse-glow" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </main>
    </div>
  );
}
