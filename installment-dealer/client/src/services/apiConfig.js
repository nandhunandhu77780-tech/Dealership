import { Capacitor } from '@capacitor/core';

/**
 * Centralized API URL resolver for web and native Android environments.
 * - On Web (local dev): Uses VITE_API_BASE_URL if set, or '' to utilize Vite dev server proxy.
 * - On Web (production/Vercel): Uses VITE_API_BASE_URL (or same-origin reverse proxy).
 * - On Android native app: Strictly uses the deployed HTTPS backend URL from VITE_API_BASE_URL.
 */
export const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured && typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }

  if (Capacitor.isNativePlatform()) {
    console.warn(
      '[Installment Dealer] VITE_API_BASE_URL is not set for native Android. ' +
      'Ensure VITE_API_BASE_URL is defined with your deployed HTTPS backend URL.'
    );
  }

  return '';
};

/**
 * Construct full URL for an API endpoint
 * @param {string} endpoint - e.g. '/api/payments/config'
 * @returns {string} Full HTTPS URL or relative path
 */
export const getApiUrl = (endpoint) => {
  const base = getApiBaseUrl();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${path}` : path;
};
