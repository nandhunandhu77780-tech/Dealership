import React from 'react';
import { formatINR } from '../utils/formatters.js';

const DeleteProductModal = ({ isOpen, onClose, onConfirm, product = null, loading = false }) => {
  if (!isOpen || !product) return null;

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
      zIndex: 1050,
      padding: '1.25rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: '#ffffff',
        border: '1px solid #fee2e2',
        borderRadius: '1.25rem',
        padding: '2rem',
        boxShadow: '0 20px 45px -10px rgba(10, 37, 64, 0.25)',
      }}>
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
            fontSize: '1.4rem',
            flexShrink: 0,
            border: '1px solid #fecaca',
          }}>
            🗑️
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Delete Product
            </h3>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Permanent catalog removal
            </span>
          </div>
        </div>

        <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.75rem' }}>
          Are you sure you want to delete <strong style={{ color: '#0f172a' }}>{product.name}</strong> ({product.category} &bull; {formatINR(product.price)})? This product will be permanently removed from Firestore.
        </p>

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
            onClick={() => onConfirm(product.id)}
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
            {loading ? 'Deleting...' : 'Yes, Delete Product'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteProductModal;
