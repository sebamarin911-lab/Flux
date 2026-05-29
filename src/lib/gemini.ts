import { supabase } from './supabase';
import { logger } from './logger';
import {
  WeeklySummarySchema,
  MorningBriefSchema,
  RescheduleSuggestionSchema,
  AutoTagsSchema,
  FlowRecoverySchema,
  EvolutionSchema,
  CognitiveReframingSchema
} from './validation';

/**
 * [1] TU EVOLUCIÓN SEMANAL
 * Se ejecuta de manera segura en la nube (Edge Function) a través de Groq.
 */
export async function getEvolutionAnalysis(context: { history: string[] }) {
  try {
    console.log("[RAG-Client] Invocando getEvolutionAnalysis en la Edge Function...");
    const { data, error } = await supabase.functions.invoke('process-wellbeing', {
      body: {
        action: 'evolution',
        history: context.history
      }
    });

    if (error) throw error;
    return EvolutionSchema.parse(data);
  } catch (err) {
    logger.error('RAG-Client', 'Error al invocar getEvolutionAnalysis en el servidor:', err);
    return EvolutionSchema.parse({});
  }
}

/**
 * [2] SUGERENCIA DE REAGENDAMIENTO
 * Se ejecuta de manera segura en la nube (Edge Function) a través de Groq.
 */
export async function getRescheduleSuggestion(context: { current: string; history: string[] }) {
  try {
    console.log("[RAG-Client] Invocando getRescheduleSuggestion en la Edge Function...");
    const { data, error } = await supabase.functions.invoke('process-wellbeing', {
      body: {
        action: 'reschedule',
        current: context.current,
        history: context.history
      }
    });

    if (error) throw error;
    return RescheduleSuggestionSchema.parse(data);
  } catch (err) {
    logger.error('RAG-Client', 'Error al invocar getRescheduleSuggestion en el servidor:', err);
    return RescheduleSuggestionSchema.parse({});
  }
}

// ─── Funciones Legado Stubeadas a coste $0 con validación Zod ─────────────────────────

export async function getWeeklySummary(context: any) {
  return WeeklySummarySchema.parse({});
}

export async function getMorningBrief(context: any) {
  return MorningBriefSchema.parse({});
}

export async function getAutoTags(context: any) {
  return AutoTagsSchema.parse({});
}

export async function getFlowRecovery(context: any) {
  return FlowRecoverySchema.parse({});
}

export async function getCognitiveReframing(context: any) {
  return CognitiveReframingSchema.parse({});
}
