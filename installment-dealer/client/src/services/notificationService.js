import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { formatIndianDate } from '../utils/formatters.js';
import {
  sendDeliveryDatePushNotification,
  sendDeliveryStatusPushNotification,
} from './fcmService.js';

const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Format a Date object to YYYY-MM-DD
 * @param {Date|string} date
 * @returns {string}
 */
export const formatDateToISO = (date = new Date()) => {
  if (!date) return '';
  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Automatically analyze member installment plans and payment records,
 * and create or sync notifications with deterministic IDs to prevent duplicates.
 *
 * Supported events:
 * 1. Upcoming installment due (within 7 days)
 * 2. Installment due today
 * 3. Overdue installment
 * 4. Successful payment
 *
 * @param {string} memberId - Auth UID of member
 * @returns {Promise<{ created: number, total: number }>}
 */
export const syncMemberNotifications = async (memberId) => {
  if (!memberId) return { created: 0, total: 0 };

  try {
    const today = new Date();
    const todayStr = formatDateToISO(today);

    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);
    const sevenDaysLaterStr = formatDateToISO(sevenDaysLater);

    // 1. Fetch member installment plans
    const plansQuery = query(
      collection(db, 'installmentPlans'),
      where('memberId', '==', memberId)
    );
    const plansSnap = await getDocs(plansQuery);

    // 2. Fetch member payments
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('memberId', '==', memberId)
    );
    const paymentsSnap = await getDocs(paymentsQuery);

    const notificationsToEnsure = [];

    // Analyze installment plans for due / overdue dues
    plansSnap.forEach((planDoc) => {
      const plan = { id: planDoc.id, ...planDoc.data() };
      const planStatus = (plan.status || '').toLowerCase();
      if (planStatus === 'completed') return;

      const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
      schedule.forEach((inst) => {
        if (inst.status === 'Paid') return;

        const totalAmount = parseFloat(inst.amount) || 0;
        const paidAmount = parseFloat(inst.paidAmount) || 0;
        const remaining = parseFloat(Math.max(0, totalAmount - paidAmount).toFixed(2));
        if (remaining <= 0) return;

        const dueDate = inst.dueDate || '';

        if (dueDate && dueDate < todayStr) {
          // Overdue
          notificationsToEnsure.push({
            id: `notif_${plan.id}_inst_${inst.installmentNumber}_overdue`,
            data: {
              memberId,
              memberName: plan.memberName || 'Member',
              type: 'overdue',
              title: 'Overdue Installment Alert',
              message: `Installment #${inst.installmentNumber} for ${plan.productName} of ₹${remaining.toFixed(2)} was due on ${dueDate} and is overdue.`,
              productName: plan.productName || 'Product',
              installmentPlanId: plan.id,
              installmentNumber: inst.installmentNumber,
              dueDate,
              amount: remaining,
              read: false,
              readAt: null,
              createdAt: new Date().toISOString(),
              link: '/member/installments',
            },
          });
        } else if (dueDate && dueDate === todayStr) {
          // Due Today
          notificationsToEnsure.push({
            id: `notif_${plan.id}_inst_${inst.installmentNumber}_due_today`,
            data: {
              memberId,
              memberName: plan.memberName || 'Member',
              type: 'due_today',
              title: 'Installment Due Today',
              message: `Installment #${inst.installmentNumber} for ${plan.productName} of ₹${remaining.toFixed(2)} is due today!`,
              productName: plan.productName || 'Product',
              installmentPlanId: plan.id,
              installmentNumber: inst.installmentNumber,
              dueDate,
              amount: remaining,
              read: false,
              readAt: null,
              createdAt: new Date().toISOString(),
              link: '/member/installments',
            },
          });
        } else if (dueDate && dueDate > todayStr && dueDate <= sevenDaysLaterStr) {
          // Upcoming within 7 days
          notificationsToEnsure.push({
            id: `notif_${plan.id}_inst_${inst.installmentNumber}_upcoming`,
            data: {
              memberId,
              memberName: plan.memberName || 'Member',
              type: 'upcoming',
              title: 'Upcoming Installment Due',
              message: `Installment #${inst.installmentNumber} for ${plan.productName} of ₹${remaining.toFixed(2)} is due on ${dueDate}.`,
              productName: plan.productName || 'Product',
              installmentPlanId: plan.id,
              installmentNumber: inst.installmentNumber,
              dueDate,
              amount: remaining,
              read: false,
              readAt: null,
              createdAt: new Date().toISOString(),
              link: '/member/installments',
            },
          });
        }
      });
    });

    // Analyze payment records for payment success notifications
    paymentsSnap.forEach((payDoc) => {
      const pay = { id: payDoc.id, ...payDoc.data() };
      const payId = pay.id || pay.transactionId;
      if (!payId) return;

      notificationsToEnsure.push({
        id: `notif_pay_${payId}`,
        data: {
          memberId,
          memberName: pay.memberName || 'Member',
          type: 'payment_success',
          title: 'Payment Recorded Successfully',
          message: `Your payment of ₹${parseFloat(pay.amount || 0).toFixed(2)} for Installment #${pay.installmentNumber} (${pay.productName}) was successfully received via ${pay.paymentMethod || 'Online'}.`,
          productName: pay.productName || 'Product',
          installmentPlanId: pay.installmentPlanId || '',
          installmentNumber: pay.installmentNumber || 1,
          dueDate: pay.paymentDate || todayStr,
          amount: parseFloat(pay.amount || 0),
          read: false,
          readAt: null,
          createdAt: pay.createdAt || new Date().toISOString(),
          link: '/member/payments',
        },
      });
    });

    // 3. Batch or check existing documents to avoid overriding 'read' status
    let createdCount = 0;

    for (const item of notificationsToEnsure) {
      const notifRef = doc(db, NOTIFICATIONS_COLLECTION, item.id);
      const existingSnap = await getDoc(notifRef);

      // Only create if document does not exist yet (Deterministic Deduplication)
      if (!existingSnap.exists()) {
        await setDoc(notifRef, item.data);
        createdCount++;
      }
    }

    return { created: createdCount, total: notificationsToEnsure.length };
  } catch (error) {
    console.error('[syncMemberNotifications error]', error);
    return { created: 0, total: 0 };
  }
};

