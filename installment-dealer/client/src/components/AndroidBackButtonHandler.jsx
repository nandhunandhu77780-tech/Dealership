import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

/**
 * Handles Android physical/gesture back button navigation:
 * 1. Closes open modals or dialogs first if any are active.
 * 2. Navigates back in browser/React Router history if on a sub-page.
 * 3. Prompts / exits app cleanly on root landing screens (/login, /admin, /member).
 */
const AndroidBackButtonHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let backListener = null;

    const setupListener = async () => {
      backListener = await CapApp.addListener('backButton', ({ canGoBack }) => {
        // 1. Check if any modal or dialog is currently open in the DOM
        const activeCloseBtn = document.querySelector(
          '.modal-close-btn, [data-modal-close="true"], .modal button.close, button[aria-label="Close"], button[aria-label="Close modal"]'
        );
        if (activeCloseBtn) {
          activeCloseBtn.click();
          return;
        }

        // Also check for cancel buttons inside visible modals
        const activeCancelBtn = document.querySelector('.modal-overlay .btn-secondary, .modal .btn-secondary');
        if (activeCancelBtn) {
          activeCancelBtn.click();
          return;
        }

        // 2. Check if user is on root screens
        const currentPath = location.pathname.replace(/\/+$/, '') || '/';
        const isRoot = ['/', '/login', '/admin', '/member'].includes(currentPath);

        if (isRoot || !canGoBack) {
          const now = Date.now();
          if (now - lastBackPressRef.current < 2000) {
            CapApp.exitApp();
          } else {
            lastBackPressRef.current = now;
            // Create a small native-styled toast notification
            showExitToast();
          }
        } else {
          navigate(-1);
        }
      });
    };

    setupListener();

    return () => {
      if (backListener) {
        backListener.remove();
      }
    };
  }, [navigate, location]);

  return null;
};

/**
 * Lightweight mobile toast for double-back exit confirmation
 */
const showExitToast = () => {
  const existing = document.getElementById('android-back-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'android-back-toast';
  toast.innerText = 'Press back again to exit';
  toast.style.cssText = `
    position: fixed;
    bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(10, 37, 64, 0.92);
    color: #ffffff;
    padding: 0.65rem 1.25rem;
    border-radius: 9999px;
    font-size: 0.85rem;
    font-weight: 600;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    transition: opacity 0.3s ease;
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 1700);
};

export default AndroidBackButtonHandler;
