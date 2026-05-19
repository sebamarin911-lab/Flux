import { z } from 'zod';
import { logger } from './logger';
import {
  WeeklySummarySchema,
  MorningBriefSchema,
  RescheduleSuggestionSchema,
  AutoTagsSchema,
  FlowRecoverySchema,
  EvolutionSchema,
  DailyInsightSchema,
  safeValidate
} from './validation';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// ─── IndexedDB Cache Setup ──────────────────────────────────────────
const DB_NAME = 'FluxAICache';
const STORE_NAME = 'gemini_responses';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedResponse(key: string): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Check TTL (24 hours)
          const age = Date.now() - result.timestamp;
          if (age < 24 * 60 * 60 * 1000) {
            resolve(result.data);
            return;
          }
        }
        resolve(null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.warn('Gemini DB', 'Error reading cache', err);
    return null;
  }
}

async function setCachedResponse(key: string, data: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ key, data, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.warn('Gemini DB', 'Error writing cache', err);
  }
}

async function hashString(str: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Usage Logging ───────────────────────────────────────────────
function logUsage(promptHash: string, tokensEstimados: number) {
  try {
    const logStr = localStorage.getItem('ai_usage_log') || '[]';
    const log = JSON.parse(logStr);
    log.push({ timestamp: Date.now(), promptHash, tokensEstimados });
    if (log.length > 100) log.shift();
    localStorage.setItem('ai_usage_log', JSON.stringify(log));
  } catch (e) {
    logger.warn('Gemini', 'Could not log AI usage metrics', e);
  }
}

// ─── Core HTTP Client with Zod Validation ─────────────────────────────
async function callGemini(
  prompt: string,
  context: any,
  fallback: any,
  schema?: z.ZodSchema
): Promise<any> {
  if (!GEMINI_API_KEY) {
    logger.warn('Gemini', 'VITE_GEMINI_API_KEY is not defined, using mock fallback.');
    return fallback;
  }

  logger.info('Gemini', 'Initiating call to Gemini 1.5 Flash...');
  try {
    const contextStr = JSON.stringify(context);
    const dateStr = new Date().toISOString().split('T')[0];
    const rawHashStr = `${prompt}-${contextStr}`;
    const hash = await hashString(rawHashStr);
    const cacheKey = `ai_cache:${dateStr}:${hash}`;

    const cached = await getCachedResponse(cacheKey);
    if (cached) {
      logger.info('Gemini', 'Cache hit. Returning cached AI response.');
      if (schema) {
        const validated = schema.safeParse(cached);
        if (validated.success) return validated.data;
        logger.warn('Gemini', 'Cached item failed fresh validation, refetching...');
      } else {
        return cached;
      }
    }

    const payload = {
      generationConfig: {
        maxOutputTokens: 180,
        temperature: 0.25,
        responseMimeType: "application/json"
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { text: `Contexto: ${contextStr}` }
          ]
        }
      ]
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!resultText) {
      throw new Error('Empty response payload from Gemini API');
    }

    const parsed = JSON.parse(resultText);

    // Validate structured response schema to guarantee interface type safety with safeValidate fallback
    if (schema) {
      const validated = safeValidate(schema, parsed, fallback, 'GeminiAI');
      logUsage(hash, Math.ceil(resultText.length / 4));
      await setCachedResponse(cacheKey, validated);
      logger.info('Gemini', 'AI response successfully validated and cached.');
      return validated;
    }

    logUsage(hash, Math.ceil(resultText.length / 4));
    await setCachedResponse(cacheKey, parsed);
    return parsed;
  } catch (err) {
    logger.error('Gemini', 'Error calling API, returning safe fallback data', err);
    return fallback;
  }
}

// ─── 5 Instancias de Inteligencia Artificial ───────────────────────

/**
 * [1] RESUMEN SEMANAL
 * Context: { sliders: { mental: number, fisico: number }, notes: string, streak: number }
 */
