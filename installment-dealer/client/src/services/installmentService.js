import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from './firebase.js';

const INSTALLMENT_PLANS_COLLECTION = 'installmentPlans';
const ORDERS_COLLECTION = 'orders';

export const INSTALLMENT_FREQUENCIES = ['Monthly', 'Weekly'];

import {
  getLocalDateString,
  getOverdueDays,
  getInstallmentRemainingAmount,
  getInstallmentStatus,
  enrichInstallment,
} from '../utils/formatters.js';

export {
  getLocalDateString,
  getOverdueDays,
  getInstallmentRemainingAmount,
  getInstallmentStatus,
  enrichInstallment,
};

/**
 * Format a Date object or date input to local YYYY-MM-DD string
 * @param {Date|string} date
 * @returns {string}
 */
export const formatDateToISO = (date = new Date()) => {
  return getLocalDateString(date);
};

/**
 * Automatically generate installment schedule based on parameters with rounding safety.
 * Adjusts the final installment so that the sum of all installments strictly equals remainingAmount.
 *
 * @param {number} remainingAmount
 * @param {number} numberOfInstallments
 * @param {'Monthly'|'Weekly'} frequency
 * @param {string} firstDueDate - YYYY-MM-DD
 * @returns {Array<{ installmentNumber: number, dueDate: string, amount: number, paidAmount: number, status: string }>}
 */
export const generateInstallmentSchedule = (
  remainingAmount,
  numberOfInstallments,
  frequency,
  firstDueDate
) => {
  const remaining = parseFloat(remainingAmount);
  const n = parseInt(numberOfInstallments, 10);

  if (isNaN(remaining) || remaining <= 0) {
    throw new Error('Remaining amount must be a positive number greater than 0.');
  }

  if (isNaN(n) || n < 1) {
    throw new Error('Number of installments must be at least 1.');
  }

  if (!firstDueDate) {
    throw new Error('First due date is required.');
  }

  // Parse YYYY-MM-DD locally to avoid timezone shifts
  const [baseY, baseM, baseD] = String(firstDueDate).trim().split('-').map(Number);
  const baseDate = new Date(baseY, baseM - 1, baseD);
  if (isNaN(baseDate.getTime())) {
    throw new Error('Invalid first due date format.');
  }

  // Safe rounding: calculate standard installment amount rounded to 2 decimal places
  const baseAmount = Math.floor((remaining / n) * 100) / 100;
  const standardSum = parseFloat((baseAmount * (n - 1)).toFixed(2));
  const finalAmount = parseFloat((remaining - standardSum).toFixed(2));

  const todayStr = getLocalDateString(new Date());
  const schedule = [];

  for (let i = 1; i <= n; i++) {
    const installmentDate = new Date(baseY, baseM - 1, baseD);

    if (frequency === 'Weekly') {
      installmentDate.setDate(baseD + (i - 1) * 7);
    } else {
      // Monthly frequency
      installmentDate.setMonth(baseM - 1 + (i - 1));
    }

    const dueDateStr = getLocalDateString(installmentDate);
    const amount = i === n ? finalAmount : baseAmount;

    // Determine status from current date and payment data
    const status = getInstallmentStatus({ amount, paidAmount: 0, dueDate: dueDateStr }, todayStr);

    schedule.push({
      installmentNumber: i,
      dueDate: dueDateStr,
      amount,
      paidAmount: 0,
      status,
    });
  }

  return schedule;
};

/**
 * Create a new installment plan in Firestore for an approved order
 * @param {object} planData
 * @returns {Promise<{ id: string, ...object }>}
 */
