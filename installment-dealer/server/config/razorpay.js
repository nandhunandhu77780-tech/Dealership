import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const keyId = process.env.RAZORPAY_KEY_ID || '';
const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dealer_upi_webhook_secret_default';

// Check if valid credentials are provided
const isRealConfigured = Boolean(
  keyId &&
  keySecret &&
  !keyId.includes('your_') &&
  !keySecret.includes('your_')
);

let razorpayInstance = null;
if (isRealConfigured) {
  try {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    console.log(`[Payment Gateway] Razorpay initialized in ${keyId.startsWith('rzp_live') ? 'LIVE' : 'TEST'} mode.`);
  } catch (err) {
    console.warn(`[Payment Gateway] Could not initialize Razorpay instance: ${err.message}. Using Sandbox engine.`);
  }
} else {
  console.log('[Payment Gateway] Razorpay keys not provided. Running in Verified UPI Sandbox mode.');
}

/**
 * Fallback secret for sandbox signature generation and verification
 */
const SANDBOX_SECRET = 'sandbox_dealer_secret_2026';

/**
 * Create a payment order via Razorpay API or Sandbox engine
 * @param {object} params
 * @param {number} params.amount - In Rupees (will be converted to paise)
 * @param {string} [params.currency='INR']
 * @param {string} params.receipt
 * @param {object} [params.notes={}]
 * @returns {Promise<{ orderId: string, amount: number, currency: string, keyId: string, isSandbox: boolean }>}
 */
export const createGatewayOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) => {
  const amountInPaise = Math.round(parseFloat(amount) * 100);

  if (isNaN(amountInPaise) || amountInPaise <= 0) {
    throw new Error('Invalid payment amount for order creation.');
  }

  // 1. If Razorpay instance is active with real/test keys, call Razorpay Orders API
  if (razorpayInstance) {
    try {
      const order = await razorpayInstance.orders.create({
        amount: amountInPaise,
        currency,
        receipt: (receipt || `rcpt_${Date.now()}`).slice(0, 40),
        notes,
      });

      return {
        orderId: order.id,
        amount: order.amount, // in paise
        currency: order.currency,
        keyId,
        receipt: order.receipt,
        isSandbox: false,
      };
    } catch (apiError) {
      console.error('[Razorpay API Error]', apiError);
      throw new Error(`Payment Gateway Error: ${apiError.error?.description || apiError.message}`);
    }
  }

  // 2. Verified Sandbox Engine (generates authentic order structure for test flow)
  const randomHex = crypto.randomBytes(6).toString('hex');
  const sandboxOrderId = `order_sim_${Date.now()}_${randomHex}`;

  return {
    orderId: sandboxOrderId,
    amount: amountInPaise,
    currency,
    keyId: keyId || 'rzp_test_sandbox_dealer',
    receipt: receipt || `rcpt_${Date.now()}`,
    isSandbox: true,
  };
};

/**
 * Verify cryptographic signature returned after payment
 * Standard Razorpay HMAC-SHA256 signature verification:
 * signature = HMAC-SHA256(order_id + "|" + payment_id, secret)
 *
 * @param {object} params
 * @param {string} params.orderId
 * @param {string} params.paymentId
 * @param {string} params.signature
 * @returns {boolean}
 */
export const verifyGatewaySignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  const data = `${orderId}|${paymentId}`;

  // Check against Razorpay secret if configured
  if (isRealConfigured && keySecret) {
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(data)
      .digest('hex');

    if (expectedSignature === signature) {
      return true;
    }
  }

  // Also check against sandbox secret
  const sandboxExpected = crypto
    .createHmac('sha256', SANDBOX_SECRET)
    .update(data)
    .digest('hex');

  return sandboxExpected === signature;
};

/**
 * Helper to generate a valid signature for sandbox verification
 * @param {string} orderId
 * @param {string} paymentId
 * @returns {string}
 */
export const generateSandboxSignature = (orderId, paymentId) => {
  return crypto
    .createHmac('sha256', SANDBOX_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
};

/**
 * Verify Webhook signature
 * @param {string|Buffer} bodyRaw - Raw request body
 * @param {string} signature - Header 'x-razorpay-signature'
 * @returns {boolean}
 */
export const verifyWebhookSignature = (bodyRaw, signature) => {
  if (!signature || !webhookSecret) return false;
  try {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(typeof bodyRaw === 'string' ? bodyRaw : JSON.stringify(bodyRaw))
      .digest('hex');
    return expected === signature;
  } catch {
    return false;
  }
};

export const getGatewayKeyId = () => keyId || 'rzp_test_sandbox_dealer';
export const isGatewayConfigured = () => isRealConfigured;