export async function getWeeklySummary(context: any) {
  const prompt = "Analiza los sliders y las notas cualitativas de bienestar del usuario. Devuelve estrictamente un objeto JSON con la siguiente estructura: { trend: 'up'|'down'|'stable', top_fatigue: string, micro_tip: string, next_focus: string }. Restringe la salida a un máximo de 150 tokens. Tono: Amigo cercano y empático.";
  const fallback = WeeklySummarySchema.parse({});
  return callGemini(prompt, context, fallback, WeeklySummarySchema);
}

/**
 * [2] BRIEF MATUTINO
 * Context: { events: string[], streak: number, last_mood: number }
 */
export async function getMorningBrief(context: any) {
  const prompt = "Genera una única línea de texto optimizada para una notificación push en pantalla bloqueada. Une el primer evento del día y la racha actual del usuario. Si last_mood es menor que 3, utiliza un tono calmado y sutil; de lo contrario, utiliza un tono energético. Devuelve estrictamente este formato JSON: { notification: string, tone: 'calm'|'energetic' }.";
  const fallback = MorningBriefSchema.parse({});
  return callGemini(prompt, context, fallback, MorningBriefSchema);
}

/**
 * [3] SUGERENCIA DE REAGENDAMIENTO
 * Context: { current: string, history: string[] }
 */
export async function getRescheduleSuggestion(context: any) {
  const prompt = "Analizando el evento modificado actual y el historial de cumplimiento del usuario contenido en el contexto, propone una hora alternativa específica para este mismo día que maximice la adherencia histórica. Devuelve estrictamente el formato JSON: { suggested_time: 'HH:MM', reason: string }.";
  const fallback = RescheduleSuggestionSchema.parse({});
  return callGemini(prompt, context, fallback, RescheduleSuggestionSchema);
}

/**
 * [4] ETIQUETADO AUTOMÁTICO
 * Context: { note: string }
 */
export async function getAutoTags(context: any) {
  const prompt = "Analiza el siguiente texto de reflexión personal y extrae un máximo de 3 etiquetas conceptuales o temáticas relevantes junto con el tema principal de la nota. Devuelve estrictamente el formato JSON: { tags: ['string'], primary_theme: 'string' }.";
  const fallback = AutoTagsSchema.parse({});
  return callGemini(prompt, context, fallback, AutoTagsSchema);
}

/**
 * [5] MODO RECUPERACIÓN DE FLUJO
 * Context: { status: 'receso'|'streak_broken', days_off: number, last_mood: number }
 */
export async function getFlowRecovery(context: any) {
  const prompt = "Genera una lista de 3 micro-hábitos ultra-cortos (menores a 15 minutos) diseñados específicamente para recuperar el ritmo diario o mantener la disciplina sin abrumar al usuario. Devuelve estrictamente el formato JSON: { habits: [{ title: string, duration: string, why: string }] }.";
  const fallback = FlowRecoverySchema.parse({});
  return callGemini(prompt, context, fallback, FlowRecoverySchema);
}

/**
 * [6] TU EVOLUCIÓN SEMANAL
 * Context: { history: string[] }
 */
export async function getEvolutionAnalysis(context: any) {
  const prompt = "Analiza el historial de textos de reflexión personal del usuario. Genera un resumen honesto y crudo en una única oración concisa sobre sus avances, estado de ánimo o patrones de agotamiento mental detectados en los últimos días. Devuelve estrictamente el formato JSON: { evolution: string }.";
  const fallback = EvolutionSchema.parse({});
  return callGemini(prompt, context, fallback, EvolutionSchema);
}

/**
 * [7] INSIGHT DEL DÍA
 * Context: { todayNote: string, history: string[] }
 */
export async function getDailyInsight(context: any) {
  const prompt = "Analizando la reflexión escrita hoy por el usuario y sus notas históricas de bienestar, genera una frase corta (de menos de 20 palabras) que le brinde un 'insight' profundo, filosófico o una perspectiva inesperada sobre su día para incentivar su introspección. Evita clichés vacíos. Devuelve estrictamente el formato JSON: { insight: string }.";
  const fallback = DailyInsightSchema.parse({});
  return callGemini(prompt, context, fallback, DailyInsightSchema);
}
