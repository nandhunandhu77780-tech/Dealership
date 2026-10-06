import express from 'express';
import {
  getPaymentConfig,
  createOrder,
  verifyPayment,
  handleWebhook,
  sandboxAuthorize,
} from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// GET /api/payments/config
router.get('/config', getPaymentConfig);

// POST /api/payments/create-order (Protected for authenticated members)
router.post('/create-order', requireAuth, createOrder);

// POST /api/payments/verify (Protected for authenticated members)
router.post('/verify', requireAuth, verifyPayment);

// POST /api/payments/sandbox-authorize (Protected, helper for testing)
router.post('/sandbox-authorize', requireAuth, sandboxAuthorize);

// POST /api/payments/webhook
router.post('/webhook', handleWebhook);

export default router;
