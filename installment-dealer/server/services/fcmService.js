import { getMessaging } from 'firebase-admin/messaging';
import { db } from '../config/db.js';

const FCM_TOKENS_COLLECTION = 'fcmTokens';
const OVERDUE_PUSH_LOGS_COLLECTION = 'overduePushLogs';
const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Format local date YYYY-MM-DD
 */
export const getLocalDateString = (d = new Date()) => {
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculate remaining amount for an installment
 */
export const getInstallmentRemainingAmount = (inst) => {
  if (!inst) return 0;
  const total = parseFloat(inst.amount) || 0;
  const paid = parseFloat(inst.paidAmount) || 0;
  return parseFloat(Math.max(0, total - paid).toFixed(2));
};

/**
 * Determine dynamic installment status based on current local date and remaining amount
 */
export const getInstallmentStatus = (inst, referenceDate = new Date()) => {
  if (!inst) return 'Upcoming';
  const remaining = getInstallmentRemainingAmount(inst);
  if (remaining <= 0) return 'Paid';

  const dueDateStr = getLocalDateString(inst.dueDate);
  const todayStr = getLocalDateString(referenceDate);

  if (!dueDateStr) return inst.status || 'Upcoming';
  if (dueDateStr < todayStr) return 'Overdue';
  if (dueDateStr === todayStr) return 'Due Today';
  return 'Upcoming';
};

/**
 * Hash a string to a safe alphanumeric ID for Firestore document keys
 */
const hashToken = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + str.slice(-16).replace(/[^a-zA-Z0-9]/g, '');
};

/**
 * Register or update an FCM device token for an authenticated member
 */
export const registerMemberToken = async ({ memberId, token, deviceInfo, userAgent, platform }) => {
  if (!memberId || !token) {
    throw new Error('Member ID and FCM registration token are required.');
  }

  const tokenId = `fcm_${memberId}_${hashToken(token)}`;
  const tokenRef = db.collection(FCM_TOKENS_COLLECTION).doc(tokenId);

  const tokenData = {
    token,
    memberId,
    deviceInfo: deviceInfo || 'Web Browser',
    userAgent: userAgent || '',
    platform: platform || 'web',
    enabled: true,
    updatedAt: new Date().toISOString(),
  };

  const existingDoc = await tokenRef.get();
  if (!existingDoc.exists) {
    tokenData.createdAt = new Date().toISOString();
  }

  await tokenRef.set(tokenData, { merge: true });
  return { tokenId, tokenData };
};

/**
 * Remove an FCM registration token from Firestore (e.g. member logout or disable)
 */
export const unregisterMemberToken = async ({ memberId, token }) => {
  if (!token && !memberId) return false;

  if (token && memberId) {
    const tokenId = `fcm_${memberId}_${hashToken(token)}`;
    await db.collection(FCM_TOKENS_COLLECTION).doc(tokenId).delete().catch(() => {});
    return true;
  }

  if (token) {
    const snap = await db.collection(FCM_TOKENS_COLLECTION).where('token', '==', token).get();
    const batch = db.batch();
    snap.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    return true;
  }

  if (memberId) {
    const snap = await db.collection(FCM_TOKENS_COLLECTION).where('memberId', '==', memberId).get();
    const batch = db.batch();
    snap.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    return true;
  }

  return false;
};

/**
 * Retrieve all active FCM tokens for a member (supports multiple devices)
 */
export const getActiveTokensForMember = async (memberId) => {
  if (!memberId) return [];

  const snap = await db
    .collection(FCM_TOKENS_COLLECTION)
    .where('memberId', '==', memberId)
    .where('enabled', '==', true)
    .get();

  const tokens = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.token) {
      tokens.push(data.token);
    }
  });

  return [...new Set(tokens)];
};

/**
 * Remove an invalid/expired token reported by Firebase Cloud Messaging
 */
