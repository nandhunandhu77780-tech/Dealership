import { getToken, onMessage } from 'firebase/messaging';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, getMessagingSafe } from './firebase.js';

const FCM_TOKENS_COLLECTION = 'fcmTokens';

/**
 * Resolve the backend notification API URL safely.
 * Uses VITE_API_BASE_URL if configured, or empty string (relative path) to leverage reverse proxy / same-domain routing.
 */
const getApiUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  return '';
};

/**
 * Hash a string to a safe alphanumeric ID for Firestore document keys
 */
const hashToken = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36) + str.slice(-16).replace(/[^a-zA-Z0-9]/g, '');
};

/**
 * Capture basic browser and operating system description
 */
const getDeviceDescription = () => {
  if (typeof window === 'undefined') return 'Unknown Device';
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  let os = 'Desktop';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
};

/**
 * Check if the browser supports Notifications, Service Workers, and Push Messaging
 * @returns {boolean}
 */
export const isNotificationSupported = () => {
  if (typeof window === 'undefined') return false;
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
};

/**
 * Get current browser notification permission
 * @returns {'granted' | 'denied' | 'default' | 'unsupported'}
 */
export const getNotificationPermissionStatus = () => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

/**
 * Register the Firebase Cloud Messaging service worker
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export const registerFCMServiceWorker = async () => {
  if (!isNotificationSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    // Wait until service worker is active
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error('Failed to register FCM service worker:', err);
    return null;
  }
};

/**
 * Request notification permission from the member and register their FCM device token in Firestore.
 * Supports multiple device tokens per member.
 *
 * @param {string} memberId - Authenticated member's UID
 * @returns {Promise<{ success: boolean, token?: string, permission: string, message?: string }>}
 */
export const requestNotificationPermissionAndGetToken = async (memberId) => {
  if (!memberId) {
    return { success: false, permission: 'unsupported', message: 'Member ID is required.' };
  }

  if (!isNotificationSupported()) {
    return {
      success: false,
      permission: 'unsupported',
      message: 'Push notifications are not supported in this browser.',
    };
  }

  try {
    // 1. Request browser permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        message:
          permission === 'denied'
            ? 'Notification permission was denied. Please allow notifications in your browser settings to receive payment alerts.'
            : 'Notification permission request was dismissed.',
      };
    }

    // 2. Register Service Worker
    const swRegistration = await registerFCMServiceWorker();
    if (!swRegistration) {
      return {
        success: false,
        permission: 'granted',
        message: 'Could not register service worker for push notifications.',
      };
    }

    // 3. Obtain FCM Messaging instance
    const messaging = await getMessagingSafe();
    if (!messaging) {
      return {
        success: false,
        permission: 'granted',
        message: 'Firebase Messaging is not available in this environment.',
      };
    }

    // 4. Retrieve FCM token
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;

    const token = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration,
      ...(vapidKey ? { vapidKey } : {}),
    });

    if (!token) {
      return {
        success: false,
        permission: 'granted',
        message: 'Unable to retrieve FCM registration token from Firebase.',
      };
    }

    // 5. Store FCM device token in Firestore under fcmTokens collection
    const tokenId = `fcm_${memberId}_${hashToken(token)}`;
    const tokenDocRef = doc(db, FCM_TOKENS_COLLECTION, tokenId);

    await setDoc(
      tokenDocRef,
      {
        token,
        memberId,
        deviceInfo: getDeviceDescription(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        platform: typeof navigator !== 'undefined' ? navigator.platform : '',
        enabled: true,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Save active token locally
    try {
      localStorage.setItem(`fcm_token_${memberId}`, token);
    } catch {}

    // Also notify backend server
    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/notifications/register-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId,
          token,
          deviceInfo: getDeviceDescription(),
        }),
      }).catch(() => {});
    } catch {}

    return {
      success: true,
      token,
      permission: 'granted',
      message: 'Push notifications successfully enabled!',
    };
  } catch (error) {
    console.error('Error requesting notification permission / FCM token:', error);
    return {
      success: false,
      permission: getNotificationPermissionStatus(),
      message: error?.message || 'Failed to initialize push notifications.',
    };
  }
};

/**
 * Remove an active FCM token from Firestore for the current device (e.g. member logout or disable)
 * @param {string} memberId
 * @returns {Promise<boolean>}
 */
