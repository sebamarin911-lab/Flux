// Supabase Edge Function: ios-widget
// Optimized for iOS Lock Screen widget rendering. Responds strictly with plain text (max 3 lines).
// Query format: /ios-widget?user_id=TU_UUID

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS Headers for HTTP GET request from lock screen widgets
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Internal Cache System (5 minutes cache key: user_id)
interface CacheEntry {
  content: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper to format ISO timestamps or custom times cleanly to HH:MM
function formatTime(timeStr?: string): string {
  if (!timeStr) return "";
  // Check if it's already in HH:MM format
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) return timeStr.substring(0, 5);

  try {
    const date = new Date(timeStr);
    if (!isNaN(date.getTime())) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  } catch {
    // Graceful fallback if parser fails
  }
  return timeStr;
}

serve(async (req) => {
  // 1. Handle CORS Preflight OPTIONS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. Only allow GET requests
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { 
      status: 405, 
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" } 
    });
  }

  try {
    // 3. Extract user_id from query string
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return new Response("Error: Falta el parámetro 'user_id' en la consulta.", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // 4. Check Internal Cache
    const cached = cache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[Cache Hit] Serving cached lockscreen widget content for user: ${userId}`);
      return new Response(cached.content, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=300"
        }
      });
    }

    // 5. Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 6. Query Streaks Table (with ultra-safe grace/fallback lookups)
    let streak = 0;
    let recesoActivo = false;

    try {
      const { data: streakData, error: streakError } = await supabase
        .from("streaks")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!streakError && streakData) {
        streak = streakData.current_streak || streakData.streak || 0;
        recesoActivo = streakData.receso_activo || streakData.in_receso || streakData.receso || streakData.receso_universitario || false;
      }
    } catch (err) {
      console.warn(`[Graceful Degrade] Could not read strengths/receso from table:`, err);
    }

    // 7. Query Daily Checklists Table (retrieving uncompleted events of today)
    let sortedChecklist: any[] = [];
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: checklistData, error: checklistError } = await supabase
        .from("daily_checklists")
        .select("*")
        .eq("user_id", userId)
        .eq("completed", false);

      if (!checklistError && checklistData && checklistData.length > 0) {
        // Sort in memory by time to prevent SQL errors if start_time / time is structured differently
        sortedChecklist = checklistData.sort((a: any, b: any) => {
          const timeA = a.start_time || a.time || a.hour || a.start?.dateTime || "";
          const timeB = b.start_time || b.time || b.hour || b.start?.dateTime || "";
          return timeA.localeCompare(timeB);
        });
      }
    } catch (err) {
      console.warn(`[Graceful Degrade] Could not read daily checklists table:`, err);
    }

    // 8. Render exactly 3 lines of output matching the target layout
    const lines: string[] = [];

    // Line 1: Streak / Recess Status
    const dayWord = streak === 1 ? "día" : "días";
    if (recesoActivo) {
      lines.push(`🔥 ${streak} ${dayWord} | 🌴 Receso Activo`);
    } else {
      lines.push(`🔥 ${streak} ${dayWord} de racha`);
    }

    // Line 2 & 3: Events rendering
    if (sortedChecklist.length > 0) {
      // First upcoming event
      const firstEvent = sortedChecklist[0];
      const firstTitle = firstEvent.title || firstEvent.summary || firstEvent.name || firstEvent.event_name || "Sin título";
      const firstTime = formatTime(firstEvent.start_time || firstEvent.time || firstEvent.hour || firstEvent.start?.dateTime);
      lines.push(`⏱️ ${firstTime ? `${firstTime} - ` : ""}${firstTitle}`);

      // Second upcoming event or default phrase
      if (sortedChecklist.length > 1) {
        const secondEvent = sortedChecklist[1];
        const secondTitle = secondEvent.title || secondEvent.summary || secondEvent.name || secondEvent.event_name || "Sin título";
        const secondTime = formatTime(secondEvent.start_time || secondEvent.time || secondEvent.hour || secondEvent.start?.dateTime);
        lines.push(`${secondTime ? `${secondTime} - ` : ""}${secondTitle}`);
      } else {
        lines.push("¡Sigue así, vas muy bien!");
      }
    } else {
      // Fallback if no tasks remaining
      lines.push("⏱️ Sin actividades hoy");
      lines.push(recesoActivo ? "¡Disfruta el descanso!" : "¡Día libre, relájate!");
    }

    // Join with simple newlines (Strictly plain text)
    const responseText = lines.slice(0, 3).join("\n");

    // 9. Update Cache
    cache.set(userId, {
      content: responseText,
      expiresAt: Date.now() + CACHE_TTL
    });

    console.log(`[Cache Stored] Lockscreen content cached for user: ${userId}`);

    // 10. Respond
    return new Response(responseText, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300"
      }
    });

  } catch (err) {
    console.error(`[Edge Function Error]`, err);
    return new Response(`🔥 Racha: N/A\n⏱️ Error cargando eventos\nConsulte soporte de Flux`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
  }
});
