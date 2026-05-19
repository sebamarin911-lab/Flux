import { z } from 'zod';
import { logger } from './logger';

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

// New AI Validation Schemas
export const EvolutionSchema = z.object({
  evolution: z.string().default('Continúa registrando tu sentir para perfilar tu evolución emocional.')
});

export const CognitiveReframingSchema = z.object({
  distortion_detected: z.string().default('Ninguna detectada'),
  explanation: z.string().default('Tu pensamiento parece objetivo y equilibrado hoy.'),
  reframing: z.string().default('Continúa cultivando este enfoque compasivo y constructivo.'),
  actions: z.array(z.string()).max(3).default([
    'Respira hondo y felicítate por tu honestidad.',
    'Dedica 5 minutos a una actividad que disfrutes.',
    'Sigue registrando tu sentir cuando lo necesites.'
  ])
});

export type CognitiveReframing = z.infer<typeof CognitiveReframingSchema>;

// ─── Wellbeing Logs Validation ──────────────────────────────────────
export const WellbeingLogSchema = z.object({
  user_id: z.string().uuid("user_id debe ser un UUID válido"),
  semana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "semana debe ser YYYY-MM-DD"),
  mental_score: z.number().int().min(1).max(5),
  notas: z.string().max(4000).optional().default('')
});

// ─── Completed Events & Streaks Validation ───────────────────────────
export const CompletedEventSchema = z.object({
  event_id: z.string(),
  completed: z.boolean(),
  user_id: z.string().uuid().optional()
});

export const StreakSchema = z.object({
  current_streak: z.number().int().nonnegative().default(0),
  max_racha_historica: z.number().int().nonnegative().default(0),
  last_completed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Debe ser YYYY-MM-DD").nullable().default(null)
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

// ─── Telemetry Log & Safe Validation Utility ──────────────────────────

/**
 * Validates data against a Zod schema. If validation fails, it intercepts the error,
 * writes a detailed report to localStorage.flux_debug_logs, logs to standard telemetry,
 * and returns the pre-defined safe fallback object to avoid any crash.
 */
export function safeValidate<T extends z.ZodTypeAny>(
  schema: T,
  data: any,
  fallback: z.infer<T>,
  contextName: string
): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const errorMessage = `Zod Validation Failed for [${contextName}]`;
  const errorDetails = {
    errors: result.error.issues,
    dataReceived: data,
    timestamp: new Date().toISOString()
  };

  // Telemetry log inside system errors
  logger.error(contextName, errorMessage, errorDetails);

  // Detailed debug log inside localStorage.flux_debug_logs
  try {
    const existingLogsStr = localStorage.getItem('flux_debug_logs') || '[]';
    const logs = JSON.parse(existingLogsStr);
    logs.push({
      timestamp: new Date().toISOString(),
      context: contextName,
      message: errorMessage,
      errors: result.error.issues.map((e: any) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code
      })),
      received: data
    });
    // Limit to last 50 debug records
    if (logs.length > 50) logs.shift();
    localStorage.setItem('flux_debug_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save flux_debug_logs to localStorage', e);
  }

  return fallback;
}
