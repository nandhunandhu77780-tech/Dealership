import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Initializes native Android mobile features:
 * - Dynamic Status Bar styling according to active route
 * - Smooth Splash Screen dismissal
 */
const NativeAppInitializer = () => {
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Safely hide splash screen after initial UI mount
    SplashScreen.hide({ fadeOutDuration: 350 }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const isLogin = location.pathname.startsWith('/login');

    const updateStatusBar = async () => {
      try {
        if (isLogin) {
          // Deep navy login background
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#07192f' });
        } else {
          // Light dashboard surfaces
          await StatusBar.setStyle({ style: Style.Light });
          await StatusBar.setBackgroundColor({ color: '#f6f8fb' });
        }
      } catch (err) {
        // Status bar plugin errors (e.g. unsupported web preview) are safely caught
      }
    };

    updateStatusBar();
  }, [location.pathname]);

  return null;
};

export default NativeAppInitializer;
