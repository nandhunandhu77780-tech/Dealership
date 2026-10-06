/**
 * Google Drive Integration Service for NANDANAM Agencies
 * 
 * Provides official Google Identity Services (GIS) OAuth 2.0 and Google Picker API
 * integration for selecting product photos from Google Drive.
 * 
 * Security features:
 * - Minimum required scope: 'https://www.googleapis.com/auth/drive.file'
 * - No client secret in frontend code (uses GIS token model)
 * - Restricts action to authenticated administrators only
 * - Validates image file formats (JPG, JPEG, PNG, WEBP)
 */

let gapiLoadingPromise = null;
let gisLoadingPromise = null;
let activeTokenClient = null;
let currentAccessToken = null;
let tokenExpiryTimestamp = 0;

const STORAGE_KEY_CLIENT_ID = 'nandanam_google_client_id';

/**
 * Common allowed image MIME types
 */
export const ALLOWED_DRIVE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Retrieve Google Drive configuration from environment variables or localStorage
 */
export const getGoogleDriveConfig = () => {
  const clientId = (
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_CLIENT_ID) : '') ||
    ''
  ).trim();

  // Developer key defaults to Google API Key or Firebase API Key (from the same GCP project)
  const developerKey = (
    import.meta.env.VITE_GOOGLE_API_KEY ||
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyALYdmwJjWOLjKLCqnowmvyZFvdP_SCr4E'
  ).trim();

  // Project Number / App ID for Google Picker
  const appId = (
    import.meta.env.VITE_GOOGLE_APP_ID ||
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    '403319967428'
  ).trim();

  return {
    clientId,
    developerKey,
    appId,
    isConfigured: Boolean(clientId),
  };
};

/**
 * Save custom Client ID to localStorage (useful if admin wants to configure via UI)
 */
export const saveCustomClientId = (clientId) => {
  if (typeof window !== 'undefined') {
    if (clientId && clientId.trim()) {
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
    }
  }
};

/**
 * Dynamically load Google API client script (gapi) and initialize Picker library
 */
export const loadGapiScript = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.gapi && window.google?.picker) return Promise.resolve(window.gapi);
  if (gapiLoadingPromise) return gapiLoadingPromise;

  gapiLoadingPromise = new Promise((resolve, reject) => {
    const onGapiReady = () => {
      if (window.gapi) {
        window.gapi.load('picker', {
          callback: () => resolve(window.gapi),
          onerror: () => reject(new Error('Failed to load Google Picker component from gapi.')),
          timeout: 10000,
          ontimeout: () => reject(new Error('Google Picker library loading timed out. Check your internet connection.')),
        });
        return true;
      }
      return false;
    };

    if (onGapiReady()) return;

    // Check if script element already exists in DOM
    const existingScript = document.querySelector('script[src*="apis.google.com/js/api.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (!onGapiReady()) {
          reject(new Error('Google API client loaded but gapi object is unavailable.'));
        }
      });
      existingScript.addEventListener('error', () => {
        reject(new Error('Failed to load Google API client script.'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!onGapiReady()) {
        reject(new Error('Failed to initialize Google API client after script load.'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to download Google API script (https://apis.google.com/js/api.js).'));
    };
    document.head.appendChild(script);
  });

  return gapiLoadingPromise;
};

/**
 * Dynamically load Google Identity Services (GIS) script
 */
export const loadGisScript = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (gisLoadingPromise) return gisLoadingPromise;

  gisLoadingPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      return resolve(window.google.accounts.oauth2);
    }

    const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.google?.accounts?.oauth2) {
          resolve(window.google.accounts.oauth2);
        } else {
          reject(new Error('Google Identity Services loaded but google.accounts.oauth2 is unavailable.'));
        }
      });
      existingScript.addEventListener('error', () => {
        reject(new Error('Failed to load Google Identity Services script.'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google.accounts.oauth2);
      } else {
        reject(new Error('Google Identity Services loaded but oauth2 module is missing.'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to download Google Identity Services script (https://accounts.google.com/gsi/client).'));
    };
    document.head.appendChild(script);
  });

  return gisLoadingPromise;
};

/**
 * Request an OAuth 2.0 access token for Google Drive using Google Identity Services (GIS)
 * Requests minimum scope: 'https://www.googleapis.com/auth/drive.file'
 * 
 * @param {string} clientId - Google OAuth 2.0 Web Client ID
 * @returns {Promise<string>} OAuth 2.0 Access Token
 */
export const requestGoogleDriveAccessToken = (clientId) => {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services library is not loaded.'));
    }

    // Reuse valid active token if it hasn't expired (leave 60s buffer)
    if (currentAccessToken && Date.now() < tokenExpiryTimestamp - 60000) {
      return resolve(currentAccessToken);
    }

    try {
      activeTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            console.error('Google OAuth error:', tokenResponse);
            return reject(new Error(tokenResponse.error_description || tokenResponse.error || 'Google Drive authorization was denied or failed.'));
          }

          currentAccessToken = tokenResponse.access_token;
          const expiresIn = tokenResponse.expires_in ? parseInt(tokenResponse.expires_in, 10) : 3600;
          tokenExpiryTimestamp = Date.now() + expiresIn * 1000;
          resolve(currentAccessToken);
        },
        error_callback: (err) => {
          console.error('Google Identity token error:', err);
          reject(new Error(err?.message || 'Google Drive authorization popup was closed or encountered an error.'));
        },
      });

      // Prompt account selection
      activeTokenClient.requestAccessToken({ prompt: '' });
    } catch (err) {
      console.error('Failed to initialize Google token client:', err);
      reject(err);
    }
  });
};

