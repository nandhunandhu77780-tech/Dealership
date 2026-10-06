import express from 'express';
import {
  registerMemberToken,
  unregisterMemberToken,
  sendPushNotificationToMember,
  detectAndSendAllOverdueNotifications,
} from '../services/fcmService.js';

const router = express.Router();

/**
 * POST /api/notifications/register-token
 * Register or refresh a member's FCM browser/device token
 */
router.post('/register-token', async (req, res) => {
  try {
    const { memberId, token, deviceInfo } = req.body;

    if (!memberId || !token) {
      return res.status(400).json({
        success: false,
        message: 'memberId and token are required.',
      });
    }

    const result = await registerMemberToken({
      memberId,
      token,
      deviceInfo,
      userAgent: req.headers['user-agent'] || '',
      platform: 'web',
    });

    return res.status(200).json({
      success: true,
      message: 'FCM device token registered successfully.',
      tokenId: result.tokenId,
    });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to register notification token.',
    });
  }
});

/**
 * POST /api/notifications/unregister-token
 * Remove an FCM device token upon logout or user opt-out
 */
router.post('/unregister-token', async (req, res) => {
  try {
    const { memberId, token } = req.body;

    if (!memberId && !token) {
      return res.status(400).json({
        success: false,
        message: 'memberId or token is required.',
      });
    }

    await unregisterMemberToken({ memberId, token });

    return res.status(200).json({
      success: true,
      message: 'FCM device token unregistered successfully.',
    });
  } catch (error) {
    console.error('Error unregistering FCM token:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to unregister notification token.',
    });
  }
});

/**
 * POST /api/notifications/sync-overdue
 * Scan all active plans and dispatch overdue push notifications
 */
router.post('/sync-overdue', async (req, res) => {
  try {
    const summary = await detectAndSendAllOverdueNotifications();
    return res.status(200).json({
      success: true,
      message: 'Overdue installment push notification scan completed.',
      ...summary,
    });
  } catch (error) {
    console.error('Error syncing overdue notifications:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to scan and send overdue notifications.',
    });
  }
});

/**
 * POST /api/notifications/test-push
 * Dispatch a test push notification to verify member device reception
 */
router.post('/test-push', async (req, res) => {
  try {
    const { memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: 'memberId is required.',
      });
    }

    const testPayload = {
      title: 'Payment Overdue',
      body: 'Test alert: Installment #2 for Samsung 55" 4K Smart TV (₹4,000) was due on 2026-09-20 and is overdue.',
      data: {
        title: 'Payment Overdue',
        productName: 'Samsung 55" 4K Smart TV',
        installmentNumber: '2',
        remainingAmount: '4000',
        dueDate: '2026-09-20',
        url: '/member/installments',
        type: 'overdue-test',
        tag: 'test-push',
      },
    };

    const result = await sendPushNotificationToMember(memberId, testPayload);

    if (result.reason === 'no_tokens') {
      return res.status(404).json({
        success: false,
        message: 'No active push notification tokens registered for this member. Please click Enable Notifications first.',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Test push notification dispatched to ${result.sentCount || 1} active device(s).`,
      details: result,
    });
  } catch (error) {
    console.error('Error sending test push notification:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send test push notification.',
    });
  }
});

/**
 * POST /api/notifications/delivery-update
 * Dispatch push notification to a member when admin sets or updates expected delivery date
 */
router.post('/delivery-update', async (req, res) => {
  try {
    const { memberId, orderId, productName, deliveryDate, formattedDeliveryDate } = req.body;

    if (!memberId || !orderId || !deliveryDate) {
      return res.status(400).json({
        success: false,
        message: 'memberId, orderId, and deliveryDate are required.',
      });
    }

    const displayDate = formattedDeliveryDate || deliveryDate;
    const title = 'Delivery Date Updated';
    const body = `Your order for ${productName || 'your product'} is scheduled for delivery on ${displayDate}.`;

    const pushPayload = {
      title,
      body,
      data: {
        title,
        body,
        orderId,
        productName: productName || 'Product',
        deliveryDate,
        displayDate,
        url: `/member/orders?orderId=${orderId}`,
        type: 'delivery_date_updated',
        tag: `delivery-${orderId}-${String(deliveryDate).replace(/[^0-9]/g, '')}`,
      },
    };

    const result = await sendPushNotificationToMember(memberId, pushPayload);

    return res.status(200).json({
      success: true,
      message: result.reason === 'no_tokens'
        ? 'No active device push tokens registered for member.'
        : `Delivery push notification dispatched (${result.sentCount || 0} sent).`,
      pushResult: result,
    });
  } catch (error) {
    console.error('Error sending delivery push notification:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to dispatch delivery push notification.',
    });
  }
});

/**
 * POST /api/notifications/delivery-status-update
 * Dispatch push notification to a member when admin changes delivery status:
 * - Preparing → “Your order is being prepared.”
 * - Out for Delivery → “Your order is out for delivery.”
 * - Delivered → “Your order has been delivered.”
 */
router.post('/delivery-status-update', async (req, res) => {
  try {
    const { memberId, orderId, productName, deliveryStatus } = req.body;

    if (!memberId || !orderId || !deliveryStatus) {
      return res.status(400).json({
        success: false,
        message: 'memberId, orderId, and deliveryStatus are required.',
      });
    }

    let body = '';
    let title = 'Delivery Status Update';

    switch (deliveryStatus) {
      case 'Preparing':
        title = 'Order Preparing';
        body = 'Your order is being prepared.';
        break;
      case 'Out for Delivery':
        title = 'Order Out for Delivery';
        body = 'Your order is out for delivery.';
        break;
      case 'Delivered':
        title = 'Order Delivered';
        body = 'Your order has been delivered.';
        break;
      default:
        body = `Your order status has been updated to ${deliveryStatus}.`;
        break;
    }

    const pushPayload = {
      title,
      body,
      data: {
        title,
        body,
        orderId,
        productName: productName || 'Product',
        deliveryStatus,
        url: `/member/orders?orderId=${orderId}`,
        type: 'delivery_status_updated',
        tag: `delivstatus-${orderId}-${String(deliveryStatus).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      },
    };

    const result = await sendPushNotificationToMember(memberId, pushPayload);

    return res.status(200).json({
      success: true,
      message: result.reason === 'no_tokens'
        ? 'No active device push tokens registered for member.'
        : `Delivery status push notification dispatched (${result.sentCount || 0} sent).`,
      pushResult: result,
    });
  } catch (error) {
    console.error('Error sending delivery status push notification:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to dispatch delivery status push notification.',
    });
  }
});

export default router;