/**
 * Fetch all notifications for a specific member
 * @param {string} memberId
 * @returns {Promise<Array<object>>}
 */
export const getNotificationsByMember = async (memberId) => {
  if (!memberId) return [];

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('memberId', '==', memberId)
    );
    const snap = await getDocs(q);

    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    // In-memory sort: Unread first, then by createdAt descending
    return list.sort((a, b) => {
      if (a.read !== b.read) {
        return a.read ? 1 : -1; // Unread (false) first
      }
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  } catch (error) {
    console.error('[getNotificationsByMember error]', error);
    throw error;
  }
};

/**
 * Get count of unread notifications for a member
 * @param {string} memberId
 * @returns {Promise<number>}
 */
export const getUnreadNotificationCount = async (memberId) => {
  if (!memberId) return 0;

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('memberId', '==', memberId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    return snap.size;
  } catch (error) {
    console.error('[getUnreadNotificationCount error]', error);
    return 0;
  }
};

/**
 * Mark a single notification as read
 * @param {string} notificationId
 * @returns {Promise<void>}
 */
export const markNotificationAsRead = async (notificationId) => {
  if (!notificationId) return;

  try {
    const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await updateDoc(notifRef, {
      read: true,
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[markNotificationAsRead error]', error);
    throw error;
  }
};

/**
 * Mark all unread notifications for a member as read
 * @param {string} memberId
 * @returns {Promise<number>} Number of notifications updated
 */
export const markAllNotificationsAsRead = async (memberId) => {
  if (!memberId) return 0;

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('memberId', '==', memberId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);

    if (snap.empty) return 0;

    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();

    snap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        read: true,
        readAt: nowIso,
      });
    });

    await batch.commit();
    return snap.size;
  } catch (error) {
    console.error('[markAllNotificationsAsRead error]', error);
    throw error;
  }
};