/**
 * Validates whether the selected Google Drive document is an allowed image format
 */
export const validateDriveImage = (doc) => {
  if (!doc) {
    return { valid: false, error: 'No document was selected from Google Drive.' };
  }

  const mimeType = (doc.mimeType || '').toLowerCase();
  const name = (doc.name || '').toLowerCase();

  const isAllowedMime = ALLOWED_DRIVE_MIME_TYPES.includes(mimeType);
  const isAllowedExt = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));

  if (!isAllowedMime && !isAllowedExt) {
    return {
      valid: false,
      error: `Selected file "${doc.name}" is not an accepted image. Please select a JPG, JPEG, PNG, or WEBP file.`,
    };
  }

  return { valid: true };
};

/**
 * Helper to construct direct Google Drive thumbnail/preview URL
 */
export const getDriveDirectImageUrl = (fileId) => {
  if (!fileId) return '';
  return `https://lh3.googleusercontent.com/d/${fileId}`;
};

/**
 * Open Google Drive File Picker for an authenticated administrator
 * 
 * @param {object} params
 * @param {object} params.user - Current Firebase user
 * @param {string} params.role - User role (must be 'admin')
 * @param {string} [params.customClientId] - Optional override for Client ID
 * @param {Function} params.onPick - Callback when an image is selected: ({ fileId, fileName, mimeType, blob, file, previewURL, thumbnailLink, accessToken }) => void
 * @param {Function} [params.onCancel] - Callback when user closes or cancels picker
 * @param {Function} [params.onError] - Callback when an error occurs
 * @returns {Promise<void>}
 */
export const openGoogleDrivePicker = async ({
  user,
  role,
  customClientId = '',
  onPick,
  onCancel,
  onError,
}) => {
  // 1. Enforce admin privilege
  if (!user || role !== 'admin') {
    const permErr = new Error('Permission denied: Only authenticated administrators can select product photos from Google Drive.');
    onError?.(permErr);
    throw permErr;
  }

  // 2. Resolve Google Drive configuration
  const config = getGoogleDriveConfig();
  const clientId = (customClientId || config.clientId || '').trim();

  if (!clientId) {
    const configErr = new Error('GOOGLE_DRIVE_NOT_CONFIGURED');
    configErr.code = 'CONFIG_REQUIRED';
    onError?.(configErr);
    throw configErr;
  }

  try {
    // 3. Ensure both GAPI and GIS scripts are ready
    await Promise.all([loadGapiScript(), loadGisScript()]);

    // 4. Request OAuth access token
    const accessToken = await requestGoogleDriveAccessToken(clientId);

    // 5. Construct Google Picker
    const google = window.google;
    if (!google?.picker) {
      throw new Error('Google Picker library is not initialized properly.');
    }

    // DocsView filtered strictly to images
    const imagesView = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
      .setMimeTypes(ALLOWED_DRIVE_MIME_TYPES.join(','))
      .setMode(google.picker.DocsViewMode.GRID);

    const pickerBuilder = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.NAV_HIDDEN)
      .setOAuthToken(accessToken)
      .addView(imagesView)
      .setTitle('Choose Product Photo - NANDANAM Agencies')
      .setCallback(async (data) => {
        if (data.action === google.picker.Action.PICKED) {
          try {
            const doc = data.docs?.[0];
            if (!doc) {
              throw new Error('No file data was received from Google Drive.');
            }

            const fileId = doc.id || doc[google.picker.Document.ID];
            const fileName = doc.name || doc[google.picker.Document.NAME] || 'product-image.jpg';
            const mimeType = (doc.mimeType || doc[google.picker.Document.MIME_TYPE] || 'image/jpeg').toLowerCase();
            const thumbnailLink = doc.thumbnails?.[0]?.url || doc.iconUrl || getDriveDirectImageUrl(fileId);

            // Format validation
            const validation = validateDriveImage({ mimeType, name: fileName });
            if (!validation.valid) {
              throw new Error(validation.error);
            }

            // Fetch file blob using Google Drive v3 API media download
            let blob = null;
            let file = null;
            let previewURL = thumbnailLink;

            try {
              const driveResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              });

              if (driveResp.ok) {
                blob = await driveResp.blob();
                file = new File([blob], fileName, { type: blob.type || mimeType });
                previewURL = URL.createObjectURL(blob);
              } else {
                console.warn(`Drive API binary fetch returned ${driveResp.status}. Using thumbnail preview.`);
              }
            } catch (fetchErr) {
              console.warn('Direct media download from Drive failed (likely CORS on specific domain). Using Drive preview link:', fetchErr);
            }

            // Return file details
            onPick?.({
              fileId,
              fileName,
              mimeType,
              blob,
              file,
              previewURL,
              thumbnailLink,
              accessToken,
            });
          } catch (pickErr) {
            console.error('Error processing picked Drive document:', pickErr);
            onError?.(pickErr);
          }
        } else if (data.action === google.picker.Action.CANCEL) {
          onCancel?.();
        }
      });

    // Provide developer key if available
    if (config.developerKey) {
      pickerBuilder.setDeveloperKey(config.developerKey);
    }

    // Provide App ID (Project number)
    if (config.appId) {
      pickerBuilder.setAppId(config.appId);
    }

    const picker = pickerBuilder.build();
    picker.setVisible(true);
  } catch (err) {
    console.error('Failed to open Google Drive file picker:', err);
    onError?.(err);
    throw err;
  }
};
