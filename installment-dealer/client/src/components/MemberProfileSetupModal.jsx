import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  saveFirstLoginProfile,
  validateMobileFormat,
  checkMobileNumberUnique,
  normalizePhoneNumber,
} from '../services/profileService.js';
import { sanitizeErrorMessage } from '../utils/formatters.js';

/**
 * Member Profile Setup Modal for first login or missing mobile number.
 * Ensures every customer has a Full Name and unique Mobile Number.
 */
const MemberProfileSetupModal = () => {
  const { currentUser, userProfile, reloadProfile, logout } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Check if profile setup is required:
  // Non-admin members where mobile is missing or profileCompleted is not true
  const isAdmin = userProfile?.role === 'admin';
  const hasPhone = Boolean(userProfile?.phone && String(userProfile.phone).trim().length >= 10);
  const isProfileComplete = userProfile?.profileCompleted === true;
  const isSetupRequired = Boolean(currentUser && userProfile && !isAdmin && (!hasPhone || !isProfileComplete));

  useEffect(() => {
    if (userProfile || currentUser) {
      setName(userProfile?.name || currentUser?.displayName || '');
      setPhone(userProfile?.phone || '');
      setAddress(userProfile?.address || '');
    }
  }, [userProfile, currentUser]);

  if (!isSetupRequired) {
    return null;
  }

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setPhone(val);
    if (fieldErrors.phone) {
      setFieldErrors((prev) => ({ ...prev, phone: '' }));
    }
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const handleNameChange = (e) => {
    const val = e.target.value;
    setName(val);
    if (fieldErrors.name) {
      setFieldErrors((prev) => ({ ...prev, name: '' }));
    }
    if (errorMessage) {
      setErrorMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    const errors = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      errors.name = 'Full Name is required.';
    } else if (trimmedName.length < 2) {
      errors.name = 'Full Name must be at least 2 characters long.';
    }

    const mobileCheck = validateMobileFormat(phone);
    if (!mobileCheck.isValid) {
      errors.phone = mobileCheck.error;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    try {
      // 1. Verify uniqueness
      const uniqCheck = await checkMobileNumberUnique(mobileCheck.normalized, currentUser.uid);
      if (!uniqCheck.isUnique) {
        setErrorMessage(uniqCheck.message || 'This mobile number is already registered with another member.');
        setFieldErrors({ phone: 'Mobile number already registered.' });
        setLoading(false);
        return;
      }

      // 2. Save profile
      await saveFirstLoginProfile(currentUser, {
        name: trimmedName,
        phone: mobileCheck.normalized,
        address: address.trim(),
      });

      // 3. Reload profile in context
      if (reloadProfile) {
        await reloadProfile();
      }
    } catch (err) {
      console.error('Failed to complete first login profile setup:', err);
      setErrorMessage(sanitizeErrorMessage(err, 'Unable to complete profile setup. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLogoutLoading(true);
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLogoutLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-profile-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(7, 25, 47, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#ffffff',
          borderRadius: '1.25rem',
          borderTop: '5px solid #ea580c',
          boxShadow: '0 25px 50px -12px rgba(10, 37, 64, 0.4), 0 10px 20px -5px rgba(0, 0, 0, 0.2)',
          padding: '2.25rem',
          position: 'relative',
          maxHeight: '92vh',
          overflowY: 'auto',
          animation: 'fadeIn 0.25s ease-out',
        }}
      >
        {/* Header with Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#ffffff',
              borderRadius: '1rem',
              padding: '0.65rem 1.25rem',
              boxShadow: '0 4px 14px rgba(10, 37, 64, 0.08)',
              border: '1px solid #e2e8f0',
              marginBottom: '1rem',
            }}
          >
            <img
              src="/logo.png"
              alt="NANDANAM Agencies"
              style={{
                height: '64px',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <span
              style={{
                backgroundColor: '#fff7ed',
                color: '#c2410c',
                border: '1px solid #fed7aa',
                fontSize: '0.75rem',
                fontWeight: '800',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              First Time Setup
            </span>
          </div>

          <h2
            id="setup-profile-title"
            style={{
              fontSize: '1.45rem',
              fontWeight: '900',
              color: '#0a2540',
              margin: '0 0 0.35rem',
              letterSpacing: '-0.02em',
            }}
          >
            Complete Your Member Profile
          </h2>
          <p
            style={{
              color: '#475569',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              margin: 0,
            }}
          >
            Welcome to NANDANAM Agencies! Please provide your full name and mobile number. Our team uses your mobile number as your primary customer ID for installment agreements and order deliveries.
          </p>
        </div>

        {/* Global Error Notice */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '0.85rem 1rem',
              borderRadius: '0.65rem',
              marginBottom: '1.25rem',
              fontSize: '0.875rem',
              lineHeight: '1.45',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}>⚠️</span>
            <span style={{ fontWeight: '600' }}>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="setup-name-input"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '700',
                color: '#0f172a',
                marginBottom: '0.4rem',
              }}
            >
              Full Name <span style={{ color: '#ea580c' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '0.9rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  fontSize: '1rem',
                  pointerEvents: 'none',
                }}
              >
                👤
              </span>
              <input
                id="setup-name-input"
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. Ramesh Kumar"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.5rem',
                  backgroundColor: '#ffffff',
                  border: `1.5px solid ${fieldErrors.name ? '#f87171' : '#cbd5e1'}`,
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#2563eb';
                  e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = fieldErrors.name ? '#f87171' : '#cbd5e1';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            {fieldErrors.name && (
              <span style={{ display: 'block', color: '#b91c1c', fontSize: '0.775rem', marginTop: '0.3rem', fontWeight: '600' }}>
                {fieldErrors.name}
              </span>
            )}
          </div>

          {/* Mobile Number */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="setup-phone-input"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '700',
                color: '#0f172a',
                marginBottom: '0.4rem',
              }}
            >
              Mobile Number <span style={{ color: '#ea580c' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 0.85rem',
                  backgroundColor: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#475569',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  userSelect: 'none',
                }}
              >
                🇮🇳 +91
              </div>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  id="setup-phone-input"
                  type="tel"
                  required
                  disabled={loading}
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="9876543210"
                  maxLength={15}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#ffffff',
                    border: `1.5px solid ${fieldErrors.phone ? '#f87171' : '#cbd5e1'}`,
                    borderRadius: '0.65rem',
                    color: '#0f172a',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    letterSpacing: '0.03em',
                    outline: 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#ea580c';
                    e.target.style.boxShadow = '0 0 0 3px rgba(234, 88, 12, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = fieldErrors.phone ? '#f87171' : '#cbd5e1';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>
            {fieldErrors.phone ? (
              <span style={{ display: 'block', color: '#b91c1c', fontSize: '0.775rem', marginTop: '0.3rem', fontWeight: '600' }}>
                {fieldErrors.phone}
              </span>
            ) : (
              <span style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                Enter your 10-digit mobile number. Each member must have a unique mobile number.
              </span>
            )}
          </div>

          {/* Delivery / Residence Address */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="setup-address-input"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '700',
                color: '#0f172a',
                marginBottom: '0.4rem',
              }}
            >
              Delivery Address <span style={{ color: '#94a3b8', fontWeight: '500', fontSize: '0.8rem' }}>(Optional)</span>
            </label>
            <textarea
              id="setup-address-input"
              rows={2}
              disabled={loading}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Door No, Street, Area, City, Pincode"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '0.65rem',
                color: '#0f172a',
                fontSize: '0.9rem',
                outline: 'none',
                resize: 'vertical',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#2563eb';
                e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#cbd5e1';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-orange"
            style={{
              width: '100%',
              padding: '0.85rem 1.25rem',
              fontSize: '1rem',
              fontWeight: '800',
              borderRadius: '0.65rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
              marginBottom: '1rem',
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block',
                  }}
                />
                <span>Saving Profile...</span>
              </>
            ) : (
              <>
                <span>Save Profile &amp; Continue</span>
                <span>&rarr;</span>
              </>
            )}
          </button>

          {/* Sign Out Option */}
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={loading || logoutLoading}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {logoutLoading ? 'Signing out...' : 'Sign in with a different account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MemberProfileSetupModal;
