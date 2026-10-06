import {
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db } from './firebase.js';

/**
 * Sign in user with email and password using Firebase Authentication
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export const loginUser = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

/**
 * Sign in user using Google
 * - On Native Android (Capacitor): Uses native Google Identity via @capacitor-firebase/authentication
 * - On Web: Uses standard Firebase Google pop-up
 * If the user does not have a Firestore document, creates it with role = 'member'.
 * If the user already has a Firestore document, preserves their existing role (keeps admin if admin).
 * @returns {Promise<{ user: import('firebase/auth').User, profile: { name: string, email: string, role: string, photoURL?: string } }>}
 */
export const loginWithGoogle = async () => {
  let user;

  if (Capacitor.isNativePlatform()) {
    try {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        const userCredential = await signInWithCredential(auth, credential);
        user = userCredential.user;
      } else if (result.user) {
        user = auth.currentUser || result.user;
      } else {
        throw new Error('No Google credentials returned from native sign-in');
      }
    } catch (nativeErr) {
      console.warn('Native Google sign-in failed, attempting browser popup fallback:', nativeErr);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      user = result.user;
    }
  } else {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    user = result.user;
  }

  let profileData;
  try {
    // Retrieve user document from Firestore ('users/{uid}')
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      // New Google user: initialize as member
      profileData = {
        name: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
        email: user.email || '',
        role: 'member',
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userDocRef, profileData);
    } else {
      // Existing user: preserve existing role!
      profileData = userDocSnap.data();
      if (user.photoURL && profileData.photoURL !== user.photoURL) {
        profileData.photoURL = user.photoURL;
        await setDoc(userDocRef, { photoURL: user.photoURL, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }
  } catch (firestoreErr) {
    console.warn('Could not retrieve or create user Firestore profile on Google sign-in:', firestoreErr);
    profileData = {
      name: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
      email: user.email || '',
      role: 'member',
      photoURL: user.photoURL || '',
      profileExists: false,
    };
  }

  return { user, profile: profileData };
};

/**
 * Sign out the currently logged-in user
 * @returns {Promise<void>}
 */
export const logoutUser = async () => {
  try {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch(() => {});
    }
  } catch (_) {}
  await signOut(auth);
};

/**
 * Get the currently authenticated Firebase user
 * @returns {import('firebase/auth').User | null}
 */
export const getCurrentUser = () => {
  return auth.currentUser;
};

/**
 * Retrieve user profile and role from Firestore ('users/{uid}')
 * @param {string} uid
 * @returns {Promise<{ name: string, email: string, role: string, photoURL?: string } | null>}
 */
export const getUserProfile = async (uid) => {
  if (!uid) return null;
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      return userDocSnap.data();
    }
    return null;
  } catch (error) {
    console.error(`Error fetching user profile for ${uid}:`, error);
    return null;
  }
};

/**
 * Send password reset email using Firebase Authentication
 * @param {string} email
 * @returns {Promise<void>}
 */
export const resetPassword = async (email) => {
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw { code: 'auth/missing-email', message: 'Please provide an email address.' };
  }
  await sendPasswordResetEmail(auth, email.trim());
};

/**
 * Format Firebase Auth error codes into clear, user-friendly messages
 * @param {Error|{code: string, message: string}} error
 * @returns {string}
 */
export const formatAuthError = (error) => {
  if (!error) return 'An unexpected authentication error occurred.';
  const code = (typeof error === 'object' && error !== null ? error.code : '') || '';
  const rawMessage = (typeof error === 'object' && error !== null ? error.message : String(error)) || '';

  // Blocked API key / Identity Toolkit API restrictions
  if (
    code.includes('identitytoolkit') ||
    rawMessage.includes('identitytoolkit') ||
    code.includes('api-key-service-blocked') ||
    rawMessage.includes('API_KEY_SERVICE_BLOCKED')
  ) {
    return 'Authentication service is blocked for this API key. In Google Cloud Console (APIs & Services > Credentials), enable and allow the "Identity Toolkit API" in the API key restrictions.';
  }

  // HTTP Referer restrictions
  if (code.includes('requests-from-referer') || rawMessage.includes('requests-from-referer')) {
    return 'Requests from this domain are blocked by the API key restrictions. In Google Cloud Console, add your domain/localhost to the API key allowed websites.';
  }

  // Unauthorized domain in Firebase Console
  if (code === 'auth/unauthorized-domain' || rawMessage.includes('unauthorized-domain')) {
    return 'This domain is not authorized for authentication. Please add it to Authorized Domains in Firebase Console (Authentication > Settings > Authorized Domains).';
  }

  // Operation not allowed
  if (code === 'auth/operation-not-allowed' || rawMessage.includes('operation-not-allowed')) {
    return 'This authentication method is disabled in Firebase Console. Please enable Email/Password or Google Sign-In in Firebase Authentication settings.';
  }

  // Invalid API key
  if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key') {
    return 'The Firebase API key is invalid. Please verify your Firebase project credentials in .env.';
  }

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
      return 'No account found with this email address.';
    case 'auth/missing-email':
      return 'Please enter your email address.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few moments and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact an administrator.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in pop-up was closed before completion.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in pop-up is already in progress.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Please allow pop-ups for this site.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    default: {
      // Clean up raw Firebase error prefixes so the user sees the real message
      if (rawMessage) {
        const cleaned = rawMessage
          .replace(/^Firebase:\s*(Error\s*)?/i, '')
          .replace(/^\(([^)]+)\)\.?\s*/i, '')
          .trim();
        if (cleaned && cleaned !== 'Error' && cleaned !== 'FirebaseError') {
          return cleaned;
        }
      }
      return error.message || 'An error occurred during authentication. Please try again.';
    }
  }
};