export const deleteInvalidToken = async (token) => {
  try {
    const snap = await db.collection(FCM_TOKENS_COLLECTION).where('token', '==', token).get();
    const batch = db.batch();
    snap.forEach((docSnap) => {
      console.log(`[fcmService] Removing invalid/expired FCM token doc: ${docSnap.id}`);
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  } catch (err) {
    console.error('[fcmService] Error removing invalid token:', err);
  }
};

/**
 * Send push notification to a member across all active device tokens.
 * Cleans up invalid/expired tokens automatically.
 */
export const sendPushNotificationToMember = async (memberId, { title, body, data }) => {
  const tokens = await getActiveTokensForMember(memberId);
  if (!tokens || tokens.length === 0) {
    console.log(`[fcmService] No active FCM tokens for member ${memberId}. Skipping push.`);
    return { success: true, sentCount: 0, reason: 'no_tokens' };
  }

  const messaging = getMessaging();

  const message = {
    tokens,
    notification: {
      title: title || 'Payment Overdue',
      body: body || 'You have an installment payment that is overdue.',
    },
    data: {
      title: title || 'Payment Overdue',
      body: body || '',
      url: data?.url || '/member/installments',
      ...Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
      ),
    },
    webpush: {
      fcmOptions: {
        link: data?.url || '/member/installments',
      },
      notification: {
        title: title || 'Payment Overdue',
        body: body || '',
        icon: '/logo.png',
        badge: '/logo.png',
        requireInteraction: true,
        tag: data?.tag || 'overdue-alert',
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(
      `[fcmService] Multicast result for member ${memberId}: ${response.successCount} sent, ${response.failureCount} failed.`
    );

    // Inspect failed tokens and remove invalid ones (Requirement 9)
    if (response.failureCount > 0) {
      const invalidTokenCodes = [
        'messaging/invalid-registration-token',
        'messaging/registration-token-not-registered',
        'messaging/invalid-argument',
        'messaging/mismatched-credential',
      ];

      for (let i = 0; i < response.responses.length; i++) {
        const resp = response.responses[i];
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          console.warn(`[fcmService] Token failure: ${errorCode} - ${resp.error.message}`);
          if (invalidTokenCodes.includes(errorCode)) {
            await deleteInvalidToken(tokens[i]);
          }
        }
      }
    }

    return {
      success: true,
      sentCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: tokens.length,
    };
  } catch (error) {
    console.error(`[fcmService] Error sending multicast FCM to member ${memberId}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Check duplicate log to prevent duplicate overdue push notifications for the same installment
 */
export const hasOverduePushBeenSent = async (planId, installmentNumber) => {
  const logId = `overdue_log_${planId}_inst_${installmentNumber}`;
  const logDoc = await db.collection(OVERDUE_PUSH_LOGS_COLLECTION).doc(logId).get();
  return logDoc.exists;
};

/**
 * Send overdue notification for a specific installment and record log to prevent duplicates
 */
export const sendOverdueNotificationForInstallment = async ({ plan, installment, memberId }) => {
  const planId = plan.id;
  const installmentNumber = installment.installmentNumber;

  // 1. Check duplicate prevention (Requirement 7)
  const alreadySent = await hasOverduePushBeenSent(planId, installmentNumber);
  if (alreadySent) {
    console.log(`[fcmService] Duplicate push avoided: Plan ${planId} Inst #${installmentNumber} already notified.`);
    return { skipped: true, reason: 'duplicate' };
  }

  const remaining = getInstallmentRemainingAmount(installment);
  const dueDate = installment.dueDate || '';
  const productName = plan.productName || 'Product';

  // 2. Build Notification Content (Requirement 6)
  const title = 'Payment Overdue';
  const body = `Installment #${installmentNumber} for ${productName} (₹${remaining}) was due on ${dueDate} and is now overdue.`;

  const pushData = {
    title,
    productName,
    installmentNumber: String(installmentNumber),
    remainingAmount: String(remaining),
    dueDate,
    url: '/member/installments',
    planId,
    type: 'overdue',
    tag: `overdue-${planId}-${installmentNumber}`,
  };

  // 3. Send FCM Push Notification
  const pushResult = await sendPushNotificationToMember(memberId, {
    title,
    body,
    data: pushData,
  });

  // 4. Record in overduePushLogs to prevent future duplicates
  const logId = `overdue_log_${planId}_inst_${installmentNumber}`;
  await db.collection(OVERDUE_PUSH_LOGS_COLLECTION).doc(logId).set({
    planId,
    installmentNumber,
    memberId,
    productName,
    dueDate,
    remainingAmount: remaining,
    sentAt: new Date().toISOString(),
    pushResult,
  });

  // 5. Synchronize with existing in-app notifications (Requirement 10)
  const notifId = `notif_${planId}_inst_${installmentNumber}_overdue`;
  await db.collection(NOTIFICATIONS_COLLECTION).doc(notifId).set(
    {
      memberId,
      memberName: plan.memberName || 'Member',
      type: 'overdue',
      title,
      message: `Installment #${installmentNumber} for ${productName} of ₹${remaining.toFixed(2)} was due on ${dueDate} and is overdue.`,
      productName,
      installmentPlanId: planId,
      installmentNumber,
      dueDate,
      amount: remaining,
      read: false,
      readAt: null,
      pushSent: true,
      pushSentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      link: '/member/installments',
    },
    { merge: true }
  );

  return {
    success: true,
    planId,
    installmentNumber,
    memberId,
    pushResult,
  };
};

/**
 * Scan all active installment plans, dynamically detect overdue installments,
 * and send real-time push notifications without sending duplicates.
 */
export const detectAndSendAllOverdueNotifications = async () => {
  console.log('\n[fcmService] 🔎 Scanning installment plans for overdue dues...');
  const todayStr = getLocalDateString(new Date());

  const plansSnap = await db.collection('installmentPlans').get();
  let totalActivePlans = 0;
  let overdueDuesFound = 0;
  let notificationsSent = 0;
  let duplicatesSkipped = 0;

  for (const planDoc of plansSnap.docs) {
    const plan = { id: planDoc.id, ...planDoc.data() };
    const planStatus = (plan.status || '').toLowerCase();
    if (planStatus === 'completed') continue;

    totalActivePlans++;
    const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];

    for (const inst of schedule) {
      const dynamicStatus = getInstallmentStatus(inst);
      const remaining = getInstallmentRemainingAmount(inst);

      // Check if overdue
      if (dynamicStatus === 'Overdue' && remaining > 0) {
        overdueDuesFound++;
        const targetMemberId = plan.memberId;

        if (targetMemberId) {
          const res = await sendOverdueNotificationForInstallment({
            plan,
            installment: inst,
            memberId: targetMemberId,
          });

          if (res?.skipped) {
            duplicatesSkipped++;
          } else if (res?.success) {
            notificationsSent++;
          }
        }
      }
    }
  }

  console.log(
    `[fcmService] Scan completed. Active Plans: ${totalActivePlans}, Overdue Dues: ${overdueDuesFound}, Notifications Sent: ${notificationsSent}, Duplicates Skipped: ${duplicatesSkipped}.\n`
  );

  return {
    totalActivePlans,
    overdueDuesFound,
    notificationsSent,
    duplicatesSkipped,
    scannedAt: new Date().toISOString(),
  };
};
