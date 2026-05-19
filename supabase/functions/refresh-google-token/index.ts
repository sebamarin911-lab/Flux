// Supabase Edge Function: refresh-google-token
// Verifies user session JWT, fetches the stored refresh_token from user_tokens table,
// and requests a fresh access_token from Google OAuth.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
      status: 405, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Authenticate user from the request token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create Supabase client with user token to authenticate and load user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session", details: authError?.message }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 2. Fetch the stored refresh token from the database
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: tokenData, error: dbError } = await adminClient
      .from("user_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) {
      return new Response(JSON.stringify({ error: "Database error fetching refresh token", details: dbError.message }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (!tokenData || !tokenData.refresh_token) {
      return new Response(JSON.stringify({ error: "No Google refresh token stored. Please reconnect Google Calendar." }), { 
        status: 404, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 3. Load Google Client credentials
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      console.error("Missing environment variables: GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET");
      return new Response(JSON.stringify({ 
        error: "Server configuration error. Google OAuth credentials are not configured in Supabase Edge Functions." 
      }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 4. Request new Access Token from Google OAuth
    const googleResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error(`Google Token API returned error: status ${googleResponse.status}`, errorText);
      return new Response(JSON.stringify({ 
        error: "Google token refresh failed", 
        details: errorText 
      }), { 
        status: googleResponse.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const googleData = await googleResponse.json();
    const newAccessToken = googleData.access_token;
    const newRefreshToken = googleData.refresh_token;

    // 5. If Google returned a new refresh_token, persist it
    if (newRefreshToken) {
      const { error: saveError } = await adminClient
        .from("user_tokens")
        .upsert({
          user_id: user.id,
          refresh_token: newRefreshToken,
          updated_at: new Date().toISOString()
        });
      
      if (saveError) {
        console.warn("Failed to update rotated refresh token in DB", saveError);
      }
    }

    // 6. Return the new access token
    return new Response(JSON.stringify({ access_token: newAccessToken }), { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (err) {
    console.error("Unexpected error in Edge Function:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: (err as Error).message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
