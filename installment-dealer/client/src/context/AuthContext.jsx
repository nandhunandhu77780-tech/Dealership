import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase.js';
import {
  loginUser,
  loginWithGoogle,
  logoutUser,
  getUserProfile,
  getCurrentUser,
  resetPassword,
} from '../services/authService.js';

const AuthContext = createContext(null);

/**
 * Authentication Provider component
 */
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to resolve profile or graceful fallback if document doesn't exist in Firestore
  const resolveProfile = async (firebaseUser) => {
    if (!firebaseUser) return null;
    try {
      const profile = await getUserProfile(firebaseUser.uid);
      if (profile) {
        return profile;
      }
      // Graceful fallback if Firestore profile does not exist
      return {
        name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User'),
        email: firebaseUser.email,
        role: 'member', // Default safe fallback role
        photoURL: firebaseUser.photoURL || '',
        profileExists: false,
      };
    } catch (err) {
      console.warn('Could not retrieve Firestore profile, using fallback:', err);
      return {
        name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User'),
        email: firebaseUser.email,
        role: 'member',
        photoURL: firebaseUser.photoURL || '',
        profileExists: false,
      };
    }
  };

  const activeUidRef = React.useRef(null);
  const authStateRef = React.useRef({ currentUser: null, userProfile: null });
  authStateRef.current = { currentUser, userProfile };

  useEffect(() => {
    let isCurrent = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isCurrent) return;

      if (firebaseUser) {
        // If profile is already resolved for this exact user (e.g. from explicit login call), don't trigger extra re-renders
        if (activeUidRef.current === firebaseUser.uid && authStateRef.current.userProfile) {
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          const profile = await resolveProfile(firebaseUser);
          if (isCurrent) {
            activeUidRef.current = firebaseUser.uid;
            setCurrentUser(firebaseUser);
            setUserProfile(profile);
          }
        } catch (err) {
          console.error('Error resolving profile in onAuthStateChanged:', err);
          if (isCurrent) {
            activeUidRef.current = firebaseUser.uid;
            setCurrentUser(firebaseUser);
            setUserProfile({
              name: firebaseUser.displayName || 'User',
              email: firebaseUser.email,
              role: 'member',
              photoURL: firebaseUser.photoURL || '',
              profileExists: false,
            });
          }
        } finally {
          if (isCurrent) {
            setLoading(false);
          }
        }
      } else {
        if (isCurrent) {
          activeUidRef.current = null;
          setCurrentUser(null);
          setUserProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, []);

  /**
   * Log in user with email & password and retrieve their role/profile
   */
  const login = async (email, password) => {
    setLoading(true);
    try {
      const user = await loginUser(email, password);
      const profile = await resolveProfile(user);
      activeUidRef.current = user.uid;
      setCurrentUser(user);
      setUserProfile(profile);
      setLoading(false);
      return { user, profile };
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  /**
   * Log in user with Google popup
   */
  const loginGoogle = async () => {
    setLoading(true);
    try {
      const { user, profile } = await loginWithGoogle();
      activeUidRef.current = user.uid;
      setCurrentUser(user);
      setUserProfile(profile);
      setLoading(false);
      return { user, profile };
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  /**
   * Log out user
   */
  const logout = async () => {
    await logoutUser();
    activeUidRef.current = null;
    setCurrentUser(null);
    setUserProfile(null);
  };

  /**
   * Reload current user profile from Firestore and update context state
   */
  const reloadProfile = async () => {
    if (auth.currentUser) {
      const profile = await resolveProfile(auth.currentUser);
      setUserProfile(profile);
      return profile;
    }
    return null;
  };

  const value = {
    currentUser,
    userProfile,
    role: userProfile?.role || null,
    loading,
    login,
    loginGoogle,
    logout,
    resetPassword,
    reloadProfile,
    getCurrentUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to access AuthContext
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
