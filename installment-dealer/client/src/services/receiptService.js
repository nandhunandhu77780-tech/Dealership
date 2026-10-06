import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase.js';

/**
 * Fetch and assemble comprehensive payment receipt details from Firestore.
 * Enforces ownership: only Admins or the member who owns the payment can access the receipt.
 *
 * @param {object|string} paymentOrId - Payment object or payment document ID
 * @param {object} currentUser - Authenticated Firebase user object
 * @param {boolean} isAdmin - Whether the current user is an administrator
 * @returns {Promise<object>} Complete receipt details
 */
export const getReceiptDetails = async (paymentOrId, currentUser, isAdmin = false) => {
  let payment = null;

  if (typeof paymentOrId === 'string') {
    const paymentRef = doc(db, 'payments', paymentOrId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) {
      throw new Error('Payment record not found.');
    }
    payment = { id: paymentSnap.id, ...paymentSnap.data() };
  } else if (paymentOrId && typeof paymentOrId === 'object') {
    payment = { ...paymentOrId };
  } else {
    throw new Error('Invalid payment reference provided.');
  }

  // Security Check: Member can only view their own payment receipt
  if (!isAdmin && currentUser?.uid && payment.memberId && payment.memberId !== currentUser.uid) {
    throw new Error('Access Denied: You do not have permission to view this payment receipt.');
  }

  // Fetch associated installment plan if available
  let plan = null;
  if (payment.installmentPlanId) {
    try {
      const planRef = doc(db, 'installmentPlans', payment.installmentPlanId);
      const planSnap = await getDoc(planRef);
      if (planSnap.exists()) {
        plan = { id: planSnap.id, ...planSnap.data() };
      }
    } catch (err) {
      console.warn('Could not fetch installment plan for receipt:', err);
    }
  }

  // Fetch associated order if available
  let order = null;
  const orderId = payment.orderId || plan?.orderId;
  if (orderId) {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        order = { id: orderSnap.id, ...orderSnap.data() };
      }
    } catch (err) {
      console.warn('Could not fetch order for receipt:', err);
    }
  }

  // Fetch member profile details (e.g. phone, custom member ID like MEM-XXXX)
  let member = null;
  const memberUid = payment.memberId || plan?.memberId || order?.memberId;
  const memberEmail = order?.memberEmail || payment.memberEmail;

  if (memberUid) {
    try {
      const uSnap = await getDoc(doc(db, 'users', memberUid));
      if (uSnap.exists()) {
        member = { id: uSnap.id, ...uSnap.data() };
      }
    } catch {}
  }

  if (!member && memberEmail) {
    try {
      const membersRef = collection(db, 'members');
      const q = query(membersRef, where('email', '==', memberEmail.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        member = { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    } catch (err) {
      console.warn('Could not fetch member profile for receipt:', err);
    }
  }

  // Extract scheduled installment amount for this installment number
  let scheduledInstallmentAmount = 0;
  if (plan && Array.isArray(plan.schedule)) {
    const instItem = plan.schedule.find(
      (s) => s.installmentNumber === Number(payment.installmentNumber)
    );
    if (instItem) {
      scheduledInstallmentAmount = parseFloat(instItem.amount) || 0;
    }
  }
  if (!scheduledInstallmentAmount) {
    scheduledInstallmentAmount =
      parseFloat(plan?.installmentAmount) || parseFloat(payment.amount) || 0;
  }

  // Generate clean, standardized receipt number
  const receiptNumber = payment.receiptNumber || `REC-${(payment.id || '').slice(0, 8).toUpperCase()}`;

  // Assemble full receipt details
  return {
    id: payment.id,
    receiptNumber,
    businessName: 'NANDANAM Agencies',
    dealerTagline: 'Flexible & Transparent Financing Solutions',
    paymentDate: payment.paymentDate || payment.createdAt,
    createdAt: payment.createdAt,

    // Member Details
    memberName: payment.memberName || order?.memberName || member?.name || 'Valued Customer',
    memberId:
      payment.memberCode ||
      order?.memberCode ||
      plan?.memberCode ||
      member?.memberId ||
      (payment.memberId ? `MEM-${payment.memberId.slice(0, 6).toUpperCase()}` : 'MEM-GUEST'),
    phone: payment.memberPhone || order?.memberPhone || plan?.memberPhone || member?.phone || 'Not Provided',
    email: member?.email || order?.memberEmail || payment.memberEmail || '',
    address: member?.address || order?.address || '',

    // Product & Order Details
    productName: payment.productName || plan?.productName || order?.productName || 'Merchandise Item',
    orderId: orderId ? orderId.slice(0, 8) : 'N/A',
    fullOrderId: orderId || '',

    // Installment & Financial Details
    installmentNumber: payment.installmentNumber || 1,
    totalInstallments: plan?.numberOfInstallments || 1,
    frequency: plan?.frequency || 'Monthly',
    totalInstallmentAmount: scheduledInstallmentAmount,
    totalPlanAmount: parseFloat(plan?.totalAmount) || parseFloat(order?.totalAmount) || 0,
    amountPaid: parseFloat(payment.amount) || 0,
    remainingBalance:
      plan?.remainingBalance !== undefined
        ? parseFloat(plan.remainingBalance)
        : Math.max(0, scheduledInstallmentAmount - (parseFloat(payment.amount) || 0)),
    planTotalPaid: parseFloat(plan?.totalPaid) || (parseFloat(payment.amount) || 0),

    // Payment Meta
    paymentMethod: payment.paymentMethod || 'Cash',
    transactionId: payment.transactionId || '',
    recordedBy: payment.recordedBy || 'Admin',
    note: payment.note ? payment.note.trim() : '',
    status: 'PAID & VERIFIED',
  };
};
