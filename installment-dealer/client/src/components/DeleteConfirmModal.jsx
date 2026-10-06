import React from 'react';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, member = null, loading = false }) => {
  if (!isOpen || !member) return null;

  return (
    <div style={{
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
      zIndex: 1050,
      padding: '1.5rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        backgroundColor: '#ffffff',
        border: '1px solid #fecaca',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            flexShrink: 0,
          }}>
            ⚠️
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
              Confirm Deletion
            </h3>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Permanent Firestore record removal
            </span>
          </div>
        </div>

        <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
          Are you sure you want to delete member <strong style={{ color: '#0a2540' }}>{member.name}</strong> (<code style={{ color: '#ea580c', fontWeight: '600' }}>{member.memberId}</code>)? This action cannot be undone.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              borderRadius: '0.5rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(member.id)}
            disabled={loading}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 4px rgba(220, 38, 38, 0.25)',
            }}
          >
            {loading && <span className="btn-spinner"></span>}
            {loading ? 'Deleting...' : 'Yes, Delete Member'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
