// Supabase Edge Function: process-wellbeing
// Procesa el RAG Personalizado para el Módulo de Bienestar y Agenda en Flux
// Soporta acciones: "init", "reflection", "answer_question", "evolution", "reschedule"
// Autenticación por Bearer Token e inferencia SECURE en el Servidor con Groq (Llama 3.3) a coste $0.

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

// Inferencia obligatoria con Groq API (Llama 3.3 70B) a coste $0
async function callGroq(systemPrompt: string, userPrompt: string, forceJson = true): Promise<string> {
  const groqKey = Deno.env.get("GROQ_API_KEY");

  if (!groqKey) {
    console.error("[Groq] ERROR: GROQ_API_KEY no está configurada en los secretos de Supabase.");
    // Fallback resiliente simulado de contingencia por falta de credenciales
    if (forceJson) {
      return JSON.stringify({
        feedback: "Configuración incompleta. Asegúrate de registrar tu GROQ_API_KEY en Supabase secrets para activar a tu Coach de IA.",
        question: null,
        core_learnings_update: {},
        suggested_agenda_change: null
      });
    }
    return "Hola. ¿Cómo estuvo tu día? Recuerda configurar tu GROQ_API_KEY en Supabase.";
  }

  try {
    console.log("[Groq] Invocando Groq API (llama-3.3-70b-specdec)...");
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
    throw new Error(`Groq API retornó status ${response.status}`);
  } catch (err) {
    console.error("[Groq] Error en inferencia:", err);
    throw err;
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
      `- [${e.completed ? "COMPLETADO" : "PENDIENTE"}] ${e.summary} ${e.start_time ? `(Hora: ${e.start_time})` : ""} ${e.location ? `(Ubicación: ${e.location})` : ""}`
    ).join("\n");

    // ─────────────────────────────────────────────────────────────────
    // ACCIÓN: INIT (Carga inicial de WellbeingView para Icebreaker personalizado)
    // ─────────────────────────────────────────────────────────────────
    if (action === "init") {
      try {
        console.log(`[process-wellbeing] Carga inicial (init) para usuario: ${user.id}`);
        const now = new Date();

        // Comprobar eventos claves de hoy para atajar directamente
        const hasPsicologo = completed_events.some(
          (e: EventDto) => e.completed && /psicologo|psicólogo/i.test(e.summary)
        );
        
        const sportsEvents = completed_events.filter(
          (e: EventDto) => /gym|gimnasio|baby|fútbol|futbol|entrenar/i.test(e.summary)
        );

        // Regla de Negocio: Psicólogo Completado Hito
        if (hasPsicologo) {
          return new Response(JSON.stringify({
            greeting: "Hoy tuviste Psicólogo, ¿cómo te sentiste?"
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Regla de Negocio: Bloques Deportivos Inmutables (Garantizar persistencia con la hora)
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
            // Comprobar si el evento deportivo pendiente es futuro (aún no ha pasado en la hora del usuario)
            let isFuture = false;
            if (pend.start_time) {
              try {
                const eventStart = new Date(pend.start_time);
                if (!isNaN(eventStart.getTime())) {
                  // Si la hora actual es antes del inicio de la actividad, es un bloque futuro
                  if (now.getTime() < eventStart.getTime()) {
                    isFuture = true;
                  }
                }
              } catch (err) {
                console.warn("[process-wellbeing] Error parseando fecha en init:", err);
              }
            }

            if (isFuture) {
              return new Response(JSON.stringify({
                greeting: `Hoy tienes programado "${pend.summary}". Recuerda que los bloques deportivos en Flux son inmutables. ¡Prepárate para darlo todo a la hora pactada!`
              }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            } else {
              // El evento deportivo ya pasó o debería haber pasado, efectivamente quedó pendiente
              return new Response(JSON.stringify({
                greeting: `Hoy tenías programado "${pend.summary}" pero quedó pendiente. Recuerda que el deporte en Flux es inmutable. ¿Qué te impidió realizarlo?`
              }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            }
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
Tu audiencia es un único usuario. Tu comunicación es directa, honesta, madura y sin rodeos. Evita saludos genéricos vacíos y tecnicismos psicológicos.
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

        const greetingText = await callGroq(
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
      } catch (err) {
        console.error("[process-wellbeing] Error en acción init:", err);
        return new Response(JSON.stringify({
          greeting: "¿Cómo estuvo tu día? Escribe tu reflexión libre y directa."
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
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

      try {
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
Tu comunicación es directa, honesta, sin rodeos y sin discursos terapéuticos académicos. Háblame con total honestidad y claridad.

Instrucciones de Feedback de Bienestar:
1. Analiza mi reflexión escrita hoy, la pregunta inicial que me hiciste y mi respuesta (si corresponde), junto con mis hitos y eventos del día.
2. Escribe una respuesta con feedback práctico, estructurada en un máximo de 3 párrafos.
3. OPCIONALMENTE, genera una única pregunta cerrada o muy directa al final para profundizar en el punto más crítico. Déjala en el campo "question". Si no es relevante, déjala como null.
4. Jamás sugieras cambios inmediatos en la agenda académica o deportiva en el texto.
5. Identifica preferencias implícitas, mañas o rutinas nuevas o de cambios conscientes. Ten presente que a veces el usuario puede cambiar conscientemente "Baby fútbol" por "Gym" (o viceversa) según sus dinámicas; acógelo con naturalidad si es el caso y aprende de este patrón.
6. Si encuentras un patrón de cambio conductual repetitivo con un nivel de confianza extremadamente alto (>80% de consistencia o reiteración explícita) que prefiero un cambio sistemático en la agenda, inyecta la propuesta en el campo "suggested_agenda_change". De lo contrario, este campo DEBE ser null.

Reglas del Stack y Negocio de Flux:
- Inmutabilidad Deportiva: Los bloques de deporte son sagrados. Si el usuario los canceló, analízalo con seriedad pero sin rodeos.
- Filtro Universitario Geo-dependiente: La agenda universitaria depende del campus actual del usuario.

Debes devolver estrictamente un objeto JSON con la estructura:
{
  "feedback": "Tu feedback práctico (máximo 3 párrafos, directo, honesto, empático pero sin rodeos ni tecnicismos psicológicos)",
  "question": "Pregunta única cerrada/directa para profundizar (o null si no amerita)",
  "core_learnings_update": {
    "preferences": { "clave": "valor" }, // Preferencias encontradas (rutinas, gustos, lo que le funciona)
    "patterns": { "patron_recurrido": "explicacion" }, // Patrones conductuales (ej. cambios lunes de gym por fútbol)
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

        const responseString = await callGroq(systemPrompt, userPrompt, true);
        let aiResult: any;
        try {
          aiResult = JSON.parse(responseString);
        } catch (parseErr) {
          console.error("[process-wellbeing] Error parseando respuesta JSON de IA:", responseString, parseErr);
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

        if (profileUpsertErr) console.error("[process-wellbeing] Error actualizando user_rag_profile:", profileUpsertErr);

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

        if (reflectionUpsertErr) console.error("[process-wellbeing] Error guardando reflexión:", reflectionUpsertErr);

        // Guardado legado en wellbeing_logs para no romper dependencias históricas
        try {
          await supabase.from("wellbeing_logs").upsert({
            user_id: user.id,
            semana: todayStr,
            mental_score: body.mental_score || 3,
            notas: reflection
          }, { onConflict: "user_id,semana" });
        } catch (legacyEx) {
          console.warn("[process-wellbeing] Excepción guardando en legacy logs:", legacyEx);
        }

        return new Response(JSON.stringify(aiResult), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("[process-wellbeing] Error en acción reflection:", err);
        
        // Intentar al menos guardar localmente de forma básica para persistir el diario sin IA
        const todayStr = new Date().toLocaleDateString("en-CA");
        try {
          await supabase.from("daily_reflections").upsert({
            user_id: user.id,
            reflection_date: todayStr,
            reflection: reflection,
            feedback: "Tu reflexión ha sido guardada. Sigue registrando tu introspección para mantener tus metas claras.",
            question: null,
            question_answered: false,
            answer: null,
            completed_events: completed_events,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id,reflection_date" });

          await supabase.from("wellbeing_logs").upsert({
            user_id: user.id,
            semana: todayStr,
            mental_score: body.mental_score || 3,
            notas: reflection
          }, { onConflict: "user_id,semana" });
        } catch (dbErr) {
          console.error("[process-wellbeing] Falló intento de guardado de emergencia:", dbErr);
        }

        return new Response(JSON.stringify({
          feedback: "Tu reflexión ha sido registrada con éxito. Tu Coach de IA se encuentra momentáneamente en mantenimiento de cuotas, pero tu registro de bienestar ha sido persistido de forma segura.",
          question: null,
          core_learnings_update: {},
          suggested_agenda_change: null
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
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

      try {
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

        if (updateErr) throw updateErr;

        // Actualizar perfil RAG
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
          console.warn("[process-wellbeing] Excepción actualizando RAG con respuesta:", ragErr);
        }

        return new Response(JSON.stringify({ success: true, message: "Respuesta registrada." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("[process-wellbeing] Error en acción answer_question:", err);
        return new Response(JSON.stringify({ success: false, message: "No se pudo registrar la respuesta en este momento debido a un error." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // ACCIÓN: EVOLUTION (Historial de evolución cualitativa segura)
    // ─────────────────────────────────────────────────────────────────
    if (action === "evolution") {
      try {
        const { history = [] } = body;
        const historyText = history.slice(0, 10).map((h: string, idx: number) => `${idx + 1}. "${h}"`).join("\n");

        const systemPrompt = `
Eres la Inteligencia Artificial (Coach Personalizado) de "Flux". Tu comunicación es directa, honesta, sin rodeos y sin jerga psicológica académica.
Analiza el historial de textos de reflexión personal del usuario.
Genera un resumen honesto y crudo en una única oración concisa sobre sus avances, estado de ánimo o patrones de agotamiento mental detectados en los últimos días.
Devuelve estrictamente un objeto JSON con la estructura:
{
  "evolution": "Tu resumen crudo en una única frase concisa (máximo 30 palabras)."
}
        `;

        const responseText = await callGroq(systemPrompt, `Historial:\n${historyText}`, true);
        let evolutionResult = { evolution: "Tu sentir va tomando forma. Sigue expresando tus reflexiones a diario." };
        try {
          evolutionResult = JSON.parse(responseText);
        } catch {
          // Fallback si falla el parseo
        }

        return new Response(JSON.stringify(evolutionResult), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("[process-wellbeing] Error en acción evolution:", err);
        return new Response(JSON.stringify({
          evolution: "Tu sentir va tomando forma de manera constante. Sigue registrando tus reflexiones para perfilar tu evolución emocional."
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // ACCIÓN: RESCHEDULE (Sugerencia de reprogramación de eventos)
    // ─────────────────────────────────────────────────────────────────
    if (action === "reschedule") {
      try {
        const { current, history = [] } = body;

        const systemPrompt = `
Eres la Inteligencia Artificial (Coach Personalizado) de "Flux". Tu comunicación es directa, sin rodeos ni tecnicismos.
Analizando el evento modificado actual y el historial de cumplimiento, propone una hora alternativa específica para este mismo día que maximice la adherencia histórica.
Devuelve estrictamente un objeto JSON con la estructura:
{
  "suggested_time": "HH:MM", // Formato estricto de 24 horas (ej. 19:30)
  "reason": "Razón corta y sumamente práctica en español de por qué es la mejor hora."
}
        `;

        const responseText = await callGroq(systemPrompt, `Evento modificado: "${current}"\nHistorial: ${JSON.stringify(history)}`, true);
        let rescheduleResult = { suggested_time: "18:00", reason: "Horario estándar sugerido por consistencia." };
        try {
          rescheduleResult = JSON.parse(responseText);
        } catch {
          // Fallback
        }

        return new Response(JSON.stringify(rescheduleResult), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("[process-wellbeing] Error en acción reschedule:", err);
        return new Response(JSON.stringify({
          suggested_time: "18:00",
          reason: "Horario estándar sugerido para resguardar tus bloques deportivos inmutables."
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Acción inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[process-wellbeing] Excepción general:", err);
    return new Response(JSON.stringify({ 
      error: "Error Interno del Servidor", 
      details: err.message,
      greeting: "¿Cómo estuvo tu día? Escribe tu reflexión libre y directa.",
      evolution: "Tu sentir va tomando forma de manera constante. Sigue registrando tus reflexiones para perfilar tu evolución emocional.",
      feedback: "Tu reflexión ha sido registrada con éxito. Tu Coach de IA se encuentra momentáneamente en mantenimiento de cuotas, pero tu registro de bienestar ha sido persistido de forma segura.",
      question: null,
      suggested_agenda_change: null,
      success: false
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
