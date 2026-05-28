import React, { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Activity, Flame, Trophy, ArrowRight, Clock, MapPin, Zap, Brain, TrendingUp, Sun, Moon, AlertCircle, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { format, parseISO, isToday, isBefore, startOfWeek, differenceInMinutes, addMinutes, startOfMinute } from 'date-fns';
import { es } from 'date-fns/locale';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { logger } from '@/lib/logger';
import { useFlux } from '@/context/FluxContext';

export function DashboardView() {
  const navigate = useNavigate();
  const {
    events,
    eventStatus,
    streakInfo,
    wellbeingLogs,
    loading: globalLoading,
    calendarError,
    refreshData,
    toggleEventCompletion,
    updateCalendarEvent,
    deleteCalendarEvent,
    saveWellbeingReflection
  } = useFlux();

  const [localLoading, setLocalLoading] = useState(false);
  const [userName, setUserName] = useState('');

  // Interactive Greeting & Tips & Mood track states
  const [vibeOverride, setVibeOverride] = useState<'morning' | 'afternoon' | 'evening' | null>(null);
  const [revealedTip, setRevealedTip] = useState<string | null>(null);
  const [tipPulse, setTipPulse] = useState(false);
  const [savingMood, setSavingMood] = useState(false);
  const [moodSuccess, setMoodSuccess] = useState(false);

  // Confetti / Celebration states
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebratedToday, setCelebratedToday] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Today's events
  const todayEvents = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return events.filter(e => {
      const dateStr = format(parseISO(e.start.dateTime || e.start.date), 'yyyy-MM-dd');
      return dateStr === todayStr;
    });
  }, [events]);

  const loading = globalLoading || localLoading;

  // Confirmation Dialog States
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    eventId: string;
    summary: string;
  }>({
    isOpen: false,
    eventId: '',
    summary: ''
  });

  const [rescheduleDialog, setRescheduleDialog] = useState<{
    isOpen: boolean;
    eventId: string;
    summary: string;
    suggestedTime: string;
    reason: string;
    eventToDelete: any;
  }>({
    isOpen: false,
    eventId: '',
    summary: '',
    suggestedTime: '',
    reason: '',
    eventToDelete: null
  });

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const name = userData.user.user_metadata?.full_name || userData.user.email?.split('@')[0] || '';
          setUserName(name.split(' ')[0]); // First name only
        }
      } catch (err) {
        logger.error('DashboardView', 'Error fetching user metadata', err);
      }
    }
    loadUser();
  }, []);

  // Today's wellbeing score from global logs
  const todayMentalScore = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayLog = wellbeingLogs.find(l => l.semana === today);
    return todayLog ? todayLog.mental_score : null;
  }, [wellbeingLogs]);

  // Weekly wellbeing log count from global logs
  const weeklyLogCount = useMemo(() => {
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return wellbeingLogs.filter(l => l.semana >= weekStart).length;
  }, [wellbeingLogs]);

  const handleDeleteEventClick = (id: string) => {
    const eventToDelete = events.find(e => e.id === id);
    if (!eventToDelete) return;
    setDeleteDialog({
      isOpen: true,
      eventId: id,
      summary: eventToDelete.summary
    });
  };

  const handleCancelDelete = () => {
    setDeleteDialog({ isOpen: false, eventId: '', summary: '' });
  };

  const handleConfirmDelete = async () => {
    const id = deleteDialog.eventId;
    const eventToDelete = events.find(e => e.id === id);
    setDeleteDialog({ isOpen: false, eventId: '', summary: '' });
    if (!eventToDelete) return;

    setLocalLoading(true);
    try {
      // 1. Intentar obtener la sugerencia de la IA
      try {
        const { getRescheduleSuggestion } = await import('@/lib/gemini');
        const suggestion = await getRescheduleSuggestion({ 
          current: eventToDelete.summary, 
          history: []
        });

        if (suggestion && suggestion.suggested_time) {
          setRescheduleDialog({
            isOpen: true,
            eventId: id,
            summary: eventToDelete.summary,
            suggestedTime: suggestion.suggested_time,
            reason: suggestion.reason,
            eventToDelete
          });
          return; // Retornamos temprano, el modal de reprogramación manejará el resto
        }
      } catch (geminiErr) {
        console.warn('No se pudo obtener sugerencia de la IA, eliminando de forma clásica:', geminiErr);
      }

      // 2. Si no hay sugerencia de la IA, se elimina definitivamente
      await deleteCalendarEvent(id);
    } catch (err) {
      alert('Error al eliminar el evento');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleConfirmReschedule = async () => {
    const { eventId, summary, suggestedTime, eventToDelete } = rescheduleDialog;
    setRescheduleDialog(prev => ({ ...prev, isOpen: false }));
    setLocalLoading(true);
    try {
      const baseDate = parseISO(eventToDelete.start.dateTime || eventToDelete.start.date);
      const [hours, mins] = suggestedTime.split(':').map(Number);
      const newStart = startOfMinute(baseDate);
      newStart.setHours(hours, mins);
      
      const duration = eventToDelete.end?.dateTime 
        ? differenceInMinutes(parseISO(eventToDelete.end.dateTime), parseISO(eventToDelete.start.dateTime))
        : 60;
      
      const newEnd = addMinutes(newStart, duration);

      await updateCalendarEvent(eventId, {
        summary: summary,
        startTime: newStart,
        endTime: newEnd
      });
    } catch (err) {
      alert('Error al reprogramar el evento');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDeclineReschedule = async () => {
    const { eventId } = rescheduleDialog;
    setRescheduleDialog(prev => ({ ...prev, isOpen: false }));
    setLocalLoading(true);
    try {
      // El usuario rechaza la postergación y prefiere eliminar definitivamente
      await deleteCalendarEvent(eventId);
    } catch (err) {
      alert('Error al eliminar el evento');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleEditEvent = async (event: any) => {
    const newTitle = prompt('Nuevo título:', event.summary);
    const newTime = prompt('Nueva hora (HH:mm):', format(parseISO(event.start.dateTime || event.start.date), 'HH:mm'));
    
    if (newTitle === null || newTime === null) return;

    try {
      const baseDate = parseISO(event.start.dateTime || event.start.date);
      const [hours, mins] = newTime.split(':').map(Number);
      const newStart = startOfMinute(baseDate);
      newStart.setHours(hours, mins);
      
      const duration = event.end?.dateTime 
        ? differenceInMinutes(parseISO(event.end.dateTime), parseISO(event.start.dateTime))
        : 60;
      
      const newEnd = addMinutes(newStart, duration);

      await updateCalendarEvent(event.id, {
        summary: newTitle,
        startTime: newStart,
        endTime: newEnd
      });
    } catch (err) {
      alert('Error al actualizar el evento. Asegúrate del formato HH:mm');
    }
  };

  const toggleEventComplete = async (id: string) => {
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
    await toggleEventCompletion(id);
  };

  // Racha Deportiva en Peligro: pasadas las 20:00, hay eventos hoy y están pendientes o falta actividad crítica
  const isStreakInDanger = useMemo(() => {
    const isPast20 = new Date().getHours() >= 20;
    if (todayEvents.length === 0) return false;

    const hasPendingEvents = !todayEvents.every(e => eventStatus[e.id]);
    const hasPendingCritical = todayEvents.some(
      e => !eventStatus[e.id] && /#gym|#babyfutbol|gym|baby futbol/i.test(e.summary || '')
    );

    return isPast20 && (hasPendingEvents || hasPendingCritical);
  }, [todayEvents, eventStatus]);

  const currentPeriod = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 19) return 'afternoon';
    return 'evening';
  }, []);

  const activePeriod = vibeOverride || currentPeriod;

  // Greeting based on active period
  const greeting = useMemo(() => {
    if (activePeriod === 'morning') {
      return { 
        text: '¡Buenos días!', 
        icon: '🌅', 
        desc: 'Un nuevo amanecer para conquistar tus metas.', 
        bg: 'from-amber-400 via-orange-500 to-pink-650 animate-glow-orange border-amber-300/20' 
      };
    }
    if (activePeriod === 'afternoon') {
      return { 
        text: '¡Buenas tardes!', 
        icon: '🌤️', 
        desc: 'Mantén el enfoque y el gran impulso de hoy.', 
        bg: 'from-teal-450 via-flux-600 to-indigo-650 animate-glow-teal border-teal-300/20' 
      };
    }
    return { 
      text: '¡Buenas noches!', 
      icon: '🌙', 
      desc: 'Es hora de descansar y agradecer tus logros.', 
      bg: 'from-indigo-950 via-purple-900 to-zinc-950 animate-glow-purple border-purple-500/20' 
    };
  }, [activePeriod]);

  // Next upcoming event (from now forward)
  const nextEvent = useMemo(() => {
    const now = new Date();
    return events.find(e => {
      const eventStart = new Date(e.start.dateTime || e.start.date);
      return eventStart > now;
    });
  }, [events]);

  // Time until next event
  const timeUntilNext = useMemo(() => {
    if (!nextEvent) return null;
    const now = new Date();
    const eventStart = new Date(nextEvent.start.dateTime || nextEvent.start.date);
    const mins = differenceInMinutes(eventStart, now);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hrs < 24) return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days} día${days > 1 ? 's' : ''}`;
  }, [nextEvent]);

  // Completed events from local state
  const completedStreaks = useMemo(() => {
    let gym = 0;
    let baby = 0;

    events.forEach(event => {
      if (!eventStatus[event.id]) return;
      const summary = event.summary?.toLowerCase() || '';
      if (summary.includes('gym')) gym++;
      if (summary.includes('baby')) baby++;
    });

    return { gym, baby };
  }, [events, eventStatus]);

  // Mental score emoji
  const mentalEmoji = (score: number | null) => {
    if (score === null) return '—';
    if (score <= 1) return '😞';
    if (score <= 2) return '😐';
    if (score <= 4) return '😌';
    return '⚡';
  };

  // Today's completed count
  const todayCompletedCount = useMemo(() => {
    return todayEvents.filter(e => eventStatus[e.id]).length;
  }, [todayEvents, eventStatus]);

  const allEventsCompleted = useMemo(() => {
    return todayEvents.length > 0 && todayCompletedCount === todayEvents.length;
  }, [todayEvents, todayCompletedCount]);

  useEffect(() => {
    if (allEventsCompleted && !celebratedToday) {
      setShowCelebration(true);
      setCelebratedToday(true);
    } else if (!allEventsCompleted) {
      setCelebratedToday(false);
      setShowCelebration(false);
    }
  }, [allEventsCompleted, celebratedToday]);

  interface ConfettiParticle {
    x: number;
    y: number;
    size: number;
    color: string;
    shape: 'circle' | 'square' | 'triangle' | 'emoji';
    emoji?: string;
    vx: number;
    vy: number;
    rotation: number;
    rotationSpeed: number;
    opacity: number;
  }

  useEffect(() => {
    if (!showCelebration || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const colors = ['#14b8a6', '#2dd4bf', '#a855f7', '#ec4899', '#f97316', '#ef4444', '#3b82f6', '#10b981'];
    const emojis = ['🎉', '🚀', '🏆', '🔥', '✨', '💯', '👑', '💪', '🎯'];
    const particles: ConfettiParticle[] = [];

    const spawnParticles = () => {
      // Left cannon
      for (let i = 0; i < 65; i++) {
        particles.push({
          x: 0,
          y: height + 20,
          size: 8 + Math.random() * 14,
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: Math.random() > 0.45 ? (Math.random() > 0.5 ? 'square' : 'circle') : (Math.random() > 0.5 ? 'triangle' : 'emoji'),
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
          vx: 6 + Math.random() * 14,
          vy: -(14 + Math.random() * 18),
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 12,
          opacity: 1
        });
      }
      // Right cannon
      for (let i = 0; i < 65; i++) {
        particles.push({
          x: width,
          y: height + 20,
          size: 8 + Math.random() * 14,
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: Math.random() > 0.45 ? (Math.random() > 0.5 ? 'square' : 'circle') : (Math.random() > 0.5 ? 'triangle' : 'emoji'),
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
          vx: -(6 + Math.random() * 14),
          vy: -(14 + Math.random() * 18),
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 12,
          opacity: 1
        });
      }
    };

    spawnParticles();

    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }

    const gravity = 0.45;
    const drag = 0.985;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      let active = false;

      for (let p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= drag;
        p.vy = p.vy * drag + gravity;
        p.rotation += p.rotationSpeed;

        if (p.y < height + 40 && p.opacity > 0) {
          active = true;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);

          if (p.shape === 'emoji' && p.emoji) {
            ctx.font = `${p.size * 1.5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.emoji, 0, 0);
          } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            if (p.shape === 'circle') {
              ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
              ctx.fill();
            } else if (p.shape === 'triangle') {
              ctx.moveTo(0, -p.size / 2);
              ctx.lineTo(p.size / 2, p.size / 2);
              ctx.lineTo(-p.size / 2, p.size / 2);
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            }
          }
          ctx.restore();

          if (p.y > height * 0.6) {
            p.opacity -= 0.015;
          }
        }
      }

      if (active) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    (window as any).reFireConfetti = () => {
      spawnParticles();
      if (navigator.vibrate) navigator.vibrate([100, 50, 150]);
    };

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      delete (window as any).reFireConfetti;
    };
  }, [showCelebration]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-flux-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 select-none">
      
      {/* High-Fidelity Interactive Greeting Widget (Mesh Gradient Backdrop) */}
      <div 
        onClick={() => {
          const dailyTips = [
            "💧 ¡Hidratación! Toma un vaso de agua ahora mismo para activar tu mente y cuerpo.",
            "⏱️ Regla de 2 Minutos: Si una tarea pendiente toma menos de 2 minutos, ¡hazla ahora!",
            "🧘 Respiro Consciente: Tómate 3 respiraciones lentas e inhalaciones profundas para calmar tu sistema.",
            "🚶 Estiramiento Express: Levántate y estira tus brazos y espalda por 30 segundos.",
            "👁️ Regla 20-20-20: Mira un objeto a 6 metros de distancia durante 20 segundos para relajar la vista.",
            "📝 Prioridad de Enfoque: Identifica tu meta número 1 de hoy y pon toda tu energía en ella primero.",
            "✨ Agradecimiento: Piensa en una sola cosa por la que estés agradecido en este instante.",
            "🎧 Enfoque Binaural: Escucha ruido blanco o música clásica para aislar distracciones y concentrarte.",
            "🔋 Siesta Energética: Si te sientes agotado, una siesta corta de 15 minutos reiniciará tu corteza prefrontal.",
            "🍏 Micro-Snack Saludable: Come un puñado de frutos secos o una fruta para un boost de energía."
          ];
          setRevealedTip(prev => prev ? null : dailyTips[new Date().getDay() % dailyTips.length]);
        }}
        className={`relative overflow-hidden rounded-[2.5rem] p-8 text-white shadow-[0_24px_50px_rgba(0,0,0,0.06)] bg-gradient-to-br ${greeting.bg} border group cursor-pointer active:scale-[0.988] md:hover:scale-[1.006] transition-all duration-300`}
      >
        {/* Modern backdrop glow elements */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/25 via-transparent to-transparent opacity-90 pointer-events-none" />
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-white/20 rounded-full blur-3xl group-hover:scale-135 transition-transform duration-500 pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-white/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur-xl px-4 py-2 rounded-full border border-white/15 shadow-sm text-white">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
            </span>
            
            {/* Interactive Switcher */}
            <div className="flex items-center gap-1 bg-white/10 backdrop-blur-xl p-1 rounded-2xl border border-white/10 pointer-events-auto">
              {(['morning', 'afternoon', 'evening'] as const).map((period) => {
                const label = period === 'morning' ? '🌅 Mañana' : period === 'afternoon' ? '🌤️ Tarde' : '🌙 Noche';
                return (
                  <button 
                    key={period}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if(navigator.vibrate) navigator.vibrate(10); 
                      setVibeOverride(period); 
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wide transition-all cursor-pointer ${
                      activePeriod === period 
                        ? 'bg-white text-surface-950 shadow-md scale-105' 
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {vibeOverride && (
                <button 
                  onClick={(e) => { e.stopPropagation(); if(navigator.vibrate) navigator.vibrate(12); setVibeOverride(null); }}
                  className="px-2 py-1.5 rounded-xl text-[10px] font-black text-white bg-white/20 hover:bg-white/30 transition-all cursor-pointer"
                  title="Reset a hora local"
                >
                  ⏱️
                </button>
              )}
            </div>
          </div>

          {/* Core Info */}
          <div className="space-y-2 mt-2">
            <h1 className="text-3xl sm:text-5xl font-display font-black tracking-tight leading-none">
              {greeting.text} <span className="underline decoration-wavy decoration-white/40">{userName}</span>! {greeting.icon}
            </h1>
            <p className="text-xs sm:text-sm font-semibold opacity-90 max-w-2xl leading-relaxed">
              {greeting.desc} Hoy tienes <span className="bg-white/25 px-2 py-0.5 rounded-lg font-black">{todayEvents.length - todayCompletedCount}</span> actividades pendientes de resolver en tu agenda.
            </p>
          </div>

          {/* Action Row */}
          <div className="flex gap-3 flex-shrink-0 pointer-events-auto mt-2">
            <Link 
              to="/agenda"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white text-surface-950 hover:bg-surface-50 rounded-2xl transition-all duration-300 font-black text-xs shadow-md active:scale-95"
            >
              <Calendar className="w-4 h-4 text-flux-600 stroke-[2.5px]" /> Mi Agenda
            </Link>

            <button 
              onClick={(e) => {
                e.stopPropagation();
                const dailyTips = [
                  "💧 ¡Hidratación! Toma un vaso de agua ahora mismo para activar tu mente y cuerpo.",
                  "⏱️ Regla de 2 Minutos: Si una tarea pendiente toma menos de 2 minutos, ¡hazla ahora!",
                  "🧘 Respiro Consciente: Tómate 3 respiraciones lentas e inhalaciones profundas para calmar tu sistema.",
                  "🚶 Estiramiento Express: Levántate y estira tus brazos y espalda por 30 segundos.",
                  "👁️ Regla 20-20-20: Mira un objeto a 6 metros de distancia durante 20 segundos para relajar la vista.",
                  "📝 Prioridad de Enfoque: Identifica tu meta número 1 de hoy y pon toda tu energía en ella primero.",
                  "✨ Agradecimiento: Piensa en una sola cosa por la que estés agradecido en este instante.",
                  "🎧 Enfoque Binaural: Escucha ruido blanco o música clásica para aislar distracciones y concentrarte.",
                  "🔋 Siesta Energética: Si te sientes agotado, una siesta corta de 15 minutos reiniciará tu corteza prefrontal.",
                  "🍏 Micro-Snack Saludable: Come un puñado de frutos secos o una fruta para un boost de energía."
                ];
                if (navigator.vibrate) navigator.vibrate(15);
                setRevealedTip(prev => prev ? null : dailyTips[new Date().getDay() % dailyTips.length]);
              }}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white/15 hover:bg-white/25 text-white border border-white/10 rounded-2xl transition-all duration-300 font-black text-xs shadow-md active:scale-95 cursor-pointer"
            >
              💡 {revealedTip ? 'Ocultar Consejo' : 'Ver Consejo'}
            </button>
          </div>

          {/* Quick Mood Tracker inside header panel */}
          <div className="pt-5 mt-2 border-t border-white/15 pointer-events-auto">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/95 mb-3 flex items-center gap-2">
              <span>¿CÓMO ESTÁ TU ENERGÍA EN ESTE MOMENTO?</span>
              {savingMood && <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>}
              {moodSuccess && <span className="text-green-300 font-black animate-bounce">¡Ánimo guardado! ✨</span>}
            </p>
            <div className="grid grid-cols-5 gap-2.5">
              {[
                { score: 1, emoji: '😞', label: 'Agotado' },
                { score: 2, emoji: '😐', label: 'Normal' },
                { score: 3, emoji: '😌', label: 'Enfoque' },
                { score: 4, emoji: '😊', label: 'Feliz' },
                { score: 5, emoji: '⚡', label: 'Imparable' }
              ].map((m) => {
                const isSelected = todayMentalScore === m.score;
                return (
                  <button
                    key={m.score}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (navigator.vibrate) navigator.vibrate(15);
                      setSavingMood(true);
                      setMoodSuccess(false);
                      try {
                        const ok = await saveWellbeingReflection(m.score, "");
                        if (ok) {
                          setMoodSuccess(true);
                          setTimeout(() => setMoodSuccess(false), 3000);
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setSavingMood(false);
                      }
                    }}
                    className={`flex flex-col items-center justify-center py-3.5 px-1 rounded-2xl border transition-all active:scale-[0.88] duration-300 cursor-pointer ${
                      isSelected 
                        ? 'bg-white text-surface-950 border-white shadow-xl scale-[1.04] font-black' 
                        : 'bg-white/10 text-white border-white/10 hover:bg-white/20 hover:border-white/15'
                    }`}
                  >
                    <span className="text-2xl mb-1.5 filter drop-shadow-md">{m.emoji}</span>
                    <span className="text-[8px] font-black tracking-wider uppercase opacity-90">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Revealed Tip Expandable block */}
        <div className={`relative z-10 transition-all duration-500 overflow-hidden ${
          revealedTip ? 'max-h-48 opacity-100 mt-5 pt-5 border-t border-white/15' : 'max-h-0 opacity-0'
        }`}>
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`relative bg-white/15 backdrop-blur-2xl border border-white/10 p-5 rounded-2xl pointer-events-auto transition-all duration-300 ${tipPulse ? 'scale-95 border-teal-300 bg-teal-500/20 animate-shake' : ''}`}
          >
            <p className="text-xs sm:text-sm font-bold leading-relaxed text-white">
              💡 {revealedTip}
            </p>
            <div className="flex justify-end mt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (navigator.vibrate) navigator.vibrate(15);
                  setTipPulse(true);
                  setTimeout(() => setTipPulse(false), 400);
                  const tips = [
                    "💧 ¡Hidratación! Toma un vaso de agua ahora mismo para activar tu mente y cuerpo.",
                    "⏱️ Regla de 2 Minutos: Si una tarea pendiente toma menos de 2 minutos, ¡hazla ahora!",
                    "🧘 Respiro Consciente: Tómate 3 respiraciones lentas e inhalaciones profundas para calmar tu sistema.",
                    "🚶 Estiramiento Express: Levántate y estira tus brazos y espalda por 30 segundos.",
                    "👁️ Regla 20-20-20: Mira un objeto a 6 metros de distancia durante 20 segundos para relajar la vista.",
                    "📝 Prioridad de Enfoque: Identifica tu meta número 1 de hoy y pon toda tu energía en ella primero.",
                    "✨ Agradecimiento: Piensa en una sola cosa por la que estés agradecido en este instante.",
                    "🎧 Enfoque Binaural: Escucha ruido blanco o música clásica para aislar distracciones y concentrarte.",
                    "🔋 Siesta Energética: Si te sientes agotado, una siesta corta de 15 minutos reiniciará tu corteza prefrontal.",
                    "🍏 Micro-Snack Saludable: Come un puñado de frutos secos o una fruta para un boost de energía."
                  ];
                  const availableTips = tips.filter(t => t !== revealedTip);
                  const nextTip = availableTips[Math.floor(Math.random() * availableTips.length)];
                  setRevealedTip(nextTip);
                }}
                className="px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-[9px] font-black transition-all border border-white/10 cursor-pointer active:scale-95 flex items-center gap-1 shadow-sm uppercase tracking-wider"
              >
                🔄 Siguiente Consejo
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Connection error panel */}
      {calendarError && (
        <div className="bg-red-500/10 border border-red-500/25 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-red-950 dark:text-red-300">Conexión con Google Calendar pausada</p>
              <p className="text-xs text-red-700/80 dark:text-red-400/80">{calendarError}</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              try {
                logger.info('Auth', 'Initiating Google Calendar silent/fast reconnection...');
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: window.location.origin,
                    scopes: 'https://www.googleapis.com/auth/calendar',
                    queryParams: {
                      access_type: 'offline',
                      prompt: 'consent',
                    },
                  },
                });
              } catch (err) {
                logger.error('Auth', 'Error initiating Google reconnection', err);
                alert('No se pudo iniciar la reconexión. Inténtalo de nuevo.');
              }
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-black rounded-2xl transition-all duration-300 shadow-md cursor-pointer whitespace-nowrap active:scale-95"
          >
            Reconectar Cuenta
          </button>
        </div>
      )}

      {/* Premium Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Racha Deportiva Centerpiece Card */}
        <div className={`p-6 rounded-[2rem] text-white relative overflow-hidden transition-all duration-500 flex flex-col justify-between group shadow-xl ${
          isStreakInDanger 
            ? 'bg-gradient-to-br from-red-600 via-orange-500 to-red-750 animate-pulse-slow border border-red-500/20' 
            : 'bg-gradient-to-br from-orange-500 via-amber-500 to-red-600 border border-white/10'
        }`}>
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/10 rounded-full blur-xl group-hover:scale-110 transition-transform duration-500"></div>
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-md"></div>
          
          <div className="relative z-10 flex flex-col h-full justify-between gap-5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
                {isStreakInDanger ? '⚠️ En Peligro' : '⚡ Racha Deportiva'}
              </span>
              <div className="w-8.5 h-8.5 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm">
                <Flame className={`w-4.5 h-4.5 text-white ${isStreakInDanger ? 'animate-bounce' : 'animate-pulse'}`} />
              </div>
            </div>

            <div className="my-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-black tracking-tight filter drop-shadow-md">
                  {streakInfo.current_streak}
                </span>
                <span className="text-xs font-black uppercase tracking-widest opacity-90">días activos</span>
              </div>
              <p className="text-[11px] opacity-85 mt-2.5 font-medium leading-relaxed">
                {isStreakInDanger 
                  ? '¡Completa tus metas deportivas hoy antes de medianoche para no perder la racha!' 
                  : streakInfo.current_streak > 0 
                    ? '¡Tu constancia deportiva es excelente! Sigue manteniendo viva la racha.' 
                    : '¡Comienza hoy completando tu primera meta deportiva!'}
              </p>
            </div>

            <div className="pt-3.5 border-t border-white/25 flex items-center justify-between text-xs font-bold">
              <span className="opacity-75">Récord Histórico:</span>
              <span className="flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full border border-white/15">
                <Trophy className="w-3.5 h-3.5 text-yellow-300" /> {streakInfo.max_racha_historica}
              </span>
            </div>
          </div>
        </div>

        {/* Next Event Card */}
        <div className="bg-gradient-to-br from-teal-600 via-flux-600 to-flux-700 text-white p-6 rounded-[2rem] shadow-xl relative overflow-hidden flex flex-col justify-between border border-white/10 group">
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-white/10 rounded-full blur-xl group-hover:scale-110 transition-transform duration-500"></div>
          <div className="relative z-10 flex flex-col h-full justify-between gap-5">
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <span className="text-[9px] font-black text-flux-100 uppercase tracking-widest bg-white/15 backdrop-blur-sm px-3.5 py-1.5 rounded-full">Próximo Evento</span>
                <div className="w-8.5 h-8.5 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm">
                  <Clock className="w-4 h-4 text-flux-200" />
                </div>
              </div>
              {nextEvent ? (
                <>
                  <h3 className="text-xl font-black mb-1.5 truncate leading-snug tracking-tight">{nextEvent.summary}</h3>
                  <div className="flex flex-col gap-1.5 text-flux-100 text-xs mt-3">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Clock className="w-4 h-4 text-teal-200" />
                      {nextEvent.start.dateTime 
                        ? format(parseISO(nextEvent.start.dateTime), 'HH:mm')
                        : 'Todo el día'
                      }
                    </span>
                    {nextEvent.location && (
                      <span className="flex items-center gap-1.5 truncate opacity-90">
                        <MapPin className="w-4 h-4 text-teal-200" />
                        {nextEvent.location}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-flux-100 text-xs mt-2 leading-relaxed font-semibold">No hay eventos programados próximamente. ¡Disfruta tu tiempo libre!</p>
              )}
            </div>
            {nextEvent && timeUntilNext && (
              <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-xl text-[10px] font-black w-fit shadow-sm shadow-black/5 animate-pulse-slow uppercase tracking-widest">
                <Zap className="w-3.5 h-3.5 text-yellow-300" /> En {timeUntilNext}
              </div>
            )}
          </div>
        </div>

        {/* Today Progress */}
        <div className="glass-card p-6 rounded-[2rem] shadow-sm flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-surface-450 dark:text-surface-400 uppercase tracking-widest">Completado Hoy</span>
              <div className="w-8.5 h-8.5 rounded-full bg-surface-100 dark:bg-surface-850 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-flux-500 animate-pulse" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 mt-3.5">
              <span className="text-5xl font-black text-surface-900 dark:text-white tracking-tight">
                {todayCompletedCount}
              </span>
              <span className="text-xs font-black text-surface-400">/ {todayEvents.length}</span>
            </div>
          </div>
          <div>
            <div className="w-full bg-surface-100 dark:bg-surface-850 h-2 rounded-full overflow-hidden shadow-inner">
              <div 
                className="bg-gradient-to-r from-flux-550 to-flux-400 h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${todayEvents.length > 0 ? (todayCompletedCount / todayEvents.length) * 100 : 0}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-surface-450 dark:text-surface-400 mt-3 font-black uppercase tracking-wider">
              {todayEvents.length > 0 ? `${Math.round((todayCompletedCount / todayEvents.length) * 100)}% Completado` : 'Día libre de compromisos'}
            </p>
          </div>
        </div>

        {/* Mental Health */}
        <div className="glass-card p-6 rounded-[2rem] shadow-sm flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-surface-450 dark:text-surface-400 uppercase tracking-widest">Energía Mental</span>
              <div className="w-8.5 h-8.5 rounded-full bg-purple-50 dark:bg-purple-950/20 flex items-center justify-center">
                <Brain className="w-4 h-4 text-purple-500" />
              </div>
            </div>
            <div className="flex items-center gap-3.5 mt-3.5">
              <div className="text-4xl bg-surface-50 dark:bg-surface-900/50 w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner border border-surface-150/10 dark:border-surface-850/10">
                {mentalEmoji(todayMentalScore)}
              </div>
              <div>
                <p className="text-lg font-black text-surface-900 dark:text-white leading-none">
                  {todayMentalScore !== null ? `${todayMentalScore} / 5` : 'Sin Registro'}
                </p>
                <p className="text-[9px] text-surface-450 dark:text-surface-400 font-extrabold uppercase tracking-wider mt-1.5">
                  {weeklyLogCount} check-ins semanales
                </p>
              </div>
            </div>
          </div>
          <Link 
            to="/wellbeing"
            className="text-[10px] font-black text-flux-600 dark:text-flux-400 uppercase tracking-wider hover:underline flex items-center gap-1 w-fit hover:translate-x-0.5 transition-transform"
          >
            Registrar sentir <ArrowRight className="w-4 h-4 stroke-[2.5px]" />
          </Link>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Today's Schedule Card */}
        <div className="lg:col-span-2 glass-card p-6 rounded-[2rem] shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-surface-200/20 dark:border-surface-800/15">
            <h2 className="text-lg font-black flex items-center gap-2.5 text-surface-900 dark:text-white">
              <div className="w-1.5 h-5 rounded-full bg-flux-500 shadow-sm" />
              Actividades de Hoy
            </h2>
            <Link to="/agenda" className="text-xs font-black uppercase tracking-wider text-flux-600 dark:text-flux-400 hover:underline flex items-center gap-1 transition-all">
              Ver Agenda <ArrowRight className="w-4 h-4 stroke-[2.5px]" />
            </Link>
          </div>

          {todayEvents.length > 0 ? (
            <div className="space-y-3.5">
              {allEventsCompleted && (
                <div className="p-6 bg-gradient-to-br from-emerald-500/10 via-green-500/5 to-teal-500/10 rounded-3xl border border-emerald-500/20 text-center relative overflow-hidden shadow-inner group mb-2.5">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-[40px] pointer-events-none animate-pulse-slow"></div>
                  <span className="text-4xl block mb-2 transition-transform duration-300 group-hover:scale-110">👑</span>
                  <h4 className="text-base font-black text-emerald-600 dark:text-emerald-400 tracking-tight uppercase tracking-wider">¡Día Conquistado!</h4>
                  <p className="text-xs text-surface-600 dark:text-surface-300 leading-relaxed font-semibold mt-2.5">
                    Has completado el 100% de tus actividades asignadas para hoy. Tu disciplina es inquebrantable.
                  </p>
                </div>
              )}
              {todayEvents.map((event: any) => {
                const start = event.start.dateTime;
                const end = event.end.dateTime;
                const isNow = start && new Date(start) <= new Date() && new Date(end) > new Date();
                const isCompleted = eventStatus[event.id] || false;

                return (
                  <div 
                    key={event.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 rounded-2xl border transition-all duration-300 group relative ${
                      isNow && !isCompleted
                        ? 'border-flux-500/40 bg-flux-500/5 dark:bg-flux-500/10 shadow-sm ring-1 ring-flux-500/15' 
                        : 'border-surface-100/55 dark:border-surface-850/30 hover:border-surface-200/50 dark:hover:border-surface-800/40 bg-white/40 dark:bg-surface-900/10 hover:bg-white/80 dark:hover:bg-surface-900/25'
                    } ${isCompleted ? 'opacity-55 bg-surface-50/20 dark:bg-surface-900/5 hover:opacity-75' : ''}`}
                  >
                    {/* Status accent indicator line */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${
                      isNow && !isCompleted ? 'bg-flux-500 animate-pulse' : isCompleted ? 'bg-green-500' : 'bg-surface-250 dark:bg-surface-800'
                    }`} />

                    {/* Event Info */}
                    <div className="flex items-center gap-4 flex-1 min-w-0 w-full pl-2">
                      <div className="flex-shrink-0 text-center min-w-[3.75rem] bg-surface-100/50 dark:bg-surface-900/40 p-2.5 rounded-xl border border-surface-200/30 dark:border-surface-800/15">
                        {start ? (
                          <>
                            <p className={`text-sm font-black tracking-tight ${isNow ? 'text-flux-600 dark:text-flux-400 animate-pulse' : 'text-surface-900 dark:text-surface-100'}`}>
                              {format(parseISO(start), 'HH:mm')}
                            </p>
                            <p className="text-[10px] text-surface-450 dark:text-surface-500 font-bold mt-0.5">{format(parseISO(end), 'HH:mm')}</p>
                          </>
                        ) : (
                          <p className="text-[10px] font-black text-flux-600 dark:text-flux-400 uppercase tracking-widest leading-none">Todo el día</p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-bold truncate ${isNow ? 'text-flux-700 dark:text-flux-300' : 'text-surface-900 dark:text-surface-100'} ${isCompleted ? 'line-through text-surface-400 dark:text-surface-500 font-semibold' : ''}`}>
                            {event.summary}
                          </p>
                          {isNow && !isCompleted && (
                            <span className="flex-shrink-0 text-[8px] font-black uppercase tracking-widest bg-flux-500 text-white px-2 py-0.5 rounded-lg shadow-sm animate-pulse">
                              En Curso
                            </span>
                          )}
                        </div>
                        {event.location && (
                          <p className="text-xs text-surface-500 dark:text-surface-450 flex items-center gap-1.5 mt-2 font-bold truncate">
                            <MapPin className="w-3.5 h-3.5 text-flux-500" /> {event.location}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions Panel */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t border-surface-200/20 dark:border-surface-800/15 pt-3 sm:border-0 sm:pt-0 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-all duration-300">
                      <button 
                        onClick={() => toggleEventComplete(event.id)}
                        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3.5 sm:p-2 rounded-xl transition-all duration-200 text-xs font-bold cursor-pointer active:scale-95 ${
                          isCompleted 
                            ? 'text-green-600 bg-green-500/10 dark:bg-green-500/20 hover:bg-green-500/15' 
                            : 'text-surface-600 dark:text-surface-300 bg-surface-100/50 dark:bg-surface-800/40 hover:bg-flux-500 hover:text-white dark:hover:bg-flux-500 sm:bg-transparent sm:dark:bg-transparent'
                        }`}
                        title="Completar"
                      >
                        <CheckCircle2 className="w-4 h-4 stroke-[2.5px]" />
                        <span className="sm:hidden">Completar</span>
                      </button>
                      
                      <button 
                        onClick={() => handleEditEvent(event)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3.5 sm:p-2 text-xs font-bold text-surface-600 dark:text-surface-300 bg-surface-100/50 dark:bg-surface-800/40 hover:text-flux-600 hover:bg-flux-500/15 rounded-xl transition-all duration-200 sm:bg-transparent sm:dark:bg-transparent cursor-pointer active:scale-95"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4 stroke-[2px]" />
                        <span className="sm:hidden">Editar</span>
                      </button>
                      
                      <button 
                        onClick={() => handleDeleteEventClick(event.id)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 py-2 px-3.5 sm:p-2 text-xs font-bold text-surface-600 dark:text-surface-300 bg-surface-100/50 dark:bg-surface-800/40 hover:text-red-500 hover:bg-red-500/15 rounded-xl transition-all duration-200 sm:bg-transparent sm:dark:bg-transparent cursor-pointer active:scale-95"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4 stroke-[2px]" />
                        <span className="sm:hidden">Eliminar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-16 flex-1 border border-dashed border-surface-200 dark:border-surface-800 rounded-3xl bg-surface-50/20 dark:bg-surface-900/5 p-6">
              <Calendar className="w-12 h-12 mb-3.5 text-surface-300 dark:text-surface-700" />
              <p className="font-bold text-surface-600 dark:text-surface-400">Día libre de actividades</p>
              <p className="text-xs text-surface-450 dark:text-surface-500 mt-1 max-w-xs leading-relaxed">Tómate un respiro y relájate, o planifica nuevas metas en tu agenda.</p>
            </div>
          )}
        </div>

        {/* Sidebar Actions & Shortcuts */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-[2rem] border border-surface-150/10 dark:border-surface-800/20 shadow-sm">
            <h3 className="text-xs font-black text-surface-450 dark:text-surface-400 uppercase tracking-widest mb-5">Enlaces Premium</h3>
            <div className="space-y-3">
              <Link 
                to="/agenda"
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-surface-100/40 dark:bg-surface-900/20 hover:bg-flux-500/10 hover:translate-x-1 border border-surface-150/5 dark:border-surface-850/5 hover:border-flux-500/20 transition-all duration-300 group"
              >
                <div className="w-9 h-9 rounded-xl bg-flux-50 dark:bg-flux-900/40 flex items-center justify-center text-flux-600 dark:text-flux-400 group-hover:scale-105 transition-transform">
                  <Calendar className="w-4 h-4 stroke-[2px]" />
                </div>
                <span className="text-sm font-bold text-surface-750 dark:text-surface-300">Mi Agenda Semanal</span>
                <ArrowRight className="w-4 h-4 text-surface-400 ml-auto group-hover:translate-x-0.5 transition-transform stroke-[2px]" />
              </Link>
              <Link 
                to="/wellbeing"
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-surface-100/40 dark:bg-surface-900/20 hover:bg-purple-500/10 hover:translate-x-1 border border-surface-150/5 dark:border-surface-850/5 hover:border-purple-500/20 transition-all duration-300 group"
              >
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                  <Brain className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-surface-750 dark:text-surface-300">Descarga Mental & IA</span>
                <ArrowRight className="w-4 h-4 text-surface-400 ml-auto group-hover:translate-x-0.5 transition-transform stroke-[2px]" />
              </Link>
              <Link 
                to="/report"
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-surface-100/40 dark:bg-surface-900/20 hover:bg-green-500/10 hover:translate-x-1 border border-surface-150/5 dark:border-surface-850/5 hover:border-green-500/20 transition-all duration-300 group"
              >
                <div className="w-9 h-9 rounded-xl bg-green-50 dark:bg-green-950/40 flex items-center justify-center text-green-600 dark:text-green-400 group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-4 h-4 stroke-[2px]" />
                </div>
                <span className="text-sm font-bold text-surface-750 dark:text-surface-300">Reporte Semanal</span>
                <ArrowRight className="w-4 h-4 text-surface-400 ml-auto group-hover:translate-x-0.5 transition-transform stroke-[2px]" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        title="¿Eliminar evento?"
        message={
          <p className="text-sm leading-relaxed">
            ¿Estás seguro de que deseas eliminar el evento <strong>"{deleteDialog.summary}"</strong> de tu agenda?
          </p>
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        onClose={handleCancelDelete}
      />

      <ConfirmationDialog
        isOpen={rescheduleDialog.isOpen}
        title="🤖 Sugerencia de la IA"
        isAiSuggestion={true}
        message={
          <div className="space-y-4">
            <p className="text-sm">
              ¿Deseas postergar <strong>"{rescheduleDialog.summary}"</strong> a las <strong>{rescheduleDialog.suggestedTime}</strong>?
            </p>
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-xs sm:text-sm text-purple-750 dark:text-purple-300 italic shadow-inner leading-relaxed">
              💡 Razón: {rescheduleDialog.reason}
            </div>
            <p className="text-xs text-surface-450 leading-relaxed font-semibold">
              👉 Presiona <strong>"Aceptar"</strong> para reprogramar automáticamente a la hora sugerida.
              <br />
              👉 Presiona <strong>"Eliminar"</strong> para descartar de forma definitiva.
            </p>
          </div>
        }
        confirmLabel="Aceptar"
        cancelLabel="Eliminar"
        confirmVariant="primary"
        onConfirm={handleConfirmReschedule}
        onCancel={handleDeclineReschedule}
        onClose={() => setRescheduleDialog(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Celebration overlay */}
      {showCelebration && (
        <>
          <canvas 
            ref={canvasRef} 
            className="fixed inset-0 pointer-events-none z-45 w-full h-full"
          />

          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-300">
            <div className="glass-card p-8 rounded-[2.5rem] border border-green-500/30 bg-zinc-950/95 dark:bg-black/95 backdrop-blur-2xl shadow-[0_0_60px_rgba(16,185,129,0.35)] text-center animate-in zoom-in-95 duration-300 max-w-xs sm:max-w-sm pointer-events-auto">
              <span className="text-5xl block mb-3 animate-bounce">👑</span>
              <h3 className="text-xl font-black text-white tracking-tight">¡Día Completado!</h3>
              <p className="text-xs text-green-400 font-extrabold uppercase tracking-widest mt-1.5">¡Constancia Legendaria! 🔥</p>
              <p className="text-xs text-slate-300 leading-relaxed font-semibold mt-3.5">
                Has completado el 100% de tus actividades de hoy. Sigue así, la disciplina es el motor del éxito.
              </p>
              <div className="flex gap-2.5 mt-6">
                <button 
                  onClick={() => {
                    if ((window as any).reFireConfetti) {
                      (window as any).reFireConfetti();
                    }
                  }} 
                  className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/15 cursor-pointer active:scale-95 uppercase tracking-wider"
                >
                  ¡Lanzar más! 🎉
                </button>
                <button 
                  onClick={() => setShowCelebration(false)} 
                  className="flex-1 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer active:scale-95 uppercase tracking-wider"
                >
                  ¡Excelente!
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
