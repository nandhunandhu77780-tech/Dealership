import React, { useState, useEffect } from 'react';
import { getMemberNotificationSummaryForAdmin } from '../services/notificationService.js';
import { formatINR, formatIndianDate } from '../utils/formatters.js';

const MemberNotificationModal = ({ isOpen, onClose, member = null }) => {
  const [summary, setSummary] = useState({ total: 0, unread: 0, overdue: 0, notifications: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && member) {
      setLoading(true);
      const targetId = member.userId || member.id;
      getMemberNotificationSummaryForAdmin(targetId)
        .then((res) => {
          setSummary(res);
        })
        .catch((err) => {
          console.error('Failed to load member notifications for admin:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, member]);

  if (!isOpen || !member) return null;

  const getTypeBadge = (type) => {
    switch (type) {
      case 'delivery_status_updated':
      case 'delivery_date_updated':
      case 'delivery':
        return { icon: '🚚', label: 'Delivery Update', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' };
      case 'overdue':
        return { icon: '⚠️', label: 'Overdue', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };
      case 'due_today':
        return { icon: '⏱', label: 'Due Today', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' };
      case 'upcoming':
        return { icon: '📅', label: 'Upcoming', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' };
      case 'payment_success':
      default:
        return { icon: '✅', label: 'Payment Success', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' };
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '650px',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          padding: '2rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🔔</span>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                Member Notification Status
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {member.name} ({member.memberId || 'N/A'})
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Read-Only Admin Security Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 0.85rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            color: '#1e3a8a',
            marginBottom: '1.25rem',
          }}
        >
          <span>🔒</span>
          <span>
            <strong>Read-only audit:</strong> Admins can inspect notification status for members, but cannot modify a member's personal alerts.
          </span>
        </div>

        {/* Summary Metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>Total Alerts</span>
            <strong style={{ fontSize: '1.25rem', color: '#0a2540', fontWeight: '800' }}>{summary.total}</strong>
          </div>

          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>Unread</span>
            <strong style={{ fontSize: '1.25rem', color: summary.unread > 0 ? '#ea580c' : '#047857', fontWeight: '800' }}>
              {summary.unread}
            </strong>
          </div>

          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', display: 'block' }}>Overdue</span>
            <strong style={{ fontSize: '1.25rem', color: summary.overdue > 0 ? '#b91c1c' : '#047857', fontWeight: '800' }}>
              {summary.overdue}
            </strong>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ margin: 0, fontWeight: '500' }}>Loading notification status...</p>
          </div>
        ) : summary.notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', border: '1px dashed #cbd5e1' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔕</div>
            <h4 style={{ color: '#0a2540', margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: '700' }}>
              No notifications on record
            </h4>
            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: 0 }}>
              This member currently has no active installment alerts or payment notifications.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
            {summary.notifications.map((notif) => {
              const badge = getTypeBadge(notif.type);
              return (
                <div
                  key={notif.id}
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    padding: '0.85rem 1rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '9999px',
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        {badge.icon} {badge.label}
                      </span>
                      <strong style={{ color: '#0a2540', fontSize: '0.85rem' }}>
                        {notif.title}
                      </strong>
                    </div>

                    <span style={{ fontSize: '0.75rem', color: notif.read ? '#047857' : '#ea580c', fontWeight: '700' }}>
                      {notif.read ? '✓ Read' : '● Unread'}
                    </span>
                  </div>

                  <p style={{ color: '#475569', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
                    {notif.message}
                  </p>

                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#64748b', flexWrap: 'wrap' }}>
                    <span>Product: <strong style={{ color: '#0f172a' }}>{notif.productName}</strong></span>
                    <span>Inst: <strong style={{ color: '#1d4ed8' }}>#{notif.installmentNumber}</strong></span>
                    <span>Amount: <strong style={{ color: '#047857' }}>{formatINR(notif.amount)}</strong></span>
                    <span>Date: <strong style={{ color: '#0f172a' }}>{formatIndianDate(notif.dueDate)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.55rem 1.25rem',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemberNotificationModal;