/**
 * Helper for Admins to view notification summary for a member
 * @param {string} memberId
 * @returns {Promise<{ total: number, unread: number, overdue: number, notifications: Array }>}
 */
export const getMemberNotificationSummaryForAdmin = async (memberId) => {
  if (!memberId) return { total: 0, unread: 0, overdue: 0, notifications: [] };

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('memberId', '==', memberId)
    );
    const snap = await getDocs(q);

    let unread = 0;
    let overdue = 0;
    const notifications = [];

    snap.docs.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      notifications.push(data);
      if (!data.read) unread++;
      if (data.type === 'overdue') overdue++;
    });

    notifications.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return {
      total: snap.size,
      unread,
      overdue,
      notifications,
    };
  } catch (error) {
    console.error('[getMemberNotificationSummaryForAdmin error]', error);
    return { total: 0, unread: 0, overdue: 0, notifications: [] };
  }
};

/**
 * Create an in-app notification and trigger push notification for a member
 * when the admin sets or updates their order's Expected Delivery Date.
 *
 * Requirements:
 * 1. Create an in-app notification for that specific member.
 * 2. If push notifications enabled, send push notification.
 * 3. Title: "Delivery Date Updated"
 * 4. Message: "Your order for [Product Name] is scheduled for delivery on [Delivery Date]."
 * 5. Include order ID & allow member to open related Order Details page.
 * 6. If admin changes delivery date, send new notification with updated date.
 * 7. Do not send duplicate notifications for the same unchanged delivery date.
 *
 * @param {object} params
 * @param {string} params.memberId - Target member UID
 * @param {string} [params.memberName] - Member's name
 * @param {string} params.orderId - Associated order ID
 * @param {string} params.productName - Product ordered
 * @param {string} params.deliveryDate - Expected delivery date (YYYY-MM-DD)
 * @returns {Promise<{ created: boolean, notificationId?: string, reason?: string, data?: object }>}
 */
export const notifyDeliveryDateUpdated = async ({
  memberId,
  memberName,
  orderId,
  productName,
  deliveryDate,
}) => {
  if (!memberId || !orderId || !deliveryDate) {
    return { created: false, reason: 'missing_params' };
  }

  const rawDate = typeof deliveryDate === 'string' ? deliveryDate.trim() : '';
  if (!rawDate) return { created: false, reason: 'empty_date' };

  // Deterministic ID for this specific order and delivery date
  // e.g. notif_delivery_order123_20261015
  const sanitizedDateKey = rawDate.replace(/[^0-9a-zA-Z]/g, '');
  const notificationId = `notif_delivery_${orderId}_${sanitizedDateKey}`;

  const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  const existingSnap = await getDoc(notifRef);

  // Requirement 7: Do not send duplicate notifications for the same unchanged delivery date.
  if (existingSnap.exists()) {
    console.log(`[notificationService] Notification already exists for order ${orderId} on date ${rawDate}. Skipping.`);
    return { created: false, notificationId, reason: 'already_exists' };
  }

  const formattedDate = formatIndianDate(rawDate);
  const prodName = productName || 'Product';
  const title = 'Delivery Date Updated';
  const message = `Your order for ${prodName} is scheduled for delivery on ${formattedDate}.`;

  const notifData = {
    memberId,
    memberName: memberName || 'Member',
    type: 'delivery_date_updated',
    title,
    message,
    productName: prodName,
    orderId,
    deliveryDate: rawDate,
    formattedDeliveryDate: formattedDate,
    read: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    link: `/member/orders?orderId=${orderId}`,
  };

  // 1. Create in-app notification in Firestore
  await setDoc(notifRef, notifData);

  // 2. Dispatch push notification if member has active device tokens
  try {
    await sendDeliveryDatePushNotification({
      memberId,
      orderId,
      productName: prodName,
      deliveryDate: rawDate,
      formattedDeliveryDate: formattedDate,
    });
  } catch (pushErr) {
    console.warn('[notificationService] Failed to dispatch push notification:', pushErr);
  }

  return { created: true, notificationId, data: notifData };
};

