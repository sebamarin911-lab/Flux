import { z } from 'zod';

// ─── Google Calendar API Validation ──────────────────────────────────
export const GoogleEventTimeSchema = z.object({
  dateTime: z.string().datetime({ offset: true }).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Debe ser YYYY-MM-DD").optional(),
  timeZone: z.string().optional()
});

export const GoogleEventSchema = z.object({
  id: z.string(),
  summary: z.string().default('Sin Título'),
  description: z.string().optional(),
  location: z.string().optional(),
  start: GoogleEventTimeSchema,
  end: GoogleEventTimeSchema,
  status: z.string().optional()
});

export type GoogleEvent = z.infer<typeof GoogleEventSchema>;

// ─── Gemini AI Responses Validation ──────────────────────────────────
export const WeeklySummarySchema = z.object({
  trend: z.enum(['up', 'down', 'stable']).default('stable'),
  top_fatigue: z.string().default('No determinada'),
  micro_tip: z.string().default('Mantén el ritmo de tus hábitos base.'),
  next_focus: z.string().default('Consistencia')
});

export const MorningBriefSchema = z.object({
  notification: z.string().default('Comienza tu día revisando tu agenda en Flux.'),
  tone: z.enum(['calm', 'energetic']).default('calm')
});

export const RescheduleSuggestionSchema = z.object({
  suggested_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato sugerido debe ser HH:MM").default('18:00'),
  reason: z.string().default('Horario estándar de alta disponibilidad.')
});

export const AutoTagsSchema = z.object({
  tags: z.array(z.string()).max(3).default(['Bienestar']),
  primary_theme: z.string().default('Registro General')
});

export const FlowRecoverySchema = z.object({
  habits: z.array(
    z.object({
      title: z.string(),
      duration: z.string(),
      why: z.string()
    })
  ).min(1).default([
    { title: "Planificación", duration: "5 min", why: "Revisar la agenda base para retomar control." }
  ])
});

// ─── Wellbeing Logs Validation ──────────────────────────────────────
export const WellbeingLogSchema = z.object({
  user_id: z.string().uuid("user_id debe ser un UUID válido"),
  semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "semana debe ser YYYY-MM-DD"),
  mental_score: z.number().int().min(1).max(5),
  notas: z.string().max(4000).optional().default('')
});

// ─── Push Subscription Validation ────────────────────────────────────
export const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(10, "Clave p256dh inválida o muy corta"),
  auth: z.string().min(5, "Clave auth inválida o muy corta")
});

export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url("Endpoint de suscripción debe ser una URL válida"),
  keys: PushSubscriptionKeysSchema
});
