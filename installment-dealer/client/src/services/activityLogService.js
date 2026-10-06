import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db } from './firebase.js';

export const ACTIVITY_LOGS_COLLECTION = 'activityLogs';

/**
 * Standard action types for system audit logging
 */
export const ACTION_TYPES = {
  // Members
  MEMBER_ADDED: 'member_added',
  MEMBER_EDITED: 'member_edited',
  MEMBER_ACTIVATED: 'member_activated',
  MEMBER_DEACTIVATED: 'member_deactivated',
  MEMBER_DELETED: 'member_deleted',

  // Products
  PRODUCT_ADDED: 'product_added',
  PRODUCT_EDITED: 'product_edited',
  PRODUCT_ACTIVATED: 'product_activated',
  PRODUCT_DEACTIVATED: 'product_deactivated',
  PRODUCT_DELETED: 'product_deleted',

  // Orders
  ORDER_APPROVED: 'order_approved',
  ORDER_REJECTED: 'order_rejected',
  ORDER_COMPLETED: 'order_completed',

  // Installment Plans
  PLAN_CREATED: 'plan_created',
  PLAN_UPDATED: 'plan_updated',

  // Payments
  PAYMENT_RECORDED: 'payment_recorded',
  PAYMENT_STATUS_UPDATED: 'payment_status_updated',
};

/**
 * Visual styling metadata for each action type
 */
