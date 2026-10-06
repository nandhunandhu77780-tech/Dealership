import React, { useState, useEffect } from 'react';
import { generateMemberId } from '../services/memberService.js';

const MemberModal = ({ isOpen, onClose, onSave, member = null, loading = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    memberId: '',
    status: 'active',
  });
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name || '',
        email: member.email || '',
        phone: member.phone || '',
        address: member.address || '',
        memberId: member.memberId || '',
        status: member.status || 'active',
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        memberId: generateMemberId(),
        status: 'active',
      });
    }
    setValidationError('');
  }, [member, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegenerateId = () => {
    setFormData((prev) => ({ ...prev, memberId: generateMemberId() }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    const cleanName = formData.name.trim();
    if (!cleanName) {
      setValidationError('Full Name is required.');
      return;
    }

    const rawPhone = formData.phone.trim();
    if (!rawPhone) {
      setValidationError('Mobile Number is required.');
      return;
    }

    // Validate mobile number format (standard 10-digit Indian mobile number)
    const cleanDigits = rawPhone.replace(/\D/g, '');
    let standardMobile = cleanDigits;
    if (standardMobile.startsWith('91') && standardMobile.length === 12) {
      standardMobile = standardMobile.slice(2);
    } else if (standardMobile.startsWith('0') && standardMobile.length === 11) {
      standardMobile = standardMobile.slice(1);
    }

    if (!/^[6-9]\d{9}$/.test(standardMobile)) {
      setValidationError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g. 9876543210).');
      return;
    }

    if (!formData.memberId.trim()) {
      setValidationError('Member ID is required.');
      return;
    }

    try {
      await onSave({
        ...formData,
        name: cleanName,
        phone: standardMobile,
        email: formData.email.trim(),
        address: formData.address.trim(),
      });
    } catch (err) {
      setValidationError(err?.message || 'Failed to save member details.');
    }
  };

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
      zIndex: 1000,
      padding: '1.25rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '560px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1.25rem',
        padding: '2rem',
        boxShadow: '0 20px 45px -10px rgba(10, 37, 64, 0.25)',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '0.6rem',
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                border: '1px solid #fed7aa',
              }}>
                👤
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                {member ? 'Edit Member Details' : 'Add New Member'}
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem', marginBottom: 0 }}>
              {member ? `Updating records for ${member.memberId}` : 'Register a new NANDANAM Agencies customer profile'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#64748b',
              fontSize: '1.25rem',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {validationError && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span>⚠️</span>
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Member ID and Status Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Member ID <span className="required-star" style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  name="memberId"
                  required
                  value={formData.memberId}
                  onChange={handleChange}
                  placeholder="MEM-1001"
                  style={{
                    flex: 1,
                    padding: '0.75rem 0.95rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.65rem',
                    color: '#0f172a',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
                {!member && (
                  <button
                    type="button"
                    onClick={handleRegenerateId}
                    title="Generate new ID"
                    style={{
                      padding: '0 0.85rem',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      color: '#1d4ed8',
                      borderRadius: '0.65rem',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Status <span className="required-star" style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Full Name */}
          <div style={{ marginBottom: '1.1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
              Full Name <span className="required-star" style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Ramesh Kumar"
              style={{
                width: '100%',
                padding: '0.75rem 0.95rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.65rem',
                color: '#0f172a',
                fontSize: '0.925rem',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#ea580c'}
              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* Email and Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Mobile Number <span className="required-star" style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="tel"
                name="phone"
                required
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. 9876543210"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                Primary identification key (10 digits)
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="ramesh@example.com"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>
          </div>

          {/* Address */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
              Address
            </label>
            <textarea
              name="address"
              rows={2}
              value={formData.address}
              onChange={handleChange}
              placeholder="Door No, Street, City, Pincode"
              style={{
                width: '100%',
                padding: '0.75rem 0.95rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.65rem',
                color: '#0f172a',
                fontSize: '0.9rem',
                resize: 'vertical',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#ea580c'}
              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* Modal Actions */}
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
              type="submit"
              disabled={loading}
              className="btn btn-orange"
              style={{
                padding: '0.7rem 1.6rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block'
                  }} />
                  <span>Saving...</span>
                </>
              ) : (
                member ? 'Save Changes' : 'Create Member'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MemberModal;
