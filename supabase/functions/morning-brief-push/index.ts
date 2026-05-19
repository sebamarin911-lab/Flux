// Supabase Edge Function: morning-brief-push
// Generates an AI morning brief via Gemini 1.5 Flash using server-side context (wellbeing, streaks)
// and pushes it to the user's locked screen at 7:30 AM local time.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("VITE_GEMINI_API_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Get active subscriptions grouped by user
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint");

    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active subscriptions found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uniqueUsers = Array.from(new Set(subscriptions.map(s => s.user_id)));
    const sendPushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;

    const results = await Promise.allSettled(
      uniqueUsers.map(async (userId) => {
        // 2. Fetch recent wellbeing data for this user to feed into Gemini context
        const { data: recentLogs } = await supabase
          .from("wellbeing_logs")
          .select("mental_score, physical_score, notes, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(3);

        let lastMood = 3;
        let lastNotes = "";
        if (recentLogs && recentLogs.length > 0) {
          lastMood = recentLogs[0].mental_score || 3;
          lastNotes = recentLogs.map(l => l.notes).filter(Boolean).join(". ");
        }

        // 3. Request dynamic short greeting from Gemini
        let notificationText = "Comienza tu mañana con Flux. Revisa tu agenda y cuida tu paz mental.";
        
        if (geminiApiKey) {
          try {
            const prompt = `Genera un saludo matutino ultra-corto (máximo 110 caracteres) para un usuario de una app de productividad.
Contexto del usuario:
- Su último puntaje de bienestar mental (escala 1-5): ${lastMood}
- Notas recientes de su diario: "${lastNotes.substring(0, 200)}"

Reglas:
- Sé empático, inspirador y directo.
- NO uses más de 110 caracteres totales.
- Si su ánimo reciente es bajo (< 3), dale un mensaje suave y reconfortante, enfocado en dar un paso pequeño a la vez.
- Si su ánimo es alto, sé enérgico y motivador.
- Devuelve únicamente el texto del saludo en un JSON con formato exacto: {"greeting": "tu mensaje aquí"}`;

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
            const geminiResponse = await fetch(geminiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
              })
            });

            if (geminiResponse.ok) {
              const resData = await geminiResponse.json();
              const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                const parsed = JSON.parse(text);
                if (parsed.greeting) notificationText = parsed.greeting;
              }
            }
          } catch (geminiError) {
            console.error(`Gemini failed for user ${userId}:`, geminiError);
          }
        }

        // 4. Trigger send-push-notification Edge Function
        const pushRes = await fetch(sendPushUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title: "🌞 Tu Brief Matutino",
            body: notificationText,
            url: "/",
            tag: "morning-brief",
          }),
        });

        return { userId, status: pushRes.status, text: notificationText };
      })
    );

    return new Response(
      JSON.stringify({ users_notified: uniqueUsers.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