/**
 * Create an in-app notification and trigger push notification for a member
 * when the admin changes the delivery status:
 * - Preparing → “Your order is being prepared.”
 * - Out for Delivery → “Your order is out for delivery.”
 * - Delivered → “Your order has been delivered.”
 *
 * Requirements:
 * 1. Create in-app notification for that specific customer.
 * 2. If push notifications enabled, send push notification.
 * 3. Exact messages as specified.
 * 4. Only notify the customer who owns the order.
 * 5. Do not create duplicate notifications when status has not changed.
 *
 * @param {object} params
 * @param {string} params.memberId - Target member UID
 * @param {string} [params.memberName] - Member's name
 * @param {string} params.orderId - Associated order ID
 * @param {string} [params.productName] - Product ordered
 * @param {string} params.deliveryStatus - 'Preparing', 'Out for Delivery', or 'Delivered'
 * @returns {Promise<{ created: boolean, notificationId?: string, reason?: string, data?: object }>}
 */
export const notifyDeliveryStatusUpdated = async ({
  memberId,
  memberName,
  orderId,
  productName,
  deliveryStatus,
}) => {
  if (!memberId || !orderId || !deliveryStatus) {
    return { created: false, reason: 'missing_params' };
  }

  // Only notify for tracked fulfillment stages: Preparing, Out for Delivery, Delivered
  const validStages = ['Preparing', 'Out for Delivery', 'Delivered'];
  if (!validStages.includes(deliveryStatus)) {
    return { created: false, reason: 'unnotified_stage' };
  }

  // Message mapping as explicitly required by prompt
  let message = '';
  let title = 'Delivery Status Update';

  switch (deliveryStatus) {
    case 'Preparing':
      title = 'Order Preparing';
      message = 'Your order is being prepared.';
      break;
    case 'Out for Delivery':
      title = 'Order Out for Delivery';
      message = 'Your order is out for delivery.';
      break;
    case 'Delivered':
      title = 'Order Delivered';
      message = 'Your order has been delivered.';
      break;
    default:
      message = `Your order status has been updated to ${deliveryStatus}.`;
      break;
  }

  // Deterministic ID for this order and status stage
  // e.g. notif_delivstatus_order123_preparing
  const sanitizedStatusKey = deliveryStatus.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const notificationId = `notif_delivstatus_${orderId}_${sanitizedStatusKey}`;

  const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
  const existingSnap = await getDoc(notifRef);

  // Requirement: Do not create duplicate notifications when status has not changed
  if (existingSnap.exists()) {
    console.log(`[notificationService] Notification already exists for order ${orderId} stage ${deliveryStatus}. Skipping duplicate.`);
    return { created: false, notificationId, reason: 'already_exists' };
  }

  const prodName = productName || 'Product';
  const notifData = {
    memberId,
    memberName: memberName || 'Member',
    type: 'delivery_status_updated',
    title,
    message,
    productName: prodName,
    orderId,
    deliveryStatus,
    read: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    link: `/member/orders?orderId=${orderId}`,
  };

  // 1. Create in-app notification in Firestore
  await setDoc(notifRef, notifData);

  // 2. Dispatch push notification if member has active device tokens
  try {
    await sendDeliveryStatusPushNotification({
      memberId,
      orderId,
      productName: prodName,
      deliveryStatus,
    });
  } catch (pushErr) {
    console.warn('[notificationService] Failed to dispatch delivery status push notification:', pushErr);
  }

  return { created: true, notificationId, data: notifData };
};


