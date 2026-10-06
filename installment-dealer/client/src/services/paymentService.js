import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase.js';
import { getLocalDateString, getInstallmentStatus } from '../utils/formatters.js';

const PAYMENTS_COLLECTION = 'payments';
const INSTALLMENT_PLANS_COLLECTION = 'installmentPlans';

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Other'];

/**
 * Format a Date object or string to local YYYY-MM-DD string
 * @param {Date|string} date
 * @returns {string}
 */
export const formatDateToISO = (date = new Date()) => {
  return getLocalDateString(date);
};

/**
 * Record a manual installment payment by the admin
 * Atomically creates a payment record in 'payments' collection and
 * updates the installment item and plan in 'installmentPlans' collection.
 *
 * @param {object} paymentData
 * @param {string} paymentData.installmentPlanId
 * @param {number|string} paymentData.installmentNumber
 * @param {number|string} paymentData.amount
 * @param {string} paymentData.paymentDate - YYYY-MM-DD
 * @param {'Cash'|'UPI'|'Bank Transfer'|'Other'} paymentData.paymentMethod
 * @param {string} [paymentData.note]
 * @param {string} paymentData.recordedBy - Admin name or email
 * @returns {Promise<{ paymentId: string, updatedPlan: object }>}
 */
export const recordInstallmentPayment = async (paymentData) => {
  const {
    installmentPlanId,
    installmentNumber,
    amount,
    paymentDate,
    paymentMethod = 'Cash',
    note = '',
    recordedBy = 'Admin',
  } = paymentData;

  // Validations
  if (!installmentPlanId) {
    throw new Error('Installment Plan ID is required.');
  }

  const instNum = parseInt(installmentNumber, 10);
  if (isNaN(instNum) || instNum < 1) {
    throw new Error('Valid installment number is required.');
  }

  const payAmount = parseFloat(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    throw new Error('Payment amount must be a positive number greater than 0.');
  }

  if (!paymentDate) {
    throw new Error('Payment date is required.');
  }

  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error(`Invalid payment method "${paymentMethod}". Allowed: ${PAYMENT_METHODS.join(', ')}.`);
  }

  // Use Firestore transaction to guarantee consistency and prevent race conditions
  return await runTransaction(db, async (transaction) => {
    const planRef = doc(db, INSTALLMENT_PLANS_COLLECTION, installmentPlanId);
    const planDoc = await transaction.get(planRef);

    if (!planDoc.exists()) {
      throw new Error('The specified installment plan does not exist.');
    }

    const plan = planDoc.data();
    const schedule = Array.isArray(plan.schedule) ? [...plan.schedule] : [];

    const itemIndex = schedule.findIndex((s) => s.installmentNumber === instNum);
    if (itemIndex === -1) {
      throw new Error(`Installment #${instNum} not found in this installment plan schedule.`);
    }

    const item = { ...schedule[itemIndex] };
    const currentPaid = parseFloat(item.paidAmount) || 0;
    const itemTotalAmount = parseFloat(item.amount) || 0;
    const remainingForInstallment = parseFloat((itemTotalAmount - currentPaid).toFixed(2));

    if (remainingForInstallment <= 0 || item.status === 'Paid') {
      throw new Error(`Installment #${instNum} has already been fully paid.`);
    }

    // Validate payment amount does not exceed remaining amount for that installment (Requirement 5)
    // Use epsilon to avoid floating-point imprecision
    if (payAmount > remainingForInstallment + 0.001) {
      throw new Error(
        `Payment amount (₹${payAmount.toFixed(2)}) cannot exceed the remaining amount for Installment #${instNum} (₹${remainingForInstallment.toFixed(2)}).`
      );
    }

    // Calculate new paid amount on this installment
    const newPaidAmount = parseFloat((currentPaid + payAmount).toFixed(2));

    // Determine new status automatically from current local date and remaining payment data
    const newStatus = getInstallmentStatus({
      amount: itemTotalAmount,
      paidAmount: newPaidAmount,
      dueDate: item.dueDate,
    });

    schedule[itemIndex] = {
      ...item,
      paidAmount: newPaidAmount,
      status: newStatus,
    };

    // Calculate updated plan totals (Requirement 9)
    const downPayment = parseFloat(plan.downPayment) || 0;
    const schedulePaidSum = schedule.reduce(
      (sum, s) => sum + (parseFloat(s.paidAmount) || 0),
      0
    );
    const totalPaid = parseFloat((downPayment + schedulePaidSum).toFixed(2));
    const totalPlanAmount = parseFloat(plan.totalAmount) || 0;
    const remainingBalance = parseFloat(Math.max(0, totalPlanAmount - totalPaid).toFixed(2));

    // Status rules (Requirement 10 & 11):
    // If all installments are fully paid -> "Completed"
    // If some installments remain -> "Active"
    const allPaid = schedule.length > 0 && schedule.every((s) => s.status === 'Paid');
    const overallStatus = allPaid ? 'Completed' : 'Active';

    const nowIso = new Date().toISOString();

    // 1. Create Payment Record (Requirement 6)
    const paymentRecordRef = doc(collection(db, PAYMENTS_COLLECTION));
    const paymentRecord = {
      installmentPlanId,
      orderId: plan.orderId || '',
      memberId: plan.memberId || '',
      memberName: plan.memberName || 'Member',
      memberPhone: (plan.memberPhone || paymentData.memberPhone || '').trim(),
      memberCode: (plan.memberCode || paymentData.memberCode || '').trim(),
      memberEmail: (plan.memberEmail || paymentData.memberEmail || '').trim(),
      productName: plan.productName || 'Merchandise',
      installmentNumber: instNum,
      amount: parseFloat(payAmount.toFixed(2)),
      paymentDate,
      paymentMethod,
      note: note ? note.trim() : '',
      recordedBy: recordedBy || 'Admin',
      createdAt: nowIso,
    };

    transaction.set(paymentRecordRef, paymentRecord);

    // 2. Update Installment Plan Document (Requirements 7, 9, 10, 11)
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
};

/**
 * Fetch all payments recorded for a specific installment plan (Requirement 12)
 * @param {string} installmentPlanId
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getPaymentsByInstallmentPlan = async (installmentPlanId) => {
  if (!installmentPlanId) return [];
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);

  try {
    const q = query(
      paymentsRef,
      where('installmentPlanId', '==', installmentPlanId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback in case composite index is absent
    const q = query(paymentsRef, where('installmentPlanId', '==', installmentPlanId));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Fetch payment records for a specific member (Requirements 14 & 15)
 * @param {string} memberId
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getPaymentsByMember = async (memberId) => {
  if (!memberId) throw new Error('Member ID is required.');
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);

  try {
    const q = query(
      paymentsRef,
      where('memberId', '==', memberId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const q = query(paymentsRef, where('memberId', '==', memberId));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Fetch all payment records across all installment plans (Admin view)
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getAllPayments = async () => {
  const paymentsRef = collection(db, PAYMENTS_COLLECTION);
  try {
    const q = query(paymentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snapshot = await getDocs(paymentsRef);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};
