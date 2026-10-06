import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase.js';

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.svg',
];

/**
 * Validates whether a file is a valid product image and within size limits.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateProductImage = (file) => {
  if (!file) {
    return { valid: false, error: 'Please select an image file to upload.' };
  }

  // Validate MIME type & file extension
  const fileName = (file.name || '').toLowerCase();
  const hasValidExt = ALLOWED_IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  const isImageMime = file.type && file.type.startsWith('image/');

  if (!isImageMime && !hasValidExt) {
    return {
      valid: false,
      error: 'Invalid file format. Please upload an image file (PNG, JPG, JPEG, WEBP, GIF, or SVG).',
    };
  }

  // Validate size limit (5MB max)
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size exceeds the 5MB limit. Selected file is ${fileSizeMB}MB.`,
    };
  }

  return { valid: true };
};

export const UPLOAD_TIMEOUT_MS = 15000; // 15 seconds max wait for upload response

/**
 * Formats Firebase Storage error codes into user-friendly messages.
 * @param {Error} error
 * @returns {string}
 */
export const formatStorageError = (error) => {
  if (!error) return 'An unknown error occurred during upload.';
  const code = error.code || '';
  const message = error.message || '';

  switch (code) {
    case 'storage/unauthorized':
      return 'Permission denied: Only authenticated administrators are authorized to upload or delete product images.';
    case 'storage/unauthenticated':
      return 'Authentication required: Please sign in as an administrator to upload product images.';
    case 'storage/canceled':
      return error.customMessage || 'Image upload was canceled or timed out.';
    case 'storage/bucket-not-found':
      return 'Firebase Storage bucket was not found. Please activate Cloud Storage in your Firebase Console (Build > Storage > Get Started).';
    case 'storage/project-not-found':
      return 'Firebase project was not found. Please verify your Firebase project configuration.';
    case 'storage/quota-exceeded':
      return 'Firebase Storage quota exceeded. Please contact system administration.';
    case 'storage/invalid-checksum':
      return 'File transfer corrupted. Please try uploading the image again.';
    case 'storage/invalid-argument':
      return 'Invalid file argument or corrupted image selected.';
    case 'storage/retry-limit-exceeded':
      return 'Upload timed out. Unable to reach Firebase Storage bucket. Please check your internet connection and verify Firebase Storage is activated.';
    case 'storage/object-not-found':
      return 'The target storage object was not found.';
    case 'storage/unknown':
      if (message.includes('404') || message.includes('Not Found') || !message) {
        return 'Firebase Storage bucket is not reachable or not activated yet. Please activate Cloud Storage in the Firebase Console (Build > Storage > Get Started).';
      }
      return `Firebase Storage error: ${message}`;
    default:
      if (message.includes('timeout') || message.includes('timed out')) {
        return 'Upload timed out. Unable to reach Firebase Storage bucket. Please check your network connection.';
      }
      return message || 'Failed to upload product image to Firebase Storage.';
  }
};

/**
 * Uploads a product image to Firebase Storage with resumable progress tracking.
 * Stored under: products/{timestamp}_{sanitizedFileName}
 *
 * @param {File} file - Selected image file
 * @param {function(number): void} [onProgress] - Progress callback (0 to 100)
 * @returns {Promise<{ downloadURL: string, storagePath: string }>}
 */
export const uploadProductImage = (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const validation = validateProductImage(file);
    if (!validation.valid) {
      return reject(new Error(validation.error));
    }

    if (!storage) {
      return reject(new Error('Firebase Storage is not initialized. Please verify configuration.'));
    }

    // Generate safe unique storage path
    const rawName = file.name || 'product_image.png';
    const lastDotIndex = rawName.lastIndexOf('.');
    const ext = lastDotIndex !== -1 ? rawName.slice(lastDotIndex).toLowerCase() : '.png';
    const baseName = lastDotIndex !== -1 ? rawName.slice(0, lastDotIndex) : rawName;
    const sanitizedBase = baseName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const storagePath = `products/${Date.now()}_${sanitizedBase}${ext}`;

    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: file.type || 'image/jpeg',
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    };

    let isSettled = false;
    let uploadTask = null;
    let timeoutTimer = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    };

    // Safety timeout to prevent upload from remaining permanently stuck at 0%
    // if the bucket is not provisioned or network is stalled
    timeoutTimer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        try {
          if (uploadTask) {
            uploadTask.cancel();
          }
        } catch {}
        const timeoutErr = new Error(
          'Upload timed out at 0%. Firebase Storage bucket is not reachable or not activated yet. Please activate Cloud Storage in the Firebase Console (Build > Storage > Get Started).'
        );
        timeoutErr.code = 'storage/retry-limit-exceeded';
        reject(timeoutErr);
      }
    }, UPLOAD_TIMEOUT_MS);

    try {
      uploadTask = uploadBytesResumable(storageRef, file, metadata);
    } catch (initErr) {
      cleanup();
      isSettled = true;
      return reject(new Error(formatStorageError(initErr)));
    }

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const progress = Math.min(
            100,
            Math.max(0, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
          );
          if (onProgress) {
            onProgress(progress);
          }
        }
      },
      (error) => {
        cleanup();
        if (isSettled) return;
        isSettled = true;
        console.error('Firebase Storage upload failed:', error);
        reject(new Error(formatStorageError(error)));
      },
      async () => {
        cleanup();
        if (isSettled) return;
        try {
          // Explicitly report 100% on upload completion
          if (onProgress) {
            onProgress(100);
          }
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          isSettled = true;
          resolve({
            downloadURL,
            storagePath: uploadTask.snapshot.ref.fullPath,
          });
        } catch (urlErr) {
          isSettled = true;
          console.error('Failed to retrieve download URL:', urlErr);
          reject(new Error('Image uploaded but failed to retrieve public download URL.'));
        }
      }
    );
  });
};

/**
 * Checks if a given URL or path belongs to Firebase Storage.
 * @param {string} urlOrPath
 * @returns {boolean}
 */
export const isFirebaseStorageUrl = (urlOrPath) => {
  if (!urlOrPath || typeof urlOrPath !== 'string') return false;
  return (
    urlOrPath.includes('firebasestorage.googleapis.com') ||
    urlOrPath.includes('firebasestorage.app') ||
    urlOrPath.startsWith('products/')
  );
};

/**
 * Safely deletes a product image from Firebase Storage.
 * Non-blocking: will not throw if file is already deleted or is an external URL.
 *
 * @param {string} storagePathOrUrl
 * @returns {Promise<boolean>} True if deleted, false if skipped or already gone
 */
export const deleteProductImage = async (storagePathOrUrl) => {
  if (!storagePathOrUrl || typeof storagePathOrUrl !== 'string') {
    return false;
  }

  // Only attempt deletion for Firebase Storage assets
  if (!isFirebaseStorageUrl(storagePathOrUrl)) {
    return false;
  }

  try {
    const imageRef = ref(storage, storagePathOrUrl);
    await deleteObject(imageRef);
    return true;
  } catch (error) {
    // If object was already deleted or not found, silently succeed
    if (error.code === 'storage/object-not-found') {
      return false;
    }
    console.warn('Failed to delete product image from Firebase Storage:', error);
    return false;
  }
};
