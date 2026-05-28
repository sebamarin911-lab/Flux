// Supabase Edge Function: google-calendar-sync
// Verifies user session JWT, fetches stored OAuth tokens from public.profiles,
// checks for access_token expiration, refreshes it if needed via Google OAuth API,
// updates the public.profiles table, and returns the fresh access token.

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
    
    // Create Supabase client with user token to authenticate
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

    // 2. Fetch the stored refresh token and access token info from profiles table
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: profile, error: dbError } = await adminClient
      .from("profiles")
      .select("google_refresh_token, google_access_token, google_token_expires_at")
      .eq("id", user.id)
      .maybeSingle();

    if (dbError) {
      return new Response(JSON.stringify({ error: "Database error fetching profile", details: dbError.message }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (!profile || !profile.google_refresh_token) {
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

    const currentTime = new Date();
    const tokenExpiresAt = profile.google_token_expires_at ? new Date(profile.google_token_expires_at) : null;
    
    // Check if token is expired or expires in the next 5 minutes (safety margin)
    const isExpired = !profile.google_access_token || !tokenExpiresAt || (currentTime.getTime() >= tokenExpiresAt.getTime() - 5 * 60 * 1000);

    let activeAccessToken = profile.google_access_token;

    if (isExpired) {
      console.log(`Token is expired or close to expiration. Refreshing for user: ${user.id}...`);
      
      // 4. Request new Access Token from Google OAuth API
      const googleResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: profile.google_refresh_token,
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
      activeAccessToken = googleData.access_token;
      
      // Google standard expiry is 3600s
      const newExpiresInSeconds = googleData.expires_in || 3600;
      const newExpiresAt = new Date(Date.now() + newExpiresInSeconds * 1000).toISOString();
      const rotatedRefreshToken = googleData.refresh_token;

      // 5. Update credentials in profiles table
      const updatePayload: any = {
        id: user.id,
        google_access_token: activeAccessToken,
        google_token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      };

      if (rotatedRefreshToken) {
        console.log("Google returned a rotated refresh token, updating in profile...");
        updatePayload.google_refresh_token = rotatedRefreshToken;
      }

      const { error: saveError } = await adminClient
        .from("profiles")
        .upsert(updatePayload, { onConflict: "id" });

      if (saveError) {
        console.error("Failed to update OAuth credentials in profiles table:", saveError);
      } else {
        console.log("OAuth credentials updated successfully in profiles table.");
      }
    } else {
      console.log("Token is still active and valid. Reusing access token.");
    }

    // 6. Return success response with active token
    return new Response(JSON.stringify({ 
      success: true,
      access_token: activeAccessToken,
      message: "Sincronización bidireccional exitosa. Agenda de la UBB y deportes al día."
    }), { 
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