export const createInstallmentPlan = async (planData) => {
  const {
    orderId,
    downPayment = 0,
    numberOfInstallments,
    frequency = 'Monthly',
    firstDueDate,
  } = planData;

  if (!orderId) throw new Error('Order ID is required to create an installment plan.');

  // Verify order exists and is approved (Requirement 2)
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) {
    throw new Error('The referenced order does not exist in Firestore.');
  }

  const order = orderSnap.data();
  if (order.status !== 'approved') {
    throw new Error(`Installment plans can be created ONLY for approved orders (current status: "${order.status}").`);
  }

  // Check if an installment plan already exists for this order
  const existingPlans = await getInstallmentPlanByOrderId(orderId);
  if (existingPlans) {
    throw new Error(`An installment plan already exists for Order #${orderId.slice(0, 8)}.`);
  }

  const totalAmount = parseFloat(order.totalAmount);
  const dp = parseFloat(downPayment) || 0;
  const n = parseInt(numberOfInstallments, 10);

  // Requirement 18: Never allow negative amounts or down payment > total amount
  if (dp < 0) {
    throw new Error('Down payment cannot be a negative amount.');
  }

  if (dp > totalAmount) {
    throw new Error(`Down payment (₹${dp}) cannot exceed the total order amount (₹${totalAmount}).`);
  }

  if (isNaN(n) || n < 1) {
    throw new Error('Number of installments must be at least 1.');
  }

  const remainingAmount = parseFloat((totalAmount - dp).toFixed(2));
  if (remainingAmount <= 0) {
    throw new Error('Remaining amount must be greater than 0 to configure an installment plan.');
  }

  const installmentAmount = parseFloat((remainingAmount / n).toFixed(2));

  if (!INSTALLMENT_FREQUENCIES.includes(frequency)) {
    throw new Error(`Invalid frequency "${frequency}". Supported: ${INSTALLMENT_FREQUENCIES.join(', ')}.`);
  }

  // Generate schedule
  const schedule = generateInstallmentSchedule(
    remainingAmount,
    n,
    frequency,
    firstDueDate
  );

  const newPlan = {
    orderId,
    memberId: order.memberId,
    memberName: order.memberName || 'Member',
    memberPhone: (order.memberPhone || planData.memberPhone || '').trim(),
    memberCode: (order.memberCode || planData.memberCode || '').trim(),
    memberEmail: order.memberEmail || '',
    productName: order.productName || 'Merchandise',
    totalAmount,
    downPayment: dp,
    remainingAmount,
    numberOfInstallments: n,
    installmentAmount,
    frequency,
    firstDueDate,
    status: 'active',
    schedule,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const docRef = await addDoc(collection(db, INSTALLMENT_PLANS_COLLECTION), newPlan);
  return { id: docRef.id, ...newPlan };
};

/**
 * Fetch all installment plans (Admin view)
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getAllInstallmentPlans = async () => {
  const plansRef = collection(db, INSTALLMENT_PLANS_COLLECTION);
  try {
    const q = query(plansRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snapshot = await getDocs(plansRef);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Fetch installment plans for a specific member
 * @param {string} memberId
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getInstallmentPlansByMember = async (memberId) => {
  if (!memberId) throw new Error('Member ID is required.');
  const plansRef = collection(db, INSTALLMENT_PLANS_COLLECTION);

  try {
    const q = query(
      plansRef,
      where('memberId', '==', memberId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const q = query(plansRef, where('memberId', '==', memberId));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Check if an installment plan already exists for a specific order
 * @param {string} orderId
 * @returns {Promise<{ id: string, ...object } | null>}
 */
export const getInstallmentPlanByOrderId = async (orderId) => {
  if (!orderId) return null;
  const plansRef = collection(db, INSTALLMENT_PLANS_COLLECTION);
  const q = query(plansRef, where('orderId', '==', orderId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() };
};

/**
 * Calculate the next upcoming due date from an installment schedule
 * @param {Array<{ dueDate: string, status: string, paidAmount: number, amount: number }>} schedule
 * @returns {string} dueDate or 'All Paid'
 */
export const getNextDueDate = (schedule) => {
  if (!Array.isArray(schedule) || schedule.length === 0) return 'N/A';
  const upcoming = schedule.find((item) => getInstallmentRemainingAmount(item) > 0);
  return upcoming ? upcoming.dueDate : 'All Paid';
};

/**
 * Calculate total paid amount on an installment plan
 * @param {object} plan
 * @returns {number}
 */
export const calculateTotalPaid = (plan) => {
  if (!plan) return 0;
  const dp = parseFloat(plan.downPayment) || 0;
  const schedulePaid = Array.isArray(plan.schedule)
    ? plan.schedule.reduce((sum, item) => sum + (parseFloat(item.paidAmount) || 0), 0)
    : 0;
  return parseFloat((dp + schedulePaid).toFixed(2));
};

/**
 * Calculate balance remaining on an installment plan
 * @param {object} plan
 * @returns {number}
 */
export const calculateBalanceAmount = (plan) => {
  if (!plan) return 0;
  const total = parseFloat(plan.totalAmount) || 0;
  const paid = calculateTotalPaid(plan);
  return parseFloat(Math.max(0, total - paid).toFixed(2));
};
