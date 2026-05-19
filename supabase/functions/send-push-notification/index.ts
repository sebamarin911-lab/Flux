// Supabase Edge Function: send-push-notification
// Deploy with: supabase functions deploy send-push-notification
// Set secrets:
//   supabase secrets set VAPID_PRIVATE_KEY=SGZAQSM8IAbp3XgTOA8whaRtYu_uOxg9LWkvtNslK2g
//   supabase secrets set VAPID_PUBLIC_KEY=BPxYClCj-cFHSeEapkZGtLnbT5uhfRnwssTEU5JLbnTm6fRJwrhTai_s_phGGKSS_Q0tf2wNRSjr5_ZTPC2Uu8A
//   supabase secrets set VAPID_SUBJECT=mailto:tu-email@example.com

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Web Push library for Deno
// We use the Web Crypto API directly since web-push isn't available in Deno

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, url, tag } = await req.json();

    // Get Supabase client with service role for reading all subscriptions
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all push subscriptions for the user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:flux@example.com";

    const payload = JSON.stringify({ title, body, url: url || "/", tag: tag || "flux-push" });

    // Send to each subscription
    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          const result = await sendWebPush(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            vapidPublicKey,
            vapidPrivateKey,
            vapidSubject
          );
          
          let responseBody = "";
          try {
            responseBody = await result.text();
          } catch (_) {}
          
          // If subscription is expired (410 Gone), remove it
          if (result.status === 410 || result.status === 404) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            return { endpoint: sub.endpoint, status: "removed", response: responseBody };
          }
          
          return { endpoint: sub.endpoint, status: result.status, response: responseBody };
        } catch (e) {
          return { endpoint: sub.endpoint, error: (e as Error).message };
        }
      })
    );

    return new Response(
      JSON.stringify({ sent: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Web Push Implementation using Web Crypto API ──────────────────

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<Response> {
  const endpoint = new URL(subscription.endpoint);
  const audience = `${endpoint.protocol}//${endpoint.host}`;

  // Create VAPID JWT
  const jwt = await createVapidJwt(audience, vapidSubject, vapidPrivateKey, vapidPublicKey);
  
  // Encrypt the payload
  const encrypted = await encryptPayload(
    payload,
    subscription.keys.p256dh,
    subscription.keys.auth
  );

  // Send the push message
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt},k=${vapidPublicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
      "Urgency": "high",
    },
    body: encrypted,
  });
}

async function createVapidJwt(
  audience: string,
  rawSubject: string,
  privateKeyBase64: string,
  publicKeyBase64: string
): Promise<string> {
  // Robust Subject formatting for Apple APNs
  let subject = (rawSubject || "").trim();
  if (subject.startsWith('"') && subject.endsWith('"')) {
    subject = subject.slice(1, -1);
  }
  if (subject.startsWith("'") && subject.endsWith("'")) {
    subject = subject.slice(1, -1);
  }
  if (!subject || (!subject.startsWith("mailto:") && !subject.startsWith("http://") && !subject.startsWith("https://"))) {
    if (subject.includes("@")) {
      subject = `mailto:${subject}`;
    } else {
      subject = "mailto:flux@example.com";
    }
  }

  console.log(`[Push] JWT Claims - Audience: ${audience}, Subject: ${subject}`);

  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  };

  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const unsignedToken = `${headerB64}.${claimsB64}`;

  // Decode keys
  const publicBytes = base64urlDecode(publicKeyBase64);
  if (publicBytes[0] !== 4 || publicBytes.length !== 65) {
    throw new Error(`Invalid public key format. Expected 65-byte uncompressed EC key, got ${publicBytes.length} bytes.`);
  }
  const xBytes = publicBytes.slice(1, 33);
  const yBytes = publicBytes.slice(33, 65);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64urlEncode(xBytes),
    y: base64urlEncode(yBytes),
    d: privateKeyBase64,
  };

  // Import the private key in JWK format
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw (r || s)
  const sigArray = new Uint8Array(signature);
  const sigB64 = base64urlEncode(sigArray);

  return `${unsignedToken}.${sigB64}`;
}

async function encryptPayload(
  payload: string,
  p256dhBase64: string,
  authBase64: string
): Promise<Uint8Array> {
  const payloadBytes = new TextEncoder().encode(payload);
  
  // Decode subscription keys
  const p256dh = base64urlDecode(p256dhBase64);
  const auth = base64urlDecode(authBase64);

  // Generate local ephemeral key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    p256dh,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberKey },
    localKeyPair.privateKey,
    256
  );

  // Export our public key
  const localPublicKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
  const localPublicKeyBytes = new Uint8Array(localPublicKeyRaw);

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Key derivation
  const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  const prkKey = await crypto.subtle.importKey("raw", sharedSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  
  const ikm = await hmacSign(prkKey, auth);
  const ikmKey = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  
  // PRK
  const prk = await hmacSign(
    await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new Uint8Array(ikm)
  );
  const prkForCEK = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  // CEK info
  const cekInfo = createInfo("aesgcm", p256dh, localPublicKeyBytes);
  const cekInfoWithCounter = new Uint8Array([...cekInfo, 1]);
  const cek = (await hmacSign(prkForCEK, cekInfoWithCounter)).slice(0, 16);

  // Nonce info
  const nonceInfo = createInfo("nonce", p256dh, localPublicKeyBytes);
  const nonceInfoWithCounter = new Uint8Array([...nonceInfo, 1]);
  const nonce = (await hmacSign(prkForCEK, nonceInfoWithCounter)).slice(0, 12);

  // Pad the payload (aes128gcm requires a padding delimiter)
  const paddedPayload = new Uint8Array([...payloadBytes, 2]); // 2 = delimiter

  // Encrypt
  const contentEncryptionKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    contentEncryptionKey,
    paddedPayload
  );

  // Build the aes128gcm header
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, paddedPayload.length + 16); // +16 for tag
  
  const header = new Uint8Array([
    ...salt,                          // 16 bytes salt
    ...recordSize,                    // 4 bytes record size
    localPublicKeyBytes.length,       // 1 byte key length
    ...localPublicKeyBytes,           // 65 bytes public key
  ]);

  return new Uint8Array([...header, ...new Uint8Array(encrypted)]);
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const info = encoder.encode(`Content-Encoding: ${type}\0P-256\0`);
  
  const clientLen = new Uint8Array(2);
  new DataView(clientLen.buffer).setUint16(0, clientPublicKey.length);
  
  const serverLen = new Uint8Array(2);
  new DataView(serverLen.buffer).setUint16(0, serverPublicKey.length);

  return new Uint8Array([
    ...info,
    ...clientLen,
    ...clientPublicKey,
    ...serverLen,
    ...serverPublicKey,
  ]);
}

async function hmacSign(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const result = await crypto.subtle.sign("HMAC", key, data);
  return new Uint8Array(result);
}

function base64urlEncode(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binString = atob(base64);
  return Uint8Array.from(binString, (c) => c.charCodeAt(0));
}
