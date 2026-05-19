// Push Subscription Manager — connects browser Push API to Supabase
import { supabase } from './supabase';
import { logger } from './logger';
import { PushSubscriptionSchema } from './validation';

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
  logger.info('Push', 'Initiating push notification subscription process...');
  try {
    // 1. Check browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      logger.warn('Push', 'Push notifications are not supported in this browser environment.');
      return false;
    }

    // 2. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      logger.warn('Push', 'User denied notification permission request.');
      return false;
    }

    // 3. Get the Service Worker registration
    const registration = await navigator.serviceWorker.ready;

    // 4. Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // 4.5 Ensure VAPID key is available
      if (!VAPID_PUBLIC_KEY) {
        logger.error('Push', 'VITE_VAPID_PUBLIC_KEY is not defined in the environment.');
        return false;
      }
      
      logger.info('Push', 'No active subscription found, generating new push credential keys...');
      // 5. Create a new push subscription using VAPID
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    // 6. Persist the subscription in Supabase
    await saveSubscriptionToSupabase(subscription);

    logger.info('Push', 'Push subscription registered and stored in database successfully.');
    return true;
  } catch (error) {
    logger.error('Push', 'Error during subscription process setup:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  logger.info('Push', 'Unsubscribing user from push notifications...');
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      await removeSubscriptionFromSupabase(subscription.endpoint);
      logger.info('Push', 'Push subscription successfully removed.');
    } else {
      logger.warn('Push', 'No subscription found to unsubscribe from.');
    }

    return true;
  } catch (error) {
    logger.error('Push', 'Error during unsubscription process:', error);
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
  } catch (err) {
    logger.error('Push', 'Failed to check active push subscription status', err);
    return false;
  }
}

// ─── Supabase Persistence ──────────────────────────────────────────

async function saveSubscriptionToSupabase(subscription: PushSubscription) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    logger.error('Push', 'Failed to save subscription: No authenticated Supabase session.');
    return;
  }

  const sub = subscription.toJSON();

  // Validate the browser subscription model strictly before writing to DB
  const validated = PushSubscriptionSchema.safeParse(sub);
  if (!validated.success) {
    logger.error('Push', 'Invalid browser push subscription payload structure', validated.error);
    throw new Error('La suscripción generada por el navegador no cumple con el esquema requerido.');
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userData.user.id,
        endpoint: validated.data.endpoint,
        p256dh: validated.data.keys.p256dh,
        auth: validated.data.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

  if (error) {
    logger.error('Push', 'Database upsert for push subscription failed:', error);
    throw error;
  }
}

async function removeSubscriptionFromSupabase(endpoint: string) {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) {
    logger.error('Push', 'Failed to delete subscription endpoint from database:', error);
    throw error;
  }
}
