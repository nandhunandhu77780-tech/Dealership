import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  isNotificationSupported,
  getNotificationPermissionStatus,
  requestNotificationPermissionAndGetToken,
  listenToForegroundMessages,
} from '../services/fcmService.js';
import { formatINR, formatIndianDate } from '../utils/formatters.js';

const DISMISS_KEY_PREFIX = 'fcm_prompt_dismissed_';

const PushNotificationManager = () => {
  const { currentUser, role } = useAuth();
  const navigate = useNavigate();

  const [permissionStatus, setPermissionStatus] = useState(getNotificationPermissionStatus());
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [promptMessage, setPromptMessage] = useState(null);

  // Active foreground toast notification
  const [foregroundAlert, setForegroundAlert] = useState(null);

  // 1. Initial permission check & automatic token refresh if already granted
  useEffect(() => {
    if (!currentUser?.uid || role !== 'member') return;

    if (!isNotificationSupported()) {
      setPermissionStatus('unsupported');
      return;
    }

    const currentPermission = getNotificationPermissionStatus();
    setPermissionStatus(currentPermission);

    if (currentPermission === 'granted') {
      // Automatically keep token fresh in Firestore
      requestNotificationPermissionAndGetToken(currentUser.uid).catch((err) => {
        console.warn('Could not refresh FCM token:', err);
      });
    } else if (currentPermission === 'default') {
      // Check if user dismissed prompt recently
      const dismissed = localStorage.getItem(`${DISMISS_KEY_PREFIX}${currentUser.uid}`);
      if (!dismissed) {
        // Wait 3 seconds after page load before showing polite banner
        const timer = setTimeout(() => {
          setShowPromptBanner(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser?.uid, role]);

  // 2. Foreground FCM listener
  useEffect(() => {
    if (!currentUser?.uid || role !== 'member') return;

    let unsubscribe = () => {};

    listenToForegroundMessages((payload) => {
      const data = payload.data || {};
      const notification = payload.notification || {};

      const alertData = {
        title: notification.title || data.title || 'Payment Overdue',
        body: notification.body || data.body || '',
        productName: data.productName || '',
        installmentNumber: data.installmentNumber || '',
        remainingAmount: data.remainingAmount ? parseFloat(data.remainingAmount) : null,
        dueDate: data.dueDate || '',
        orderId: data.orderId || '',
        deliveryDate: data.deliveryDate || '',
        type: data.type || (data.orderId ? 'delivery_date_updated' : 'overdue'),
        url: data.url || (data.orderId ? `/member/orders?orderId=${data.orderId}` : '/member/installments'),
        receivedAt: new Date(),
      };

      setForegroundAlert(alertData);

      // Auto-dismiss foreground toast after 14 seconds
      setTimeout(() => {
        setForegroundAlert((current) => (current === alertData ? null : current));
      }, 14000);
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser?.uid, role]);

  const handleEnableNotifications = async () => {
    if (!currentUser?.uid) return;
    setRequesting(true);
    setPromptMessage(null);

    const result = await requestNotificationPermissionAndGetToken(currentUser.uid);
    setRequesting(false);
    setPermissionStatus(result.permission);

    if (result.success) {
      setShowPromptBanner(false);
      setPromptMessage({ type: 'success', text: 'Real-time payment notifications enabled!' });
      setTimeout(() => setPromptMessage(null), 4000);
    } else {
      setPromptMessage({ type: 'error', text: result.message || 'Permission was not granted.' });
    }
  };

  const handleDismissPrompt = () => {
    setShowPromptBanner(false);
    if (currentUser?.uid) {
      try {
        localStorage.setItem(`${DISMISS_KEY_PREFIX}${currentUser.uid}`, 'true');
      } catch {}
    }
  };

  const handleAlertClick = () => {
    const target = foregroundAlert?.url || '/member/installments';
    setForegroundAlert(null);
    navigate(target);
  };

  if (!currentUser || role !== 'member') return null;

  return (
    <>
      {/* 1. Polite Permission Banner for first-time / undecided members */}
      {showPromptBanner && permissionStatus === 'default' && (
        <aside
          role="region"
          aria-label="Push notification permission alert"
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            left: '1.25rem',
            right: '1.25rem',
            maxWidth: '520px',
            margin: '0 auto',
            backgroundColor: '#ffffff',
            border: '1px solid #bfdbfe',
            borderRadius: '1rem',
            padding: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            animation: 'fadeInUp 0.3s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#0a2540', fontSize: '0.95rem', fontWeight: '800', display: 'block', marginBottom: '0.2rem' }}>
                Enable Overdue & Payment Alerts
              </strong>
              <p style={{ color: '#64748b', fontSize: '0.825rem', margin: 0, lineHeight: 1.4 }}>
                Get instant notifications on your device when an installment is due or overdue so you never miss a payment deadline.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismissPrompt}
              aria-label="Dismiss banner"
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '1.25rem',
                cursor: 'pointer',
                padding: '0.1rem',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={handleDismissPrompt}
              style={{
                padding: '0.45rem 0.85rem',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#475569',
                borderRadius: '0.4rem',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Maybe Later
            </button>
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={requesting}
              style={{
                padding: '0.45rem 1rem',
                backgroundColor: '#ea580c',
                border: 'none',
                color: '#ffffff',
                borderRadius: '0.4rem',
                fontSize: '0.825rem',
                fontWeight: '700',
                cursor: requesting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
              }}
            >
              {requesting ? 'Enabling...' : 'Enable Notifications'}
            </button>
          </div>
        </aside>
      )}

      {/* 2. Success/Error Feedback Toast */}
      {promptMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            backgroundColor: promptMessage.type === 'success' ? '#047857' : '#b91c1c',
            color: '#ffffff',
            padding: '0.75rem 1.25rem',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            zIndex: 1200,
            fontSize: '0.875rem',
            fontWeight: '700',
          }}
        >
          {promptMessage.text}
        </div>
      )}

      {/* 3. Foreground Push Notification Alert Card */}
      {foregroundAlert && (() => {
        const isDeliveryAlert = foregroundAlert.type === 'delivery_date_updated' || foregroundAlert.type === 'delivery' || foregroundAlert.type === 'delivery_status_updated';

        return (
          <aside
            role="alert"
            style={{
              position: 'fixed',
              top: '1.5rem',
              right: '1.5rem',
              width: '100%',
              maxWidth: '420px',
              backgroundColor: '#ffffff',
              border: `2px solid ${isDeliveryAlert ? '#bfdbfe' : '#fecaca'}`,
              borderRadius: '1rem',
              padding: '1.25rem',
              boxShadow: isDeliveryAlert
                ? '0 20px 25px -5px rgba(29, 78, 216, 0.15)'
                : '0 20px 25px -5px rgba(239, 68, 68, 0.15)',
              zIndex: 1300,
              animation: 'slideInRight 0.35s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.3rem' }}>{isDeliveryAlert ? '🚚' : '⚠️'}</span>
                <strong style={{
                  color: isDeliveryAlert ? '#0a2540' : '#b91c1c',
                  fontSize: '1rem',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  {foregroundAlert.title}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setForegroundAlert(null)}
                aria-label="Close alert"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.3rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.85rem' }}>
              {isDeliveryAlert ? (
                <>
                  <p style={{ margin: '0 0 0.5rem', color: '#334155', lineHeight: 1.45, fontWeight: '500' }}>
                    {foregroundAlert.body || `Your order for ${foregroundAlert.productName || 'your product'} is scheduled for delivery on ${foregroundAlert.deliveryDate ? formatIndianDate(foregroundAlert.deliveryDate) : 'upcoming date'}.`}
                  </p>
                  {foregroundAlert.orderId && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Order ID: <code style={{ color: '#0a2540', fontWeight: '700', backgroundColor: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '0.25rem' }}>#{foregroundAlert.orderId.slice(0, 8)}</code>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {foregroundAlert.productName && (
                    <div style={{ fontWeight: '700', marginBottom: '0.25rem', color: '#0a2540' }}>
                      📦 {foregroundAlert.productName}
                      {foregroundAlert.installmentNumber ? ` — Installment #${foregroundAlert.installmentNumber}` : ''}
                    </div>
                  )}
                  {foregroundAlert.remainingAmount != null && (
                    <div style={{ color: '#b91c1c', fontWeight: '800' }}>
                      Balance Due: {formatINR(foregroundAlert.remainingAmount)}
                    </div>
                  )}
                  {foregroundAlert.dueDate && (
                    <div style={{ color: '#64748b', fontSize: '0.775rem', marginTop: '0.15rem' }}>
                      Was due on: {formatIndianDate(foregroundAlert.dueDate)}
                    </div>
                  )}
                  {foregroundAlert.body && !foregroundAlert.productName && (
                    <div style={{ color: '#475569' }}>{foregroundAlert.body}</div>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setForegroundAlert(null)}
                style={{
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: '0.4rem',
                  fontSize: '0.775rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleAlertClick}
                style={{
                  padding: '0.45rem 1rem',
                  backgroundColor: isDeliveryAlert ? '#1d4ed8' : '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.4rem',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: isDeliveryAlert
                    ? '0 2px 4px rgba(29, 78, 216, 0.25)'
                    : '0 2px 4px rgba(234, 88, 12, 0.25)',
                }}
              >
                <span>{isDeliveryAlert ? '📦' : '💳'}</span>
                <span>{isDeliveryAlert ? 'View Order Details' : 'View & Pay Installment'}</span>
              </button>
            </div>
          </aside>
        );
      })()}
    </>
  );
};

export default PushNotificationManager;
