// Supabase Edge Function: daily-agenda-push
// This can be invoked by a cron job or manually to send each user
// their daily agenda summary as a push notification.
//
// Set up cron in Supabase Dashboard > Edge Functions > Schedule:
//   Cron expression: 0 11 * * *  (every day at 7:00 AM Chile time / 11:00 UTC)

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users who have push subscriptions
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth");

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No subscriptions to notify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by user
    const userSubs = subscriptions.reduce((acc: Record<string, any[]>, sub) => {
      if (!acc[sub.user_id]) acc[sub.user_id] = [];
      acc[sub.user_id].push(sub);
      return acc;
    }, {});

    // For each user, send their push notification via the send-push-notification function
    const sendPushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
    
    const results = await Promise.allSettled(
      Object.keys(userSubs).map(async (userId) => {
        const response = await fetch(sendPushUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            title: "📋 Tu Agenda de Hoy",
            body: "Revisa tus eventos y tareas del día. ¡Que tengas un día productivo!",
            url: "/agenda",
            tag: "daily-agenda",
          }),
        });
        return { userId, status: response.status };
      })
    );

    return new Response(
      JSON.stringify({ users_notified: Object.keys(userSubs).length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
