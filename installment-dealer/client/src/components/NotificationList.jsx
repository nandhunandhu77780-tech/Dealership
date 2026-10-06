import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getNotificationsByMember,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  syncMemberNotifications,
} from '../services/notificationService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';

const NOTIF_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'delivery_date_updated', label: 'Deliveries' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'due_today', label: 'Due Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'payment_success', label: 'Payments' },
];

const NotificationList = ({ memberId, onNotificationCountChange = null }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  const loadAndSyncNotifications = async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Sync notifications from active installment schedules and payments
      await syncMemberNotifications(memberId);

      // 2. Fetch all notifications
      const data = await getNotificationsByMember(memberId);
      setNotifications(data || []);

      if (onNotificationCountChange) {
        const unread = (data || []).filter((n) => !n.read).length;
        onNotificationCountChange(unread);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(sanitizeErrorMessage(err, 'Unable to load notifications. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAndSyncNotifications();
  }, [memberId]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'unread') return !n.read;
      if (activeTab === 'delivery_date_updated') return n.type === 'delivery_date_updated' || n.type === 'delivery' || n.type === 'delivery_status_updated';
      return n.type === activeTab;
    });
  }, [notifications, activeTab]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      if (onNotificationCountChange) {
        onNotificationCountChange(Math.max(0, unreadCount - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || actionLoading) return;
    setActionLoading(true);
    try {
      await markAllNotificationsAsRead(memberId);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
      if (onNotificationCountChange) {
        onNotificationCountChange(0);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'delivery_status_updated':
      case 'delivery_date_updated':
      case 'delivery':
        return {
          icon: '🚚',
          label: 'Delivery Update',
          bg: '#eff6ff',
          color: '#1d4ed8',
          border: '#bfdbfe',
        };
      case 'overdue':
        return {
          icon: '⚠️',
          label: 'Overdue',
          bg: '#fef2f2',
          color: '#b91c1c',
          border: '#fecaca',
        };
      case 'due_today':
        return {
          icon: '⏱',
          label: 'Due Today',
          bg: '#fff7ed',
          color: '#c2410c',
          border: '#fed7aa',
        };
      case 'upcoming':
        return {
          icon: '📅',
          label: 'Upcoming Due',
          bg: '#eff6ff',
          color: '#1d4ed8',
          border: '#bfdbfe',
        };
      case 'payment_success':
      default:
        return {
          icon: '✅',
          label: 'Payment Received',
          bg: '#ecfdf5',
          color: '#047857',
          border: '#a7f3d0',
        };
    }
  };

  return (
    <section
      id="notifications-section"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1rem',
        padding: '1.75rem',
        marginBottom: '2.5rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem',
          paddingBottom: '0.85rem',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '1.4rem' }}>🔔</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
                Installment Notifications & Alerts
              </h2>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: '#ea580c',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '9999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            <p style={{ color: '#64748b', fontSize: '0.825rem', margin: '0.2rem 0 0' }}>
              Stay updated on upcoming due dates, overdue dues, and payment confirmations
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={actionLoading}
              style={{
                fontSize: '0.8rem',
                padding: '0.45rem 0.85rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#334155',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>✓✓</span>
              <span>{actionLoading ? 'Updating...' : 'Mark All Read'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadAndSyncNotifications}
            disabled={loading}
            style={{
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              color: '#334155',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Refresh notifications"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        {NOTIF_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          let count = 0;
          if (tab.id === 'all') count = notifications.length;
          else if (tab.id === 'unread') count = unreadCount;
          else if (tab.id === 'delivery_date_updated') count = notifications.filter((n) => n.type === 'delivery_date_updated' || n.type === 'delivery' || n.type === 'delivery_status_updated').length;
          else count = notifications.filter((n) => n.type === tab.id).length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '0.5rem',
                border: '1px solid',
                borderColor: isActive ? '#0a2540' : '#e2e8f0',
                backgroundColor: isActive ? '#0a2540' : '#ffffff',
                color: isActive ? '#ffffff' : '#64748b',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '9999px',
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.2)' : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#475569',
                  fontWeight: '700',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 0.75rem', width: '36px', height: '36px' }} />
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: '500' }}>Checking installment schedules for alerts...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div
          style={{
            padding: '0.85rem 1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            color: '#b91c1c',
            fontSize: '0.85rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: '500',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={loadAndSyncNotifications}
            style={{
              padding: '0.35rem 0.75rem',
              backgroundColor: '#ffffff',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              borderRadius: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredNotifications.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '2.5rem 1rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }}>
            {activeTab === 'unread' ? '✨' : '🔕'}
          </div>
          <div style={{ fontSize: '1.05rem', color: '#0a2540', fontWeight: '700', marginBottom: '0.25rem' }}>
            {activeTab === 'unread' ? 'All caught up!' : 'No notifications in this category'}
          </div>
          <p style={{ fontSize: '0.825rem', maxWidth: '380px', margin: '0 auto', color: '#64748b', lineHeight: 1.5 }}>
            {activeTab === 'unread'
              ? 'You have no unread notifications. All upcoming and overdue alerts have been acknowledged.'
              : 'As installment due dates approach or payments are recorded, your updates will appear here.'}
          </p>
        </div>
      )}

      {/* Notifications List */}
      {!loading && !error && filteredNotifications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredNotifications.map((notif) => {
            const badge = getTypeBadge(notif.type);
            const isUnread = !notif.read;

            return (
              <div
                key={notif.id}
                style={{
                  backgroundColor: isUnread ? '#f0f9ff' : '#ffffff',
                  border: `1px solid ${isUnread ? '#bae6fd' : '#e2e8f0'}`,
                  borderRadius: '0.75rem',
                  padding: '1.15rem 1.25rem',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                  boxShadow: isUnread ? '0 2px 8px rgba(14, 165, 233, 0.08)' : 'none',
                }}
              >
                {/* Top Row: Type Badge, Title, Timestamp, Actions */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {/* Unread Indicator Dot */}
                    {isUnread && (
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: notif.type === 'overdue' ? '#b91c1c' : '#ea580c',
                          display: 'inline-block',
                          boxShadow: '0 0 6px rgba(234, 88, 12, 0.8)',
                        }}
                        title="Unread alert"
                      />
                    )}

                    {/* Event Type Badge */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      <span>{badge.icon}</span>
                      <span>{badge.label}</span>
                    </span>

                    {/* Notification Title */}
                    <h3
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: isUnread ? '800' : '600',
                        color: isUnread ? '#0a2540' : '#475569',
                        margin: 0,
                      }}
                    >
                      {notif.title}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkAsRead(notif.id, e)}
                        style={{
                          background: 'none',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.35rem',
                          color: '#0284c7',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.55rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          transition: 'all 0.15s',
                        }}
                        title="Mark as read"
                        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e0f2fe')}
                        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span>✓</span>
                        <span>Mark read</span>
                      </button>
                    )}

                    {notif.read && (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>
                        ✓ Read
                      </span>
                    )}
                  </div>
                </div>

                {/* Short Descriptive Message */}
                <p
                  style={{
                    color: isUnread ? '#334155' : '#64748b',
                    fontSize: '0.85rem',
                    margin: '0 0 0.85rem',
                    lineHeight: 1.5,
                  }}
                >
                  {notif.message}
                </p>

                {/* Details Footer */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    paddingTop: '0.65rem',
                    borderTop: `1px solid ${isUnread ? '#e0f2fe' : '#f1f5f9'}`,
                    fontSize: '0.75rem',
                    color: '#64748b',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    {notif.productName && (
                      <span>
                        Product: <strong style={{ color: '#0f172a' }}>{notif.productName}</strong>
                      </span>
                    )}
                    {notif.orderId && (
                      <span>
                        Order ID: <code style={{ color: '#0a2540', fontWeight: '700', backgroundColor: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '0.25rem' }}>#{notif.orderId.slice(0, 8)}</code>
                      </span>
                    )}
                    {notif.deliveryStatus && (
                      <span>
                        Delivery Status: <strong style={{ color: '#1d4ed8' }}>{notif.deliveryStatus}</strong>
                      </span>
                    )}
                    {notif.deliveryDate && (
                      <span>
                        Scheduled Delivery: <strong style={{ color: '#ea580c' }}>{formatIndianDate(notif.deliveryDate)}</strong>
                      </span>
                    )}
                    {notif.installmentNumber && (
                      <span>
                        Installment: <strong style={{ color: '#1d4ed8' }}>#{notif.installmentNumber}</strong>
                      </span>
                    )}
                    {notif.amount && (
                      <span>
                        Amount: <strong style={{ color: '#047857' }}>{formatINR(notif.amount)}</strong>
                      </span>
                    )}
                    {notif.dueDate && (
                      <span>
                        Due Date: <strong style={{ color: notif.type === 'overdue' ? '#b91c1c' : '#0f172a' }}>{formatIndianDate(notif.dueDate)}</strong>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span>{formatIndianDate(notif.createdAt, true)}</span>
                    <Link
                      to={notif.link || (notif.orderId ? `/member/orders?orderId=${notif.orderId}` : '/member/installments')}
                      style={{
                        color: '#ea580c',
                        fontWeight: '700',
                        textDecoration: 'none',
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                      }}
                    >
                      {notif.type === 'delivery_date_updated' || notif.orderId ? 'View Order \u2192' : 'View Plans \u2192'}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default NotificationList;