export const getActionBadge = (actionType) => {
  switch (actionType) {
    case ACTION_TYPES.MEMBER_ADDED:
      return { label: 'Member Added', icon: '👤', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' };
    case ACTION_TYPES.MEMBER_EDITED:
      return { label: 'Member Edited', icon: '✏️', color: '#93c5fd', bg: 'rgba(147, 197, 253, 0.15)' };
    case ACTION_TYPES.MEMBER_ACTIVATED:
      return { label: 'Member Activated', icon: '🟢', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' };
    case ACTION_TYPES.MEMBER_DEACTIVATED:
      return { label: 'Member Deactivated', icon: '🔴', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' };
    case ACTION_TYPES.MEMBER_DELETED:
      return { label: 'Member Deleted', icon: '🗑️', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' };

    case ACTION_TYPES.PRODUCT_ADDED:
      return { label: 'Product Added', icon: '📦', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' };
    case ACTION_TYPES.PRODUCT_EDITED:
      return { label: 'Product Edited', icon: '📝', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)' };
    case ACTION_TYPES.PRODUCT_ACTIVATED:
      return { label: 'Product Activated', icon: '🟢', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' };
    case ACTION_TYPES.PRODUCT_DEACTIVATED:
      return { label: 'Product Deactivated', icon: '🔴', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' };
    case ACTION_TYPES.PRODUCT_DELETED:
      return { label: 'Product Deleted', icon: '🗑️', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' };

    case ACTION_TYPES.ORDER_APPROVED:
      return { label: 'Order Approved', icon: '✅', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' };
    case ACTION_TYPES.ORDER_REJECTED:
      return { label: 'Order Rejected', icon: '❌', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' };
    case ACTION_TYPES.ORDER_COMPLETED:
      return { label: 'Order Completed', icon: '🎉', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };

    case ACTION_TYPES.PLAN_CREATED:
      return { label: 'Plan Created', icon: '💳', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)' };
    case ACTION_TYPES.PLAN_UPDATED:
      return { label: 'Plan Updated', icon: '🔄', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' };

    case ACTION_TYPES.PAYMENT_RECORDED:
      return { label: 'Payment Recorded', icon: '💵', color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' };
    case ACTION_TYPES.PAYMENT_STATUS_UPDATED:
      return { label: 'Payment Status Updated', icon: '🧾', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.15)' };

    default:
      return { label: actionType || 'Activity', icon: '📜', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };
  }
};

/**
 * Filter groups for UI dropdowns
 */
export const ACTION_GROUPS = [
  { id: 'all', label: 'All Activities' },
  { id: 'members', label: 'Member Actions' },
  { id: 'products', label: 'Product Actions' },
  { id: 'orders', label: 'Order Actions' },
  { id: 'plans', label: 'Installment Plans' },
  { id: 'payments', label: 'Payment Collections' },
];

/**
 * Safely log an administrative action into the Firestore activityLogs collection.
 * Designed to be non-blocking: never throws to the caller if Firestore logging encounters an issue.
 *
 * @param {object} activityData
 * @param {string} activityData.action - Short title of action (e.g. "Added Member Ravi Kumar")
 * @param {string} activityData.actionType - Standard key from ACTION_TYPES
 * @param {string} [activityData.adminName='Administrator']
 * @param {string} [activityData.adminEmail='']
 * @param {string} [activityData.adminId='']
 * @param {string} [activityData.targetType=''] - 'member' | 'product' | 'order' | 'plan' | 'payment'
 * @param {string} [activityData.targetId='']
 * @param {string} [activityData.details=''] - Detailed message describing the action
 * @param {string} [activityData.memberId='']
 * @param {string} [activityData.memberName='']
 * @param {string} [activityData.productId='']
 * @param {string} [activityData.productName='']
 * @param {string} [activityData.orderId='']
 * @param {string} [activityData.planId='']
 * @param {string} [activityData.paymentId='']
 * @param {number} [activityData.amount=0]
 * @param {string} [activityData.status='']
 * @returns {Promise<{ id: string, ...object } | null>}
 */
export const logAdminActivity = async (activityData) => {
  try {
    if (!activityData || !activityData.action || !activityData.actionType) {
      console.warn('[ActivityLog] Missing required action or actionType:', activityData);
      return null;
    }

    const logsRef = collection(db, ACTIVITY_LOGS_COLLECTION);
    const newLog = {
      action: String(activityData.action).trim(),
      actionType: String(activityData.actionType).trim(),
      adminName: String(activityData.adminName || 'Administrator').trim(),
      adminEmail: String(activityData.adminEmail || '').trim(),
      adminId: String(activityData.adminId || '').trim(),
      targetType: String(activityData.targetType || '').trim(),
      targetId: String(activityData.targetId || '').trim(),
      details: String(activityData.details || '').trim(),
      memberId: String(activityData.memberId || '').trim(),
      memberName: String(activityData.memberName || '').trim(),
      productId: String(activityData.productId || '').trim(),
      productName: String(activityData.productName || '').trim(),
      orderId: String(activityData.orderId || '').trim(),
      planId: String(activityData.planId || '').trim(),
      paymentId: String(activityData.paymentId || '').trim(),
      amount: typeof activityData.amount === 'number' ? activityData.amount : 0,
      status: String(activityData.status || '').trim(),
      createdAt: new Date().toISOString(),
    };

    const docRef = await addDoc(logsRef, newLog);
    return { id: docRef.id, ...newLog };
  } catch (err) {
    // Non-blocking resilience: Log warning to console, do not throw or disrupt caller
    console.warn('[ActivityLog] Failed to record activity log (non-blocking):', err);
    return null;
  }
};

/**
 * Fetch activity logs with newest first, and optional client/query filtering
 *
 * @param {object} [options={}]
 * @param {string} [options.actionType='all'] - Specific actionType or group ('members', 'products', etc.)
 * @param {string} [options.date=''] - YYYY-MM-DD date string
 * @param {string} [options.memberQuery=''] - Member name or ID search query
 * @param {number} [options.limitCount=300]
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getActivityLogs = async ({
  actionType = 'all',
  date = '',
  memberQuery = '',
  limitCount = 300,
} = {}) => {
  const logsRef = collection(db, ACTIVITY_LOGS_COLLECTION);

  let docs = [];
  try {
    const q = query(logsRef, orderBy('createdAt', 'desc'), firestoreLimit(limitCount));
    const snapshot = await getDocs(q);
    docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback if index on createdAt is compiling or unavailable
    const q = query(logsRef, firestoreLimit(limitCount));
    const snapshot = await getDocs(q);
    docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  // Filter in memory for maximum search flexibility
  return docs.filter((log) => {
    // 1. Action Type / Group Filter
    if (actionType && actionType !== 'all') {
      if (actionType === 'members') {
        if (!log.actionType.startsWith('member_')) return false;
      } else if (actionType === 'products') {
        if (!log.actionType.startsWith('product_')) return false;
      } else if (actionType === 'orders') {
        if (!log.actionType.startsWith('order_')) return false;
      } else if (actionType === 'plans') {
        if (!log.actionType.startsWith('plan_')) return false;
      } else if (actionType === 'payments') {
        if (!log.actionType.startsWith('payment_')) return false;
      } else if (log.actionType !== actionType) {
        return false;
      }
    }

    // 2. Date Filter (matches YYYY-MM-DD prefix of ISO string)
    if (date) {
      const logDate = (log.createdAt || '').slice(0, 10);
      if (logDate !== date) return false;
    }

    // 3. Member / Search Query Filter
    if (memberQuery && memberQuery.trim()) {
      const qLower = memberQuery.trim().toLowerCase();
      const matchMemberId = (log.memberId || '').toLowerCase().includes(qLower);
      const matchMemberName = (log.memberName || '').toLowerCase().includes(qLower);
      const matchDetails = (log.details || '').toLowerCase().includes(qLower);
      const matchAction = (log.action || '').toLowerCase().includes(qLower);
      const matchAdmin = (log.adminName || '').toLowerCase().includes(qLower) || (log.adminEmail || '').toLowerCase().includes(qLower);
      const matchProduct = (log.productName || '').toLowerCase().includes(qLower);
      const matchOrder = (log.orderId || '').toLowerCase().includes(qLower);

      if (!matchMemberId && !matchMemberName && !matchDetails && !matchAction && !matchAdmin && !matchProduct && !matchOrder) {
        return false;
      }
    }

    return true;
  });
};
