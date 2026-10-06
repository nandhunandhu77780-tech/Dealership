import React from 'react';
import { formatINR } from '../utils/formatters.js';

const RejectOrderModal = ({ isOpen, onClose, onConfirm, order = null, loading = false }) => {
  if (!isOpen || !order) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 37, 64, 0.45)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '1.25rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: '#ffffff',
        border: '1px solid #fee2e2',
        borderRadius: '1.25rem',
        padding: '2rem',
        boxShadow: '0 20px 45px -10px rgba(10, 37, 64, 0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '0.75rem',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.35rem',
            flexShrink: 0,
            border: '1px solid #fecaca',
          }}>
            ⚠️
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Reject Order Confirmation
            </h3>
            <span style={{ fontSize: '0.825rem', color: '#ea580c', fontWeight: '700' }}>
              Order ID: #{order.id.slice(0, 8)}
            </span>
          </div>
        </div>

        {/* Body Message */}
        <p style={{ color: '#475569', fontSize: '0.925rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
          Are you sure you want to reject this order?
          <div style={{
            marginTop: '0.75rem',
            padding: '1rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            color: '#0f172a',
            fontSize: '0.875rem',
            lineHeight: '1.7',
          }}>
            <div>&bull; Member: <strong>{order.memberName}</strong> ({order.memberEmail || 'No email'})</div>
            <div>&bull; Item: <strong>{order.productName}</strong> &times; {order.quantity} unit(s)</div>
            <div>&bull; Total: <strong style={{ color: '#047857' }}>{formatINR(order.totalAmount)}</strong></div>
          </div>
          <span style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.825rem', color: '#b91c1c', fontWeight: '600' }}>
            The order status will be permanently changed to REJECTED.
          </span>
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn btn-secondary"
            style={{
              padding: '0.7rem 1.4rem',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(order.id)}
            disabled={loading}
            style={{
              padding: '0.7rem 1.5rem',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.6rem',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#b91c1c'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#dc2626'; }}
          >
            {loading && <span className="btn-spinner"></span>}
            {loading ? 'Rejecting...' : 'Yes, Reject Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectOrderModal;
