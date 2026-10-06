import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { resetPassword, formatAuthError } from '../services/authService.js';
import { sanitizeErrorMessage } from '../utils/formatters.js';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // Forgot Password States
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const { login, loginGoogle, currentUser, role, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && currentUser) {
      const intendedDestination = location.state?.from?.pathname;
      const userRole = role || 'member';
      if (
        intendedDestination &&
        !intendedDestination.startsWith('/login') &&
        (userRole === 'admin' || !intendedDestination.startsWith('/admin'))
      ) {
        navigate(intendedDestination + (location.state?.from?.search || ''), { replace: true });
      } else if (userRole === 'admin') {
        navigate('/admin', { replace: true });
      } else if (userRole === 'member') {
        navigate('/member', { replace: true });
      }
    }
  }, [currentUser, role, loading, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { profile } = await login(email.trim(), password);
      const userRole = profile?.role || 'member';
      const intendedDestination = location.state?.from?.pathname;

      if (
        intendedDestination &&
        !intendedDestination.startsWith('/login') &&
        (userRole === 'admin' || !intendedDestination.startsWith('/admin'))
      ) {
        navigate(intendedDestination + (location.state?.from?.search || ''), { replace: true });
      } else if (userRole === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/member', { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);

    try {
      const { profile } = await loginGoogle();
      const userRole = profile?.role || 'member';
      const intendedDestination = location.state?.from?.pathname;

      if (
        intendedDestination &&
        !intendedDestination.startsWith('/login') &&
        (userRole === 'admin' || !intendedDestination.startsWith('/admin'))
      ) {
        navigate(intendedDestination + (location.state?.from?.search || ''), { replace: true });
      } else if (userRole === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/member', { replace: true });
      }
    } catch (err) {
      console.error('Google Sign-in error:', err);
      setError(formatAuthError(err));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleOpenForgotPassword = () => {
    setIsForgotPasswordMode(true);
    setResetEmail(email ? email.trim() : '');
    setResetError(null);
    setResetSuccess(false);
    setError(null);
  };

  const handleBackToLogin = () => {
    setIsForgotPasswordMode(false);
    setResetError(null);
    setResetSuccess(false);
    setError(null);
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(false);

    const trimmed = resetEmail.trim();
    if (!trimmed) {
      setResetError('Please enter your email address.');
      return;
    }

    setResetSubmitting(true);
    try {
      await resetPassword(trimmed);
      setResetSuccess(true);
    } catch (err) {
      console.error('Password reset error:', err);
      setResetError(formatAuthError(err));
    } finally {
      setResetSubmitting(false);
    }
  };

  const isBusy = submitting || googleSubmitting;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2.5rem 1.25rem',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#07192f',
      backgroundImage: `
        radial-gradient(at 0% 0%, rgba(30, 64, 175, 0.45) 0px, transparent 50%),
        radial-gradient(at 100% 0%, rgba(234, 88, 12, 0.3) 0px, transparent 45%),
        radial-gradient(at 50% 100%, rgba(109, 40, 217, 0.25) 0px, transparent 55%),
        radial-gradient(at 0% 100%, rgba(14, 165, 233, 0.28) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.22) 0px, transparent 45%)
      `,
      backgroundAttachment: 'fixed',
    }}>
      {/* Decorative ambient glowing orbs in the background */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-80px',
          left: '-80px',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(30px)',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '-90px',
          right: '-90px',
          width: '360px',
          height: '360px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(234, 88, 12, 0.22) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(35px)',
        }}
      />

      {/* Main Login Card */}
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.95)',
        borderTop: '4px solid #ea580c',
        borderRadius: '1.25rem',
        padding: '2.5rem 2.25rem',
        boxShadow: '0 25px 50px -12px rgba(7, 25, 47, 0.45), 0 10px 20px -5px rgba(0, 0, 0, 0.2)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* NANDANAM Agencies Branded Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.85rem' }}>
          {/* Branded Official Logo Frame with subtle gold glow */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff',
            borderRadius: '1.15rem',
            padding: '0.85rem 1.5rem',
            boxShadow: '0 8px 20px -3px rgba(10, 37, 64, 0.12), 0 2px 6px rgba(234, 88, 12, 0.08)',
            border: '1px solid #e2e8f0',
            margin: '0 auto 1.15rem',
            transition: 'transform 0.2s ease',
          }}>
            <img
              src="/logo.png"
              alt="NANDANAM Agencies Logo"
              style={{
                height: '84px',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* Business Badges */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              fontSize: '0.75rem',
              fontWeight: '800',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              NANDANAM Agencies
            </span>
            <span style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              color: '#c2410c',
              border: '1px solid #fed7aa',
              fontSize: '0.725rem',
              fontWeight: '700',
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
            }}>
              ⚡ Retail & Installments
            </span>
          </div>

          <h1 style={{
            fontSize: '1.65rem',
            fontWeight: '900',
            color: '#0a2540',
            marginBottom: '0.35rem',
            letterSpacing: '-0.025em',
          }}>
            {isForgotPasswordMode ? 'Reset Account Password' : 'Sign in to Portal'}
          </h1>
          <p style={{
            color: '#475569',
            fontSize: '0.9rem',
            lineHeight: '1.5',
            margin: 0,
          }}>
            {isForgotPasswordMode
              ? 'Enter your registered email address to receive password recovery instructions.'
              : 'Access your installment ledger, payments, orders, and customer management.'}
          </p>
        </div>

        {isForgotPasswordMode ? (
          /* ========================================================= */
          /* FORGOT PASSWORD FORM                                      */
          /* ========================================================= */
          <div>
            {resetSuccess && (
              <div
                role="status"
                style={{
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  padding: '1rem 1.15rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem',
                  lineHeight: '1.45',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.08)',
                }}
              >
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>✅</span>
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.25rem', color: '#065f46' }}>
                    Password reset email sent!
                  </strong>
                  <span style={{ fontSize: '0.825rem', color: '#047857' }}>
                    Please check your inbox (and spam folder) for instructions to reset your password. Once updated, you can sign in with your new password.
                  </span>
                </div>
              </div>
            )}

            {resetError && (
              <div
                role="alert"
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '0.85rem 1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem',
                  lineHeight: '1.45',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.08)',
                }}
              >
                <span style={{ fontSize: '1.15rem' }}>⚠️</span>
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleForgotPasswordSubmit} noValidate>
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="reset-email-input"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    marginBottom: '0.45rem',
                    color: '#0f172a',
                  }}
                >
                  Email Address <span className="required-star" style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '0.95rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#1d4ed8',
                    fontSize: '1.05rem',
                    pointerEvents: 'none',
                  }}>
                    ✉️
                  </span>
                  <input
                    id="reset-email-input"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    disabled={resetSubmitting}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@example.com"
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem 0.8rem 2.75rem',
                      backgroundColor: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '0.65rem',
                      color: '#0f172a',
                      fontSize: '0.95rem',
                      outline: 'none',
                      transition: 'border-color 0.18s, box-shadow 0.18s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#2563eb';
                      e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.18)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#cbd5e1';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Password Reset Submit with Attractive Orange/Gold Accent */}
              <button
                type="submit"
                id="send-reset-email-btn"
                disabled={resetSubmitting}
                className="btn btn-orange"
                style={{
                  width: '100%',
                  padding: '0.85rem 1.25rem',
                  fontSize: '0.95rem',
                  fontWeight: '800',
                  borderRadius: '0.65rem',
                  marginBottom: '1rem',
                  cursor: resetSubmitting ? 'not-allowed' : 'pointer',
                  opacity: resetSubmitting ? 0.75 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 14px rgba(234, 88, 12, 0.3)',
                }}
              >
                {resetSubmitting ? (
                  <>
                    <span style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTopColor: '#ffffff',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                      display: 'inline-block'
                    }} />
                    <span>Sending Reset Link...</span>
                  </>
                ) : (
                  <>
                    <span>✉️</span>
                    <span>Send Password Reset Email</span>
                  </>
                )}
              </button>

              <button
                type="button"
                id="back-to-login-btn"
                onClick={handleBackToLogin}
                disabled={resetSubmitting}
                className="btn btn-secondary"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.65rem',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                }}
              >
                <span>&larr;</span> Back to Sign In
              </button>
            </form>
          </div>
        ) : (
          /* ========================================================= */
          /* STANDARD SIGN IN FORM                                     */
          /* ========================================================= */
          <div>
            {error && (
              <div
                role="alert"
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '0.9rem 1.15rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.875rem',
                  lineHeight: '1.45',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.08)',
                }}
              >
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Continue with Google Button (Styled Consistently) */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isBusy}
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                backgroundColor: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '0.65rem',
                color: '#0a2540',
                fontSize: '0.95rem',
                fontWeight: '700',
                cursor: isBusy ? 'not-allowed' : 'pointer',
                opacity: isBusy ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                marginBottom: '1.5rem',
                boxShadow: '0 1px 3px rgba(10, 37, 64, 0.06)',
              }}
              onMouseOver={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = '#1d4ed8';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(29, 78, 216, 0.12)';
                }
              }}
              onMouseOut={(e) => {
                if (!isBusy) {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(10, 37, 64, 0.06)';
                }
              }}
            >
              {googleSubmitting ? (
                <>
                  <span style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(10, 37, 64, 0.2)',
                    borderTopColor: '#0a2540',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block'
                  }} />
                  <span>Connecting with Google...</span>
                </>
              ) : (
                <>
                  {/* Google 4-Color Logo */}
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            {/* Subtle Divider */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '1.5rem',
              color: '#64748b',
            }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
              <span style={{
                padding: '0 0.85rem',
                fontSize: '0.725rem',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#94a3b8',
              }}>
                Or sign in with email
              </span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {/* Email Input Field */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="email-input"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    marginBottom: '0.45rem',
                    color: '#0f172a',
                  }}
                >
                  Email Address <span className="required-star" style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '0.95rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#1d4ed8',
                    fontSize: '1.05rem',
                    pointerEvents: 'none',
                  }}>
                    ✉️
                  </span>
                  <input
                    id="email-input"
                    type="email"
                    required
                    autoComplete="email"
                    disabled={isBusy}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    style={{
                      width: '100%',
                      padding: '0.8rem 1rem 0.8rem 2.75rem',
                      backgroundColor: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '0.65rem',
                      color: '#0f172a',
                      fontSize: '0.95rem',
                      outline: 'none',
                      transition: 'border-color 0.18s, box-shadow 0.18s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#2563eb';
                      e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.18)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#cbd5e1';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Password Input Field */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label
                  htmlFor="password-input"
                  style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    marginBottom: '0.45rem',
                    color: '#0f172a',
                  }}
                >
                  Password <span className="required-star" style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '0.95rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#ea580c',
                    fontSize: '1.05rem',
                    pointerEvents: 'none',
                  }}>
                    🔒
                  </span>
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    disabled={isBusy}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: '100%',
                      padding: '0.8rem 4.5rem 0.8rem 2.75rem',
                      backgroundColor: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '0.65rem',
                      color: '#0f172a',
                      fontSize: '0.95rem',
                      outline: 'none',
                      transition: 'border-color 0.18s, box-shadow 0.18s',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#2563eb';
                      e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.18)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#cbd5e1';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: '0.65rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '0.4rem',
                      transition: 'all 0.18s ease',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.color = '#0f172a';
                      e.currentTarget.style.backgroundColor = '#e2e8f0';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.color = '#475569';
                      e.currentTarget.style.backgroundColor = '#f1f5f9';
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>

                {/* "Forgot Password?" link positioned below the password field */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.65rem' }}>
                  <button
                    type="button"
                    id="forgot-password-link"
                    onClick={handleOpenForgotPassword}
                    disabled={isBusy}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ea580c',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      padding: 0,
                      textDecoration: 'none',
                      transition: 'all 0.18s ease',
                    }}
                    onMouseOver={(e) => {
                      if (!isBusy) {
                        e.currentTarget.style.color = '#c2410c';
                        e.currentTarget.style.textDecoration = 'underline';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isBusy) {
                        e.currentTarget.style.color = '#ea580c';
                        e.currentTarget.style.textDecoration = 'none';
                      }
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
              </div>

              {/* Login Button Attractive with Orange/Gold Accent */}
              <button
                type="submit"
                disabled={isBusy}
                className="btn btn-orange"
                style={{
                  width: '100%',
                  padding: '0.85rem 1.25rem',
                  fontSize: '1rem',
                  fontWeight: '800',
                  borderRadius: '0.65rem',
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  opacity: isBusy ? 0.75 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 4px 16px rgba(234, 88, 12, 0.35)',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {submitting ? (
                  <>
                    <span style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      borderTopColor: '#ffffff',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                      display: 'inline-block'
                    }} />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Sign In to Account</span>
                    <span style={{ fontSize: '1.1rem' }}>&rarr;</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Security & Trust Footer */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid #e2e8f0',
          textAlign: 'center',
          fontSize: '0.75rem',
          color: '#64748b',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.35rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0a2540', fontWeight: '700' }}>
            <span>🔒</span>
            <span>256-bit SSL Encrypted Portal &bull; NANDANAM Agencies</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            Official Retail Financing &amp; Installment Management Platform
          </span>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
