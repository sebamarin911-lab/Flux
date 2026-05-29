// Supabase Edge Function: process-wellbeing
// Procesa el RAG Personalizado para el Módulo de Bienestar y Agenda en Flux
// Soporta acciones: "init", "reflection" y "answer_question"
// Autenticación por Bearer Token e inferencia dual Groq (Llama 3.3) / Gemini (Flash) a coste $0.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EventDto {
  id: string;
  summary: string;
  completed: boolean;
  start_time?: string;
  location?: string;
}

// Interfaz para llamar al LLM
async function callLLM(systemPrompt: string, userPrompt: string, forceJson = true): Promise<string> {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY");

  // 1. Intentar con Groq API (Llama 3.3 70B)
  if (groqKey) {
    try {
      console.log("[LLM] Invocando Groq API (llama-3.3-70b-specdec)...");
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-specdec",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.25,
          response_format: forceJson ? { type: "json_object" } : undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
      console.warn(`[LLM] Error o respuesta vacía en Groq: ${response.status}`);
    } catch (err) {
      console.error("[LLM] Excepción llamando a Groq API:", err);
    }
  }

  // 2. Fallback a Gemini API (Gemini 2.5 Flash / 1.5 Flash)
  if (geminiKey) {
    try {
      console.log("[LLM] Invocando Gemini API (gemini-2.5-flash)...");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.25,
            responseMimeType: forceJson ? "application/json" : "text/plain"
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: `Instrucciones del Sistema:\n${systemPrompt}\n\nDatos de Entrada:\n${userPrompt}` }
              ]
            }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
      console.warn(`[LLM] Error o respuesta vacía en Gemini: ${response.status}`);
    } catch (err) {
      console.error("[LLM] Excepción llamando a Gemini API:", err);
    }
  }

  // 3. Fallback Resiliente final en caso de fallo absoluto de APIs externas
  console.error("[LLM] No hay llaves de API disponibles o fallaron. Retornando respuesta mock estructural.");
  if (forceJson) {
    return JSON.stringify({
      feedback: "Lo siento, hoy mi conexión con la nube está lenta, pero aquí estoy. Sigue adelante con tus metas y no olvides respetar tus bloques deportivos.",
      question: "¿Cómo te sientes respecto a tu consistencia hoy?",
      core_learnings_update: {},
      suggested_agenda_change: null
    });
  } else {
    return "Hola. ¿Cómo estuvo tu día? Escribe tu reflexión libre y directa.";
  }
}

