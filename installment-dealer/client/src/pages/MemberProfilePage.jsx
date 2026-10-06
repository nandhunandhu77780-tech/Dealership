import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import MemberNavbar from '../components/MemberNavbar.jsx';
import {
  getMemberProfile,
  updateMemberProfile,
  changeMemberPassword,
  validateProfileInput,
} from '../services/profileService.js';
import { sanitizeErrorMessage } from '../utils/formatters.js';
import {
  isNotificationSupported,
  getNotificationPermissionStatus,
  requestNotificationPermissionAndGetToken,
  unregisterDeviceToken,
  sendTestPushNotification,
} from '../services/fcmService.js';

const MemberProfilePage = () => {
  const { currentUser, reloadProfile } = useAuth();

  // Profile data & loading state
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states for editable fields
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Password change state (for email/password users)
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Notification banners
  const [notification, setNotification] = useState(null);
  const [passwordNotification, setPasswordNotification] = useState(null);

  // FCM Push Notification settings state
  const [notifPermission, setNotifPermission] = useState(getNotificationPermissionStatus());
  const [notifActionLoading, setNotifActionLoading] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState(null);

  const showProfileNotification = (message, type = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const showPasswordNotice = (message, type = 'success') => {
    setPasswordNotification({ type, message });
    setTimeout(() => {
      setPasswordNotification(null);
    }, 5000);
  };

  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await getMemberProfile(currentUser);
      setProfile(data);
      setFormData({
        name: data.name || '',
        phone: data.phone || '',
        address: data.address || '',
      });
    } catch (err) {
      console.error('Failed to load member profile:', err);
      showProfileNotification(
        sanitizeErrorMessage(err, 'Unable to load profile data. Please refresh and try again.'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setNotifPermission(getNotificationPermissionStatus());
  }, [currentUser?.uid]);

  const handleEnablePush = async () => {
    if (!currentUser?.uid) return;
    setNotifActionLoading(true);
    setNotifFeedback(null);
    try {
      const result = await requestNotificationPermissionAndGetToken(currentUser.uid);
      setNotifPermission(result.permission);
      if (result.success) {
        setNotifFeedback({ type: 'success', message: 'Push notifications are now enabled on this device!' });
      } else {
        setNotifFeedback({ type: 'error', message: result.message || 'Notification permission was not granted.' });
      }
    } catch (err) {
      setNotifFeedback({ type: 'error', message: err.message || 'Failed to enable push notifications.' });
    } finally {
      setNotifActionLoading(false);
    }
  };

  const handleDisablePush = async () => {
    if (!currentUser?.uid) return;
    setNotifActionLoading(true);
    setNotifFeedback(null);
    try {
      await unregisterDeviceToken(currentUser.uid);
      setNotifFeedback({ type: 'info', message: 'Device token removed. Notifications disabled for this browser.' });
    } catch (err) {
      setNotifFeedback({ type: 'error', message: 'Failed to disable push notifications.' });
    } finally {
      setNotifActionLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    if (!currentUser?.uid) return;
    setNotifActionLoading(true);
    setNotifFeedback(null);
    try {
      const res = await sendTestPushNotification(currentUser.uid);
      if (res.success) {
        setNotifFeedback({ type: 'success', message: res.message || 'Test push notification sent! Check your device alerts.' });
      } else {
        setNotifFeedback({ type: 'error', message: res.message || 'Failed to trigger test push notification.' });
      }
    } catch (err) {
      setNotifFeedback({ type: 'error', message: err.message || 'Error triggering test push notification.' });
    } finally {
      setNotifActionLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const validation = validateProfileInput(formData);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMemberProfile(currentUser.uid, {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
      });
      setProfile((prev) => ({ ...prev, ...updated }));
      if (reloadProfile) {
        await reloadProfile();
      }
      showProfileNotification('Profile updated successfully!', 'success');
    } catch (err) {
      console.error('Failed to update member profile:', err);
      const errMsg = err?.message || 'Failed to update profile. Please try again.';
      if (errMsg.toLowerCase().includes('mobile') || errMsg.toLowerCase().includes('phone')) {
        setFormErrors((prev) => ({ ...prev, phone: errMsg }));
      }
      showProfileNotification(
        sanitizeErrorMessage(err, 'Failed to update profile. Please try again.'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordData.currentPassword) {
      showPasswordNotice('Please enter your current password.', 'error');
      return;
    }
    if (!passwordData.newPassword) {
      showPasswordNotice('Please enter a new password.', 'error');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      showPasswordNotice('New password must be at least 6 characters.', 'error');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showPasswordNotice('New password and confirm password do not match.', 'error');
      return;
    }

    setPasswordSaving(true);
    try {
      await changeMemberPassword(
        currentUser,
        passwordData.currentPassword,
        passwordData.newPassword
      );
      showPasswordNotice('Password changed successfully!', 'success');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      console.error('Failed to change password:', err);
      const code = err.code;
      let errorMsg = 'Failed to change password.';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        errorMsg = 'Current password is incorrect. Please re-enter your existing password.';
      } else if (code === 'auth/weak-password') {
        errorMsg = 'New password is too weak. Please choose a stronger password.';
      } else if (code === 'auth/requires-recent-login') {
        errorMsg = 'Security verification failed. Please sign out and sign in again before changing password.';
      } else if (err.message) {
        errorMsg = sanitizeErrorMessage(err);
      }
      showPasswordNotice(errorMsg, 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  const isActiveMember = (profile?.status || '').toLowerCase() === 'active';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Unified Member Navigation */}
      <MemberNavbar activePage="profile" />

      {/* Main Container */}
      <main className="container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1.5rem', paddingBottom: '3rem' }}>
        {/* Breadcrumb / Title Bar */}
        <div style={{
          marginBottom: '1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
                Member Portal
              </span>
              <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>/</span>
              <span style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: '700' }}>
                My Profile
              </span>
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
              Account & Profile Management
            </h1>
          </div>

          <button
            type="button"
            onClick={loadData}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.55rem 0.95rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              color: '#334155',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
            title="Refresh Profile"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Global Toast / Notification */}
        {notification && (
          <div style={{
            backgroundColor: notification.type === 'error' ? '#fef2f2' : '#ecfdf5',
            border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
            color: notification.type === 'error' ? '#b91c1c' : '#047857',
            padding: '0.85rem 1.15rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{notification.type === 'error' ? '⚠️' : '✅'}</span>
              <span>{notification.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#64748b', fontWeight: '500' }}>
              Loading your profile information...
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {/* Hero Profile Overview Card */}
            <section style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              padding: '1.75rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.25rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  backgroundColor: '#eff6ff',
                  border: '2px solid #bfdbfe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  flexShrink: 0,
                }}>
                  👤
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                      {profile?.name || 'Member'}
                    </h2>
                    <span style={{
                      padding: '0.2rem 0.65rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: isActiveMember ? '#ecfdf5' : '#f1f5f9',
                      color: isActiveMember ? '#047857' : '#64748b',
                      border: `1px solid ${isActiveMember ? '#a7f3d0' : '#cbd5e1'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: isActiveMember ? '#10b981' : '#94a3b8',
                      }} />
                      {isActiveMember ? 'Active Account' : 'Inactive Account'}
                    </span>
                  </div>

                  {/* Primary Contact Identification: Mobile Number */}
                  <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {profile?.phone ? (
                      <span style={{
                        fontSize: '1.05rem',
                        fontWeight: '800',
                        color: '#0a2540',
                        backgroundColor: '#f0fdf4',
                        border: '1.5px solid #86efac',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.5rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 1px 3px rgba(16, 185, 129, 0.12)',
                      }}>
                        <span style={{ color: '#059669', fontSize: '1rem' }}>📞</span>
                        <span style={{ letterSpacing: '0.02em' }}>{profile.phone}</span>
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: '700',
                        color: '#b91c1c',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '0.5rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}>
                        <span>⚠️</span> Mobile Number Missing
                      </span>
                    )}
                  </div>

                  <p style={{ color: '#64748b', fontSize: '0.825rem', marginTop: '0.35rem', margin: 0 }}>
                    <span style={{ color: '#94a3b8' }}>Account Email:</span> {profile?.email || 'N/A'} &bull; Member Since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '2026'}
                  </p>
                </div>
              </div>

              {/* Member ID pill badge */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
                padding: '0.75rem 1.25rem',
                textAlign: 'right',
              }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', fontWeight: '600' }}>
                  Member Identifier
                </span>
                <code style={{
                  fontSize: '1.15rem',
                  fontWeight: '800',
                  color: '#ea580c',
                  letterSpacing: '0.05em',
                }}>
                  {profile?.memberId || 'MEM-0000'}
                </code>
              </div>
            </section>

            {/* Warning Banner if Mobile Number is Missing */}
            {(!profile?.phone || String(profile.phone).trim().length < 10) && (
              <div style={{
                backgroundColor: '#fffbeb',
                border: '1.5px solid #fde68a',
                borderRadius: '0.85rem',
                padding: '1.1rem 1.35rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.08)',
              }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>📱</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '800', color: '#92400e' }}>
                    Please Register Your Mobile Number
                  </h4>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#b45309', lineHeight: 1.45 }}>
                    NANDANAM Agencies identifies customers by <strong>Full Name</strong> and <strong>Mobile Number</strong> for receipts, payment tracking, and installment updates. Please enter your valid 10-digit mobile number in the form below and click Save.
                  </p>
                </div>
              </div>
            )}

            {/* Read-Only Account Metadata Grid */}
            <section style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              padding: '1.5rem 1.75rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.75rem',
              }}>
                <span style={{ fontSize: '1.1rem' }}>🛡️</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                  System-Managed Account Details
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 'auto', fontWeight: '500' }}>
                  🔒 Read-Only (Managed by NANDANAM Agencies)
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
              }}>
                {/* Member ID */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '0.85rem 1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Member ID</span>
                    <span title="Assigned by NANDANAM Agencies and immutable" style={{ fontSize: '0.85rem', cursor: 'help' }}>🔒</span>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '800', color: '#ea580c' }}>
                    {profile?.memberId || 'N/A'}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>System assigned ID</span>
                </div>

                {/* Registered Email */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '0.85rem 1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Account Email</span>
                    <span title="Primary authentication identity" style={{ fontSize: '0.85rem', cursor: 'help' }}>🔒</span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', wordBreak: 'break-all' }}>
                    {profile?.email || 'N/A'}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {profile?.isGoogleUser ? 'Google OAuth Identity' : 'Verified Email Login'}
                  </span>
                </div>

                {/* Account Role */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '0.85rem 1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Access Role</span>
                    <span title="Security permissions level" style={{ fontSize: '0.85rem', cursor: 'help' }}>🔒</span>
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1d4ed8', textTransform: 'capitalize' }}>
                    {profile?.role || 'member'}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Customer installment permissions</span>
                </div>

                {/* Account Status */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '0.85rem 1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Status</span>
                    <span title="Status managed by NANDANAM Agencies administration" style={{ fontSize: '0.85rem', cursor: 'help' }}>🔒</span>
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: '800',
                    color: isActiveMember ? '#047857' : '#b91c1c',
                    textTransform: 'capitalize',
                  }}>
                    {profile?.status || 'active'}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Authorized for installment plans</span>
                </div>
              </div>
            </section>

            {/* Editable Profile Form */}
            <section style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              padding: '1.75rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.75rem',
              }}>
                <span style={{ fontSize: '1.2rem' }}>✏️</span>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                    Personal Contact Information
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.825rem', margin: 0, marginTop: '0.15rem' }}>
                    Keep your contact details up to date for order deliveries and collection notices.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} noValidate>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  {/* Full Name */}
                  <div>
                    <label
                      htmlFor="profile-name"
                      style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', marginBottom: '0.4rem' }}
                    >
                      Full Name <span style={{ color: '#ea580c' }}>*</span>
                    </label>
                    <input
                      id="profile-name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="e.g. Karthi Selvam"
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        backgroundColor: '#ffffff',
                        border: `1px solid ${formErrors.name ? '#fecaca' : '#cbd5e1'}`,
                        borderRadius: '0.5rem',
                        color: '#0f172a',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                    {formErrors.name && (
                      <span style={{ display: 'block', color: '#b91c1c', fontSize: '0.775rem', marginTop: '0.3rem' }}>
                        {formErrors.name}
                      </span>
                    )}
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label
                      htmlFor="profile-phone"
                      style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', marginBottom: '0.4rem' }}
                    >
                      Phone Number <span style={{ color: '#ea580c' }}>*</span>
                    </label>
                    <input
                      id="profile-phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="e.g. 9876543210 or +91 9876543210"
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        backgroundColor: '#ffffff',
                        border: `1px solid ${formErrors.phone ? '#fecaca' : '#cbd5e1'}`,
                        borderRadius: '0.5rem',
                        color: '#0f172a',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                    {formErrors.phone ? (
                      <span style={{ display: 'block', color: '#b91c1c', fontSize: '0.775rem', marginTop: '0.3rem' }}>
                        {formErrors.phone}
                      </span>
                    ) : (
                      <span style={{ display: 'block', color: '#64748b', fontSize: '0.725rem', marginTop: '0.3rem' }}>
                        Must include at least 10 digits
                      </span>
                    )}
                  </div>
                </div>

                {/* Delivery / Residential Address */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label
                    htmlFor="profile-address"
                    style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', marginBottom: '0.4rem' }}
                  >
                    Delivery / Residential Address <span style={{ color: '#ea580c' }}>*</span>
                  </label>
                  <textarea
                    id="profile-address"
                    name="address"
                    rows="3"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter your street, door number, area, city and pincode..."
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      backgroundColor: '#ffffff',
                      border: `1px solid ${formErrors.address ? '#fecaca' : '#cbd5e1'}`,
                      borderRadius: '0.5rem',
                      color: '#0f172a',
                      fontSize: '0.9rem',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                  {formErrors.address ? (
                    <span style={{ display: 'block', color: '#b91c1c', fontSize: '0.775rem', marginTop: '0.3rem' }}>
                      {formErrors.address}
                    </span>
                  ) : (
                    <span style={{ display: 'block', color: '#64748b', fontSize: '0.725rem', marginTop: '0.3rem' }}>
                      Auto-fills your delivery address during new installment product purchases
                    </span>
                  )}
                </div>

                {/* Submit button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '0.65rem 1.5rem',
                      backgroundColor: '#ea580c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '0.5rem',
                      fontSize: '0.9rem',
                      fontWeight: '700',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                    }}
                  >
                    {saving && <span className="btn-spinner" />}
                    <span>{saving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </form>
            </section>

            {/* Security & Password Management Card */}
            <section style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              padding: '1.75rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1.25rem',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.75rem',
              }}>
                <span style={{ fontSize: '1.2rem' }}>🔑</span>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                    Security & Sign-In Credentials
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.825rem', margin: 0, marginTop: '0.15rem' }}>
                    Manage how you access your NANDANAM Agencies account.
                  </p>
                </div>
              </div>

              {/* Password notice banner */}
              {passwordNotification && (
                <div style={{
                  backgroundColor: passwordNotification.type === 'error' ? '#fef2f2' : '#ecfdf5',
                  border: `1px solid ${passwordNotification.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
                  color: passwordNotification.type === 'error' ? '#b91c1c' : '#047857',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span>{passwordNotification.message}</span>
                  <button
                    type="button"
                    onClick={() => setPasswordNotification(null)}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  >
                    &times;
                  </button>
                </div>
              )}

              {profile?.isGoogleUser && !profile?.isPasswordUser ? (
                <div style={{
                  padding: '1.25rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #bfdbfe',
                  borderRadius: '0.75rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.3rem',
                    flexShrink: 0,
                  }}>
                    🌐
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0a2540', margin: 0, marginBottom: '0.25rem' }}>
                      Google Account Authentication Active
                    </h4>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                      You sign in seamlessly using Google Identity (<strong>{profile.email}</strong>). Since your account is managed via Google OAuth, you do not need an application password. All authentication security, 2-Step Verification, and password updates are securely managed directly through your Google Account.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleChangePassword} noValidate>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                    {/* Current Password */}
                    <div>
                      <label
                        htmlFor="current-password"
                        style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', marginBottom: '0.4rem' }}
                      >
                        Current Password
                      </label>
                      <input
                        id="current-password"
                        name="currentPassword"
                        type={showPasswords ? 'text' : 'password'}
                        value={passwordData.currentPassword}
                        onChange={handlePasswordChange}
                        placeholder="Enter existing password"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.5rem',
                          color: '#0f172a',
                          fontSize: '0.9rem',
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* New Password */}
                    <div>
                      <label
                        htmlFor="new-password"
                        style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', marginBottom: '0.4rem' }}
                      >
                        New Password
                      </label>
                      <input
                        id="new-password"
                        name="newPassword"
                        type={showPasswords ? 'text' : 'password'}
                        value={passwordData.newPassword}
                        onChange={handlePasswordChange}
                        placeholder="At least 6 characters"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.5rem',
                          color: '#0f172a',
                          fontSize: '0.9rem',
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* Confirm New Password */}
                    <div>
                      <label
                        htmlFor="confirm-password"
                        style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', marginBottom: '0.4rem' }}
                      >
                        Confirm New Password
                      </label>
                      <input
                        id="confirm-password"
                        name="confirmPassword"
                        type={showPasswords ? 'text' : 'password'}
                        value={passwordData.confirmPassword}
                        onChange={handlePasswordChange}
                        placeholder="Re-enter new password"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.5rem',
                          color: '#0f172a',
                          fontSize: '0.9rem',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* Toggle show/hide password */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#475569' }}>
                      <input
                        type="checkbox"
                        checked={showPasswords}
                        onChange={(e) => setShowPasswords(e.target.checked)}
                      />
                      <span>Show password characters</span>
                    </label>

                    <button
                      type="submit"
                      disabled={passwordSaving}
                      style={{
                        padding: '0.6rem 1.25rem',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        color: '#0a2540',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        fontWeight: '700',
                        cursor: passwordSaving ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      {passwordSaving && <span className="btn-spinner" />}
                      <span>{passwordSaving ? 'Updating...' : 'Update Password'}</span>
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Push Notifications & Overdue Alerts Card */}
            <section style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              padding: '1.75rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1.25rem',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🔔</span>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                      Push Notifications & Overdue Alerts
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '0.825rem', margin: 0, marginTop: '0.15rem' }}>
                      Real-time browser notifications for payment deadlines and overdue installment notices
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div>
                  {notifPermission === 'granted' ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: '#ecfdf5',
                      color: '#047857',
                      border: '1px solid #a7f3d0',
                    }}>
                      <span>🟢</span> Active on this Device
                    </span>
                  ) : notifPermission === 'denied' ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: '#fef2f2',
                      color: '#b91c1c',
                      border: '1px solid #fecaca',
                    }}>
                      <span>🔴</span> Blocked by Browser
                    </span>
                  ) : notifPermission === 'unsupported' ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: '#f1f5f9',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                    }}>
                      <span>⚪</span> Not Supported
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: '#fff7ed',
                      color: '#c2410c',
                      border: '1px solid #fed7aa',
                    }}>
                      <span>🟡</span> Permission Not Requested
                    </span>
                  )}
                </div>
              </div>

              {/* Feedback Alert */}
              {notifFeedback && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  backgroundColor:
                    notifFeedback.type === 'success'
                      ? '#ecfdf5'
                      : notifFeedback.type === 'error'
                      ? '#fef2f2'
                      : '#eff6ff',
                  border: `1px solid ${
                    notifFeedback.type === 'success'
                      ? '#a7f3d0'
                      : notifFeedback.type === 'error'
                      ? '#fecaca'
                      : '#bfdbfe'
                  }`,
                  color:
                    notifFeedback.type === 'success'
                      ? '#047857'
                      : notifFeedback.type === 'error'
                      ? '#b91c1c'
                      : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: '600',
                }}>
                  <span>{notifFeedback.message}</span>
                  <button
                    type="button"
                    onClick={() => setNotifFeedback(null)}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  >
                    &times;
                  </button>
                </div>
              )}

              <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: 1.5, margin: 0, marginBottom: '1rem' }}>
                Firebase Cloud Messaging (FCM) push notifications ensure you receive prompt alerts with product details, remaining balances, and due dates whenever an installment payment requires attention.
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    disabled={notifActionLoading || notifPermission === 'denied'}
                    style={{
                      padding: '0.55rem 1.25rem',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      backgroundColor: '#ea580c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '0.5rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: notifActionLoading || notifPermission === 'denied' ? 'not-allowed' : 'pointer',
                      boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                    }}
                  >
                    {notifActionLoading ? <span className="btn-spinner" /> : <span>🔔</span>}
                    <span>Enable Push Notifications</span>
                  </button>
                )}

                {notifPermission === 'granted' && (
                  <>
                    <button
                      type="button"
                      onClick={handleSendTestPush}
                      disabled={notifActionLoading}
                      style={{
                        padding: '0.55rem 1.25rem',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        color: '#0a2540',
                        borderRadius: '0.5rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        cursor: notifActionLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {notifActionLoading ? <span className="btn-spinner" /> : <span>🚀</span>}
                      <span>Send Test Push Notification</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDisablePush}
                      disabled={notifActionLoading}
                      style={{
                        padding: '0.55rem 1.25rem',
                        backgroundColor: 'transparent',
                        border: '1px solid #fecaca',
                        color: '#b91c1c',
                        borderRadius: '0.5rem',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        cursor: notifActionLoading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Disable on This Device
                    </button>
                  </>
                )}

                {notifPermission === 'denied' && (
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#b91c1c',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    lineHeight: 1.4,
                  }}>
                    ⚠️ <strong>Notifications blocked:</strong> To re-enable, please click the site permissions/padlock icon in your browser's address bar, set Notifications to <strong>Allow</strong>, and reload this page.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default MemberProfilePage;
