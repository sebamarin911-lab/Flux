// Supabase Edge Function: morning-push
// Runs on a cron schedule at 07:30 every day (configured via pg_cron in Supabase)
// Sends a Web Push notification to all subscribed users

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Minimal Web Push implementation using VAPID (no npm dependency needed)
// Uses the native SubtleCrypto API available in Deno

const VAPID_PUBLIC_KEY = Deno.env.get("VITE_VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:flux-app@example.com";

// ─── VAPID JWT creation ───────────────────────────────────────────────────────
function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function createVapidJwt(audience: string): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  };

  const encode = (obj: object) =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Decode keys
  const publicBytes = base64UrlDecode(VAPID_PUBLIC_KEY);
  if (publicBytes[0] !== 4 || publicBytes.length !== 65) {
    throw new Error(`Invalid public key format. Expected 65-byte uncompressed EC key, got ${publicBytes.length} bytes.`);
  }
  const xBytes = publicBytes.slice(1, 33);
  const yBytes = publicBytes.slice(33, 65);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(xBytes),
    y: base64UrlEncode(yBytes),
    d: VAPID_PRIVATE_KEY,
  };

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function sendWebPush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}, payload: string): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = await createVapidJwt(audience);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
      },
      body: new TextEncoder().encode(payload),
    });

    return response.ok || response.status === 201;
  } catch (err) {
    console.error("Push send error:", err);
    return false;
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (_req: Request) => {
  try {
    // Import Supabase client (service role to read all subscriptions)
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all active push subscriptions
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");

    if (error || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No subscriptions found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const notifPayload = JSON.stringify({
      title: "🌞 Buenos días — Flux",
      body: "Tu día empieza ahora. Revisa tu agenda y mantén el ritmo.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "morning-brief",
      url: "/",
    });

    let sentCount = 0;
    const failed: string[] = [];

    for (const sub of subscriptions) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      const ok = await sendWebPush(sub, notifPayload);
      if (ok) {
        sentCount++;
      } else {
        failed.push(sub.endpoint);
      }
    }

    // Clean up expired/invalid subscriptions
    if (failed.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", failed);
      console.log(`Removed ${failed.length} invalid subscriptions.`);
    }

    return new Response(
      JSON.stringify({ sent: sentCount, failed: failed.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("morning-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
