import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCzDNCxjYhz2sIKv2BIE5v9zo1oCvo1GGw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'project-karthi-b0f29.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'project-karthi-b0f29',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'project-karthi-b0f29.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '403319967428',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:403319967428:web:fd74013a1e7ae896078391',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Configure storage retry limits to prevent 10-minute hang on connection failures
storage.maxUploadRetryTime = 15000; // 15 seconds max upload retry time
storage.maxOperationRetryTime = 15000; // 15 seconds max operation retry time

/**
 * Safely initialize Firebase Cloud Messaging if supported by the browser
 */
let messagingInstance = null;
export const getMessagingSafe = async () => {
  if (typeof window === 'undefined') return null;
  if (messagingInstance) return messagingInstance;
  try {
    const supported = await isSupported();
    if (supported) {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    }
  } catch (err) {
    console.warn('Firebase Messaging is not supported in this browser environment:', err?.message || err);
  }
  return null;
};

export default app;