serve(async (req) => {
  // 1. Manejar preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2. Obtener encabezado de Autorización
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Falta encabezado de autorización" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Inicializar Cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // 4. Validar sesión del usuario
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuario no autenticado", details: userError }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 5. Parsear cuerpo de la petición
    const body = await req.json();
    const { action, completed_events = [] } = body;

    // Obtener perfil RAG acumulativo del usuario
    let profileData: any = {};
    const { data: profileRow } = await supabase
      .from("user_rag_profile")
      .select("profile_data")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileRow) {
      profileData = profileRow.profile_data || {};
    }

    // Formatear eventos completados y pendientes para contextualizar
    const completedList = completed_events.map((e: EventDto) => 
      `- [${e.completed ? "COMPLETADO" : "PENDIENTE"}] ${e.summary} ${e.location ? `(Ubicación: ${e.location})` : ""}`
    ).join("\n");

    // ─────────────────────────────────────────────────────────────────
    // ACCIÓN: INIT (Carga inicial de WellbeingView para Icebreaker personalizado)
    // ─────────────────────────────────────────────────────────────────
    if (action === "init") {
      console.log(`[process-wellbeing] Iniciando sesión para usuario: ${user.id}`);

      // Comprobar eventos claves de hoy para atajar directamente
      const hasPsicologo = completed_events.some(
        (e: EventDto) => e.completed && /psicologo|psicólogo/i.test(e.summary)
      );
      
      const sportsEvents = completed_events.filter(
        (e: EventDto) => /gym|gimnasio|baby|fútbol|futbol|entrenar/i.test(e.summary)
      );

      // Regla de Negocio 3 & 4 (Psicólogo Hito e Inmutabilidad Deportiva)
      if (hasPsicologo) {
        return new Response(JSON.stringify({
          greeting: "Hoy tuviste Psicólogo, ¿cómo te sentiste?"
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Si hay bloques deportivos completados o ignorados (pendientes)
      if (sportsEvents.length > 0) {
        const comp = sportsEvents.find((e: EventDto) => e.completed);
        const pend = sportsEvents.find((e: EventDto) => !e.completed);
        
        if (comp) {
          return new Response(JSON.stringify({
            greeting: `Hoy completaste tu bloque deportivo de "${comp.summary}". ¿Cómo te dejó el entrenamiento hoy?`
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } else if (pend) {
          return new Response(JSON.stringify({
            greeting: `Hoy tenías programado "${pend.summary}" pero quedó pendiente. Recuerda que el deporte en Flux es inmutable. ¿Qué te impidió realizarlo?`
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      // RAG: Obtener las últimas 3 reflexiones guardadas para contextualizar el saludo
      const { data: lastReflections } = await supabase
        .from("daily_reflections")
        .select("reflection, feedback, reflection_date")
        .eq("user_id", user.id)
        .order("reflection_date", { ascending: false })
        .limit(3);

      const reflectionHistory = lastReflections && lastReflections.length > 0
        ? lastReflections.map((r: any) => `Fecha: ${r.reflection_date}\nReflexión: ${r.reflection}\nFeedback: ${r.feedback}`).join("\n\n")
        : "Sin historial de reflexiones aún.";

      // LLM Prompt para saludo personalizado basado en el RAG
      const systemPrompt = `
Eres la Inteligencia Artificial (Coach Personalizado) de "Flux", una PWA de productividad, deporte y psicología TCC.
Tu audiencia es un único usuario. Tu comunicación es directa, honesta, madura y sin rodeos. Evita discursos corporativos, saludos genéricos vacíos y tecnicismos psicológicos.
Tu tarea actual es generar una única pregunta inicial (icebreaker / saludo guiado) basada en las preferencias implícitas del usuario y su historial reciente.

Reglas del saludo:
- Debe ser una única frase o pregunta directa y empática de bienvenida.
- Máximo 25 palabras.
- Integra información de sus preferencias o de lo que conversaron en reflexiones previas si es relevante.

Preferencias Implícitas (RAG Profile) del usuario:
${JSON.stringify(profileData, null, 2)}

Historial Reciente de Reflexiones:
${reflectionHistory}

Eventos del día actual (marcados como COMPLETO o PENDIENTE):
${completedList}
      `;

      const greetingText = await callLLM(
        systemPrompt,
        "Genera la pregunta de bienvenida para esta noche.",
        false
      );

      return new Response(JSON.stringify({
        greeting: greetingText.trim().replace(/^"|"$/g, "")
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // ACCIÓN: REFLECTION (Procesa la reflexión y actualiza RAG y BD)
    // ─────────────────────────────────────────────────────────────────
    if (action === "reflection") {
      const { reflection, initial_question = null, initial_answer = null } = body;

      if (!reflection || reflection.trim() === "") {
        return new Response(JSON.stringify({ error: "La reflexión no puede estar vacía" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // RAG: Cargar reflexiones anteriores (últimas 5) para dar contexto continuo
      const { data: historyRows } = await supabase
        .from("daily_reflections")
        .select("reflection_date, reflection, feedback")
        .eq("user_id", user.id)
        .order("reflection_date", { ascending: false })
        .limit(5);

      const historyContext = historyRows && historyRows.length > 0
        ? historyRows.map((r: any) => `Fecha: ${r.reflection_date}\nReflexión: ${r.reflection}\nFeedback: ${r.feedback}`).join("\n\n")
        : "No hay reflexiones previas.";

      const systemPrompt = `
Eres la Inteligencia Artificial (Coach Personalizado) de "Flux".
Tu comunicación es directa, honesta, sin rodeos y sin rodeos corporativos ni discursos terapéuticos académicos.
Háblame con total honestidad y claridad.

Instrucciones de Feedback de Bienestar:
1. Analiza mi reflexión escrita hoy, la pregunta inicial que me hiciste y mi respuesta (si corresponde), junto con mis hitos y eventos del día.
2. Escribe una respuesta con feedback práctico, estructurada en un máximo de 3 párrafos.
3. OPCIONALMENTE, genera una única pregunta cerrada o muy directa al final para profundizar en el punto más crítico. Déjala en el campo "question". Si no es relevante, déjala como null.
4. Jamás sugieras cambios inmediatos en la agenda académica o deportiva en el texto.
5. Identifica preferencias implícitas, mañas o rutinas nuevas o reiteradas en base a mi comportamiento.
6. Si detectas con un nivel de confianza extremadamente alto (>80% de consistencia o reiteración explícita) que prefiero un cambio sistemático en la agenda (ej: cambiar los martes de Gym por Fútbol), inyecta la propuesta en el campo "suggested_agenda_change". De lo contrario, este campo DEBE ser null.

Reglas del Stack y Negocio de Flux:
- Inmutabilidad Deportiva: Los bloques de deporte son sagrados. Si el usuario los canceló, analízalo con seriedad pero sin rodeos.
- Filtro Universitario Geo-dependiente: La agenda universitaria depende del campus actual del usuario.

Debes devolver estrictamente un objeto JSON con la estructura:
{
  "feedback": "Tu feedback práctico (máximo 3 párrafos, directo, honesto, empático pero sin rodeos ni tecnicismos psicológicos)",
  "question": "Pregunta única cerrada/directa para profundizar (o null si no amerita)",
  "core_learnings_update": {
    "preferences": { "clave": "valor" }, // Preferencias encontradas (rutinas, gustos, lo que le funciona)
    "patterns": { "patron_recurrido": "explicacion" }, // Patrones conductuales (ej. lunes de flojera, procrastinación en tal ramo)
    "confidence_level": 0.85 // Nivel de confianza estimado (0.0 a 1.0)
  },
  "suggested_agenda_change": {
    "original_event": "Nombre de actividad original (ej: Gym)",
    "suggested_event": "Nombre de actividad sugerida (ej: Baby fútbol)",
    "reason": "Razón directa de por qué este cambio optimizará su consistencia (ej: 'Siempre cambias el gym por fútbol los martes si te cancelan X.')",
    "confidence": 0.85
  } (o null si no aplica con confianza > 80%)
}
      `;

      const userPrompt = `
Perfil de Preferencias Acumuladas Actual (RAG Profile):
${JSON.stringify(profileData, null, 2)}

Historial de reflexiones anteriores:
${historyContext}

Datos del Día de Hoy:
- Eventos completados y pendientes:
${completedList}

- Pregunta del Coach al abrir la sección: "${initial_question || 'Ninguna'}"
- Mi respuesta a esa pregunta (dentro de mi reflexión): "${initial_answer || 'No hubo respuesta dirigida'}"

- Mi Reflexión Escrita:
"${reflection}"
      `;

      const responseString = await callLLM(systemPrompt, userPrompt, true);
      let aiResult: any;
      try {
        aiResult = JSON.parse(responseString);
      } catch (parseErr) {
        console.error("[process-wellbeing] Error parseando respuesta JSON de IA:", parseStringError(responseString), parseErr);
        aiResult = {
          feedback: "Tu reflexión ha sido guardada. Sigue registrando tu introspección para mantener tus metas claras y respetar tus bloques inmutables.",
          question: null,
          core_learnings_update: {},
          suggested_agenda_change: null
        };
      }

      // Actualizar el perfil RAG acumulativo en user_rag_profile
      const rawUpdates = aiResult.core_learnings_update || {};
      const newPreferences = { ...(profileData.preferences || {}), ...(rawUpdates.preferences || {}) };
      const newPatterns = { ...(profileData.patterns || {}), ...(rawUpdates.patterns || {}) };
      
      const updatedProfile = {
        ...profileData,
        preferences: newPreferences,
        patterns: newPatterns,
        last_updated: new Date().toISOString()
      };

      // Guardar perfil RAG actualizado
      const { error: profileUpsertErr } = await supabase
        .from("user_rag_profile")
        .upsert({
          user_id: user.id,
          profile_data: updatedProfile,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      if (profileUpsertErr) {
        console.error("[process-wellbeing] Error actualizando user_rag_profile:", profileUpsertErr);
      } else {
        console.log("[process-wellbeing] Perfil RAG acumulativo actualizado con éxito.");
      }

      // Guardar reflexión diaria en daily_reflections
      const todayStr = new Date().toLocaleDateString("en-CA"); // Formato YYYY-MM-DD local
      const { error: reflectionUpsertErr } = await supabase
        .from("daily_reflections")
        .upsert({
          user_id: user.id,
          reflection_date: todayStr,
          reflection: reflection,
          feedback: aiResult.feedback,
          question: aiResult.question,
          question_answered: false,
          answer: null,
          completed_events: completed_events,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id,reflection_date" });

      if (reflectionUpsertErr) {
        console.error("[process-wellbeing] Error guardando reflexión en daily_reflections:", reflectionUpsertErr);
      }

      // Adicionalmente, guardamos en la tabla tradicional 'wellbeing_logs' para no romper funcionalidades existentes del frontend
      try {
        const { error: legacyErr } = await supabase
          .from("wellbeing_logs")
          .upsert({
            user_id: user.id,
            semana: todayStr,
            mental_score: body.mental_score || 3,
            notas: reflection
          }, { onConflict: "user_id,semana" });

        if (legacyErr) console.warn("[process-wellbeing] Advertencia guardando en tabla wellbeing_logs legado:", legacyErr);
      } catch (legacyEx) {
        console.warn("[process-wellbeing] Excepción guardando en tabla wellbeing_logs legado:", legacyEx);
      }

      return new Response(JSON.stringify(aiResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // ACCIÓN: ANSWER_QUESTION (Registra la respuesta a la pregunta del Coach)
    // ─────────────────────────────────────────────────────────────────
    if (action === "answer_question") {
      const { answer } = body;
      if (!answer || answer.trim() === "") {
        return new Response(JSON.stringify({ error: "La respuesta no puede estar vacía" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const todayStr = new Date().toLocaleDateString("en-CA");
      
      const { error: updateErr } = await supabase
        .from("daily_reflections")
        .update({
          question_answered: true,
          answer: answer,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id)
        .eq("reflection_date", todayStr);

      if (updateErr) {
        console.error("[process-wellbeing] Error actualizando respuesta a pregunta:", updateErr);
        return new Response(JSON.stringify({ error: "Error al registrar la respuesta", details: updateErr }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Actualizar perfil RAG de forma incremental incluyendo la nueva respuesta
      try {
        const updatedProfile = {
          ...profileData,
          last_followup_answer: answer,
          last_updated: new Date().toISOString()
        };

        await supabase
          .from("user_rag_profile")
          .upsert({
            user_id: user.id,
            profile_data: updatedProfile,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id" });
      } catch (ragErr) {
        console.warn("[process-wellbeing] Excepción menor actualizando RAG con respuesta de seguimiento:", ragErr);
      }

      return new Response(JSON.stringify({ success: true, message: "Respuesta de seguimiento guardada con éxito." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Acción no identificada
    return new Response(JSON.stringify({ error: "Acción inválida o no provista" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[process-wellbeing] Excepción general en Edge Function:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

function parseStringError(str: string): string {
  if (str.length > 100) return str.substring(0, 100) + "...";
  return str;
}
