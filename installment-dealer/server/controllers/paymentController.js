import { getFirestore } from 'firebase-admin/firestore';
import {
  createGatewayOrder,
  verifyGatewaySignature,
  verifyWebhookSignature,
  getGatewayKeyId,
  isGatewayConfigured,
  generateSandboxSignature,
} from '../config/razorpay.js';

/**
 * Helper to get Firestore instance
 */
const getDb = () => getFirestore();

/**
 * Format a Date object to YYYY-MM-DD
 */
const formatDateToISO = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * GET /api/payments/config
 * Returns public payment gateway configuration
 */
export const getPaymentConfig = async (req, res) => {
  try {
    return res.json({
      success: true,
      keyId: getGatewayKeyId(),
      isConfigured: isGatewayConfigured(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/payments/create-order
 * Initiates an online payment order with the gateway
 */
export const createOrder = async (req, res) => {
  try {
    const { installmentPlanId, installmentNumber, amount } = req.body;
    const userId = req.user?.uid;

    if (!installmentPlanId) {
      return res.status(400).json({ success: false, message: 'Installment plan ID is required.' });
    }

    const instNum = parseInt(installmentNumber, 10);
    if (isNaN(instNum) || instNum < 1) {
      return res.status(400).json({ success: false, message: 'Valid installment number is required.' });
    }

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0.' });
    }

    const db = getDb();
    const planRef = db.collection('installmentPlans').doc(installmentPlanId);
    const planSnap = await planRef.get();

    if (!planSnap.exists) {
      return res.status(404).json({ success: false, message: 'Installment plan not found.' });
    }

    const plan = planSnap.data();

    // Requirement 12: Members must only be able to pay for their own installments
    if (plan.memberId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only make payments for your own installment plans.',
      });
    }

    // Locate the specific installment in schedule
    const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
    const item = schedule.find((s) => s.installmentNumber === instNum);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `Installment #${instNum} was not found in this installment schedule.`,
      });
    }

    const itemTotalAmount = parseFloat(item.amount) || 0;
    const itemPaidAmount = parseFloat(item.paidAmount) || 0;
    const remainingForInstallment = parseFloat(Math.max(0, itemTotalAmount - itemPaidAmount).toFixed(2));

    if (remainingForInstallment <= 0 || item.status === 'Paid') {
      return res.status(400).json({
        success: false,
        message: `Installment #${instNum} is already fully paid.`,
      });
    }

    // Requirement 5: Payment amount must never exceed installment remaining amount
    if (payAmount > remainingForInstallment + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${payAmount.toFixed(2)}) cannot exceed remaining balance for Installment #${instNum} (₹${remainingForInstallment.toFixed(2)}).`,
      });
    }

    // Create payment gateway order
    const receiptId = `inst_${installmentPlanId.slice(0, 6)}_${instNum}_${Date.now()}`;
    const gatewayOrder = await createGatewayOrder({
      amount: payAmount,
      currency: 'INR',
      receipt: receiptId,
      notes: {
        memberId: plan.memberId,
        memberName: plan.memberName || 'Member',
        installmentPlanId,
        installmentNumber: instNum,
        productName: plan.productName || '',
      },
    });

    return res.json({
      success: true,
      order: {
        orderId: gatewayOrder.orderId,
        amount: payAmount, // amount in rupees
        amountInPaise: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        keyId: gatewayOrder.keyId,
        receipt: gatewayOrder.receipt,
        isSandbox: gatewayOrder.isSandbox,
        member: {
          id: plan.memberId,
          name: plan.memberName,
          email: plan.memberEmail || req.user.email,
        },
        plan: {
          id: installmentPlanId,
          productName: plan.productName,
          installmentNumber: instNum,
          installmentAmount: itemTotalAmount,
          alreadyPaid: itemPaidAmount,
          remainingAmount: remainingForInstallment,
        },
      },
    });
  } catch (error) {
    console.error('[createOrder error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/payments/verify
 * Cryptographically verifies payment from gateway, prevents duplicate recording,
 * records in Firestore 'payments' and updates 'installmentPlans'.
 */
export const verifyPayment = async (req, res) => {
  try {
    const {
      orderId,
      paymentId,
      signature,
      installmentPlanId,
      installmentNumber,
      amount,
      paymentMethod = 'UPI',
    } = req.body;

    const userId = req.user?.uid;

    if (!orderId || !paymentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing orderId or paymentId for verification.',
      });
    }

    if (!installmentPlanId) {
      return res.status(400).json({
        success: false,
        message: 'Missing installmentPlanId.',
      });
    }

    const instNum = parseInt(installmentNumber, 10);
    const payAmount = parseFloat(amount);

    if (isNaN(instNum) || isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid installment number or payment amount.',
      });
    }

    // 1. Cryptographic Signature Verification
    const isValidSignature = verifyGatewaySignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed: Invalid cryptographic signature.',
      });
    }

    const db = getDb();

    // 2. Requirement 9: Prevent duplicate payment recording if callback/webhook is received more than once
    const existingPaymentsQuery = await db
      .collection('payments')
      .where('transactionId', '==', paymentId)
      .limit(1)
      .get();

    if (!existingPaymentsQuery.empty) {
      const existingDoc = existingPaymentsQuery.docs[0];
      console.log(`[Idempotency] Payment ${paymentId} was already recorded.`);
      return res.json({
        success: true,
        message: 'Payment has already been successfully recorded.',
        duplicate: true,
        paymentId: existingDoc.id,
        payment: { id: existingDoc.id, ...existingDoc.data() },
      });
    }

    // 3. Atomic Firestore Transaction for recording payment & updating installment plan
    const planRef = db.collection('installmentPlans').doc(installmentPlanId);

    const result = await db.runTransaction(async (transaction) => {
      const planSnap = await transaction.get(planRef);
      if (!planSnap.exists) {
        throw new Error('Installment plan not found.');
      }

      const plan = planSnap.data();

      // Requirement 12: Ownership check
      if (plan.memberId !== userId && req.user.role !== 'admin') {
        throw new Error('Access denied: You can only pay for your own installments.');
      }

      const schedule = Array.isArray(plan.schedule) ? [...plan.schedule] : [];
      const itemIndex = schedule.findIndex((s) => s.installmentNumber === instNum);

      if (itemIndex === -1) {
        throw new Error(`Installment #${instNum} not found in schedule.`);
      }

      const item = { ...schedule[itemIndex] };
      const currentPaid = parseFloat(item.paidAmount) || 0;
      const itemTotalAmount = parseFloat(item.amount) || 0;
      const remainingForInstallment = parseFloat((itemTotalAmount - currentPaid).toFixed(2));

      // Requirement 5: Amount check
      if (payAmount > remainingForInstallment + 0.001) {
        throw new Error(
          `Payment amount (₹${payAmount.toFixed(2)}) exceeds remaining balance (₹${remainingForInstallment.toFixed(2)}).`
        );
      }

      // Calculate new paid amount & status (Rules: Paid if remaining=0, Overdue if past due and remaining>0, Due Today if today, Upcoming if future)
      const newPaidAmount = parseFloat((currentPaid + payAmount).toFixed(2));
      const remainingForInstallmentAfterPay = parseFloat(Math.max(0, itemTotalAmount - newPaidAmount).toFixed(2));
      const todayStr = formatDateToISO(new Date());
      let newStatus = 'Upcoming';

      if (remainingForInstallmentAfterPay <= 0) {
        newStatus = 'Paid';
      } else if (item.dueDate && item.dueDate < todayStr) {
        newStatus = 'Overdue';
      } else if (item.dueDate && item.dueDate === todayStr) {
        newStatus = 'Due Today';
      } else {
        newStatus = 'Upcoming';
      }

      schedule[itemIndex] = {
        ...item,
        paidAmount: newPaidAmount,
        status: newStatus,
      };

      // Recalculate plan totals (Requirement 8)
      const downPayment = parseFloat(plan.downPayment) || 0;
      const schedulePaidSum = schedule.reduce(
        (sum, s) => sum + (parseFloat(s.paidAmount) || 0),
        0
      );
      const totalPaid = parseFloat((downPayment + schedulePaidSum).toFixed(2));
      const totalPlanAmount = parseFloat(plan.totalAmount) || 0;
      const remainingBalance = parseFloat(Math.max(0, totalPlanAmount - totalPaid).toFixed(2));

      const allPaid = schedule.length > 0 && schedule.every((s) => s.status === 'Paid');
      const overallStatus = allPaid ? 'Completed' : 'Active';

      const nowIso = new Date().toISOString();
      const paymentDate = formatDateToISO(new Date());

      // Requirement 6: Record payment in Firestore 'payments' collection
      const paymentRecordRef = db.collection('payments').doc();
      const paymentRecord = {
        memberId: plan.memberId || userId,
        memberName: plan.memberName || req.user.name || 'Member',
        memberEmail: plan.memberEmail || req.user.email || '',
        installmentPlanId,
        orderId: plan.orderId || '',
        productName: plan.productName || 'Merchandise',
        installmentNumber: instNum,
        amount: parseFloat(payAmount.toFixed(2)),
        paymentMethod,
        transactionId: paymentId,
        paymentDate,
        status: 'Successful',
        gatewayOrderId: orderId,
        note: `Online payment via ${paymentMethod} (Transaction ID: ${paymentId})`,
        recordedBy: 'Online Payment Gateway (Member)',
        createdAt: nowIso,
      };

      transaction.set(paymentRecordRef, paymentRecord);

      // Requirements 7 & 8: Update Installment Plan Document
      const updatedPlanFields = {
        schedule,
        totalPaid,
        remainingBalance,
        status: overallStatus,
        updatedAt: nowIso,
      };

      transaction.update(planRef, updatedPlanFields);

      return {
        paymentId: paymentRecordRef.id,
        payment: { id: paymentRecordRef.id, ...paymentRecord },
        updatedPlan: { id: installmentPlanId, ...plan, ...updatedPlanFields },
      };
    });

    return res.json({
      success: true,
      message: 'Payment verified and recorded successfully.',
      paymentId: result.paymentId,
      transactionId: paymentId,
      payment: result.payment,
      updatedPlan: result.updatedPlan,
    });
  } catch (error) {
    console.error('[verifyPayment error]', error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/payments/webhook
 * Webhook handler for asynchronous payment gateway events
 */
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body;

    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
    }

    const event = rawBody?.event;
    console.log(`[Webhook Event Received]: ${event}`);

    // If payment.captured, check if already recorded
    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = rawBody.payload?.payment?.entity;
      if (paymentEntity) {
        const paymentId = paymentEntity.id;
        const db = getDb();
        const existing = await db
          .collection('payments')
          .where('transactionId', '==', paymentId)
          .limit(1)
          .get();

        if (!existing.empty) {
          console.log(`[Webhook] Payment ${paymentId} already processed.`);
          return res.json({ status: 'ok', already_processed: true });
        }
      }
    }

    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook Error]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/payments/sandbox-authorize
 * For sandbox/test UPI checkout to simulate user app authorization
 */
export const sandboxAuthorize = async (req, res) => {
  try {
    const { orderId, amount, status = 'success' } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required.' });
    }

    if (status === 'failure') {
      return res.json({
        success: false,
        status: 'Failed',
        message: 'Payment was declined by the bank or user cancelled UPI request.',
      });
    }

    if (status === 'cancelled') {
      return res.json({
        success: false,
        status: 'Cancelled',
        message: 'UPI payment authorization was cancelled by the user.',
      });
    }

    const paymentId = `pay_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const signature = generateSandboxSignature(orderId, paymentId);

    return res.json({
      success: true,
      status: 'Successful',
      paymentId,
      orderId,
      signature,
      amount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
