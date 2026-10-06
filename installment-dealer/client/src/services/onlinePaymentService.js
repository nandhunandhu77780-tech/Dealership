import { auth } from './firebase.js';

const rawApiUrl = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE_URL = rawApiUrl.replace(/\/+$/, '');
const API_BASE = `${API_BASE_URL}/api/payments`;

/**
 * Helper to get active user's Firebase Auth ID token
 */
const getAuthHeaders = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be logged in to make an online payment.');
  }

  const token = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

/**
 * Dynamically load Razorpay checkout script if needed
 * @returns {Promise<boolean>}
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Failed to load external Razorpay checkout.js script.');
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

/**
 * Fetch public payment gateway configuration
 */
export const getPaymentConfig = async () => {
  const fallbackKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_sandbox_dealer';
  try {
    const res = await fetch(`${API_BASE}/config`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('Failed to fetch payment config from backend API:', err);
    return { keyId: fallbackKeyId, isConfigured: Boolean(fallbackKeyId && fallbackKeyId !== 'rzp_test_sandbox_dealer') };
  }
};

/**
 * Create a new payment order with the gateway
 * @param {object} params
 * @param {string} params.installmentPlanId
 * @param {number} params.installmentNumber
 * @param {number} params.amount
 * @returns {Promise<object>}
 */
export const createPaymentOrder = async ({ installmentPlanId, installmentNumber, amount }) => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/create-order`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      installmentPlanId,
      installmentNumber,
      amount,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to create payment order.');
  }

  return data.order;
};

/**
 * Verify payment with backend signature verification and record in Firestore
 * @param {object} params
 * @param {string} params.orderId
 * @param {string} params.paymentId
 * @param {string} params.signature
 * @param {string} params.installmentPlanId
 * @param {number} params.installmentNumber
 * @param {number} params.amount
 * @param {string} [params.paymentMethod='UPI']
 * @returns {Promise<object>}
 */
export const verifyPayment = async ({
  orderId,
  paymentId,
  signature,
  installmentPlanId,
  installmentNumber,
  amount,
  paymentMethod = 'UPI',
}) => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orderId,
      paymentId,
      signature,
      installmentPlanId,
      installmentNumber,
      amount,
      paymentMethod,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Payment verification failed.');
  }

  return data;
};

/**
 * Helper to simulate user app authorization for sandbox testing
 */
export const sandboxAuthorize = async ({ orderId, amount, status = 'success' }) => {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/sandbox-authorize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orderId,
      amount,
      status,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Payment authorization failed.');
  }

  return data;
};
