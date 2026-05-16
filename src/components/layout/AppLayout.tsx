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
      <aside className="hidden md:flex w-64 flex-col border-r border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-950">
        <div className="p-6 flex items-center gap-3">
          <Logo className="w-8 h-8" />
          <span className="text-xl font-display font-semibold tracking-tight">Flux</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive 
                    ? "bg-flux-50 text-flux-600 dark:bg-flux-900/50 dark:text-flux-400 font-medium" 
                    : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-surface-100 dark:border-surface-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-surface-600 dark:text-surface-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-950">
          <div className="flex items-center gap-2">
            <Logo className="w-6 h-6" />
            <span className="text-lg font-display font-semibold">Flux</span>
          </div>
          <button onClick={handleLogout} className="p-2 text-surface-500 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-50">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white dark:bg-surface-900">
          <Outlet />
        </div>

        {/* Mobile Navigation */}
        <nav className="md:hidden flex items-center justify-around p-2 border-t border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-950">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-colors min-w-0",
                  isActive 
                    ? "text-flux-600 dark:text-flux-400" 
                    : "text-surface-500 dark:text-surface-400"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