export const unregisterDeviceToken = async (memberId) => {
  if (!memberId) return false;

  try {
    let token = null;
    try {
      token = localStorage.getItem(`fcm_token_${memberId}`);
    } catch {}

    if (token) {
      const tokenId = `fcm_${memberId}_${hashToken(token)}`;
      await deleteDoc(doc(db, FCM_TOKENS_COLLECTION, tokenId)).catch(() => {});
      try {
        localStorage.removeItem(`fcm_token_${memberId}`);
      } catch {}

      // Notify backend
      try {
        const apiUrl = getApiUrl();
        await fetch(`${apiUrl}/api/notifications/unregister-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, token }),
        }).catch(() => {});
      } catch {}
    } else {
      // Find all tokens for this member on current user session
      const q = query(collection(db, FCM_TOKENS_COLLECTION), where('memberId', '==', memberId));
      const snap = await getDocs(q);
      const batchPromises = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.allSettled(batchPromises);
    }

    return true;
  } catch (err) {
    console.error('Error unregistering device token:', err);
    return false;
  }
};

/**
 * Listen for foreground FCM notifications when the web app is open and active
 * @param {Function} onMessageReceived - Callback receiving payload
 * @returns {Promise<Function>} Unsubscribe function
 */
export const listenToForegroundMessages = async (onMessageReceived) => {
  if (!isNotificationSupported()) return () => {};

  try {
    const messaging = await getMessagingSafe();
    if (!messaging) return () => {};

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[fcmService] Received foreground message:', payload);
      if (typeof onMessageReceived === 'function') {
        onMessageReceived(payload);
      }
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Could not attach foreground message listener:', err);
    return () => {};
  }
};

/**
 * Trigger a test push notification from the backend to verify device setup
 * @param {string} memberId
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const sendTestPushNotification = async (memberId) => {
  if (!memberId) {
    return { success: false, message: 'Member ID is required.' };
  }

  const apiUrl = getApiUrl();

  try {
    const res = await fetch(`${apiUrl}/api/notifications/test-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, message: data.message || 'Test notification sent successfully!' };
    }
    return { success: false, message: data.message || 'Failed to send test push notification.' };
  } catch (err) {
    console.error('Failed to trigger test push notification:', err);
    return { success: false, message: err.message || 'Backend notification server is unreachable.' };
  }
};

/**
 * Dispatch a delivery-date push notification to a member's devices via backend
 * @param {object} params
 * @param {string} params.memberId - Target member UID
 * @param {string} params.orderId - Associated order ID
 * @param {string} params.productName - Product ordered
 * @param {string} params.deliveryDate - Expected delivery date (YYYY-MM-DD)
 * @param {string} [params.formattedDeliveryDate] - Formatted display date (e.g. 15 Oct 2026)
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export const sendDeliveryDatePushNotification = async ({
  memberId,
  orderId,
  productName,
  deliveryDate,
  formattedDeliveryDate,
}) => {
  if (!memberId || !orderId || !deliveryDate) {
    return { success: false, message: 'Missing required parameters for delivery notification.' };
  }

  const apiUrl = getApiUrl();

  try {
    const res = await fetch(`${apiUrl}/api/notifications/delivery-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId,
        orderId,
        productName,
        deliveryDate,
        formattedDeliveryDate,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, message: data.message };
    }
    return { success: false, message: data.message || 'Push dispatch failed.' };
  } catch (err) {
    console.warn('[fcmService] Push notification server call failed:', err);
    return { success: false, message: err.message };
  }
};

/**
 * Dispatch a delivery-status push notification to a member's devices via backend
 * Supported stages:
 * - Preparing → “Your order is being prepared.”
 * - Out for Delivery → “Your order is out for delivery.”
 * - Delivered → “Your order has been delivered.”
 *
 * @param {object} params
 * @param {string} params.memberId - Target member UID
 * @param {string} params.orderId - Associated order ID
 * @param {string} params.productName - Product ordered
 * @param {string} params.deliveryStatus - One of 'Preparing', 'Out for Delivery', 'Delivered'
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export const sendDeliveryStatusPushNotification = async ({
  memberId,
  orderId,
  productName,
  deliveryStatus,
}) => {
  if (!memberId || !orderId || !deliveryStatus) {
    return { success: false, message: 'Missing required parameters for delivery status notification.' };
  }

  const apiUrl = getApiUrl();

  try {
    const res = await fetch(`${apiUrl}/api/notifications/delivery-status-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId,
        orderId,
        productName,
        deliveryStatus,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, message: data.message };
    }
    return { success: false, message: data.message || 'Push dispatch failed.' };
  } catch (err) {
    console.warn('[fcmService] Delivery status push notification failed:', err);
    return { success: false, message: err.message };
  }
};


