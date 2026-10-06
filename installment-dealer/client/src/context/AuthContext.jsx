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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser(firebaseUser);
        const profile = await resolveProfile(firebaseUser);
        setUserProfile(profile);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Log in user with email & password and retrieve their role/profile
   */
  const login = async (email, password) => {
    const user = await loginUser(email, password);
    const profile = await resolveProfile(user);
    setCurrentUser(user);
    setUserProfile(profile);
    return { user, profile };
  };

  /**
   * Log in user with Google popup
   */
  const loginGoogle = async () => {
    const { user, profile } = await loginWithGoogle();
    setCurrentUser(user);
    setUserProfile(profile);
    return { user, profile };
  };

  /**
   * Log out user
   */
  const logout = async () => {
    await logoutUser();
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
