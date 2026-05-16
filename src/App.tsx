import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardView } from '@/views/DashboardView';
import { AgendaView } from '@/views/AgendaView';
import { WellbeingView } from '@/views/WellbeingView';
import { WeeklyReportView } from '@/views/WeeklyReportView';
import { SettingsView } from '@/views/SettingsView';
import { LoginView } from '@/views/LoginView';
import { requestNotificationPermission, scheduleNightlyReminder } from '@/lib/notifications';
import { subscribeToPush } from '@/lib/pushSubscription';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Initialize notifications when logged in
  useEffect(() => {
    if (session) {
      requestNotificationPermission().then((granted) => {
        if (granted) {
          scheduleNightlyReminder();
          // Subscribe to real push notifications (Service Worker + Push API)
          subscribeToPush();
        }
      });
    }
  }, [session]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-flux-500"></div>
      </div>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardView />} />
          <Route path="/agenda" element={<AgendaView />} />
          <Route path="/wellbeing" element={<WellbeingView />} />
          <Route path="/report" element={<WeeklyReportView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
