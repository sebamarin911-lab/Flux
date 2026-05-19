// Push Subscription Manager — connects browser Push API to Supabase
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * Convert a URL-safe base64 VAPID key to a Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Register the Service Worker and subscribe the browser to push notifications.
 * Saves the subscription to Supabase so the backend can send pushes later.
 */
export async function subscribeToPush(): Promise<boolean> {
  try {
    // 1. Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications are not supported in this browser.');
      return false;
    }

    // 2. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied.');
      return false;
    }

    // 3. Get the Service Worker registration
    const registration = await navigator.serviceWorker.ready;

    // 4. Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // 4.5 Ensure VAPID key is available
      if (!VAPID_PUBLIC_KEY) {
        console.error('❌ Error: VITE_VAPID_PUBLIC_KEY is not defined in the environment.');
        return false;
      }
      
      // 5. Create a new push subscription using VAPID
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    // 6. Persist the subscription in Supabase
    await saveSubscriptionToSupabase(subscription);

    console.log('✅ Push subscription active');
    return true;
  } catch (error) {
    console.error('Error subscribing to push:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await removeSubscriptionFromSupabase(subscription.endpoint);
    }

    console.log('🔕 Push subscription removed');
    return true;
  } catch (error) {
    console.error('Error unsubscribing from push:', error);
    return false;
  }
}

/**
 * Check if the user is currently subscribed.
 */
export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// ─── Supabase Persistence ──────────────────────────────────────────

async function saveSubscriptionToSupabase(subscription: PushSubscription) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const sub = subscription.toJSON();

  await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userData.user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys?.p256dh,
        auth: sub.keys?.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
}

async function removeSubscriptionFromSupabase(endpoint: string) {
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
}
