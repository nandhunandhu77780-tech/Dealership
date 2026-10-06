import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getUnreadNotificationCount } from '../services/notificationService.js';
import MemberProfileSetupModal from './MemberProfileSetupModal.jsx';

const NAV_LINKS = [
  { id: 'dashboard', label: 'Dashboard', path: '/member', icon: '📊' },
  { id: 'products', label: 'Products', path: '/member/products', icon: '📦' },
  { id: 'orders', label: 'My Orders', path: '/member/orders', icon: '📋' },
  { id: 'installments', label: 'My Installments', path: '/member/installments', icon: '💳' },
  { id: 'payments', label: 'Payments', path: '/member/payments', icon: '💵' },
  { id: 'profile', label: 'My Profile', path: '/member/profile', icon: '👤' },
];

/**
 * Reusable, fully responsive Member Navigation Bar (Clean Light Theme with Navy & Orange branding)
 * @param {string} activePage - 'dashboard' | 'products' | 'orders' | 'installments' | 'payments' | 'profile'
 */
const MemberNavbar = ({ activePage = 'dashboard' }) => {
  const { currentUser, userProfile, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser?.uid) {
      getUnreadNotificationCount(currentUser.uid)
        .then((cnt) => setUnreadCount(cnt))
        .catch(() => {});
    }
  }, [currentUser?.uid]);

  const handleGoToNotifications = () => {
    setMobileMenuOpen(false);
    navigate('/member');
    setTimeout(() => {
      const el = document.getElementById('notifications-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const displayName = userProfile?.name || currentUser?.displayName || 'Member';
  const email = userProfile?.email || currentUser?.email || '';
  const userPhone = userProfile?.phone || '';
  const initial = (displayName.charAt(0) || 'M').toUpperCase();

  return (
    <>
      <MemberProfileSetupModal />
      <header style={{
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderTop: '3px solid #ea580c',
      borderBottom: '1px solid rgba(10, 37, 64, 0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 4px 16px rgba(10, 37, 64, 0.05)',
    }}>
      <div style={{
        maxWidth: '1240px',
        margin: '0 auto',
        padding: '0.65rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        {/* Brand / Logo */}
        <Link
          to="/member"
          onClick={() => setMobileMenuOpen(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            textDecoration: 'none',
            color: '#0f172a',
          }}
        >
          {/* Branded Official Logo */}
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '0.75rem',
            background: '#ffffff',
            boxShadow: '0 3px 10px rgba(10, 37, 64, 0.1)',
            border: '2px solid rgba(10, 37, 64, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            padding: '2px',
          }}>
            <img
              src="/logo.png"
              alt="NANDANAM Agencies Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>
          <div>
            <span style={{
              fontSize: '1.05rem',
              fontWeight: '800',
              color: '#0a2540',
              display: 'block',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
            }}>
              NANDANAM Agencies
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '1px' }}>
              <span style={{
                fontSize: '0.675rem',
                color: '#ea580c',
                fontWeight: '800',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
              }}>
                Member Portal
              </span>
            </div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
        }} className="member-nav-desktop">
          {NAV_LINKS.map((link) => {
            const isActive = activePage === link.id;
            return (
              <Link
                key={link.id}
                to={link.path}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '0.55rem',
                  background: isActive
                    ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                    : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? '#bfdbfe' : 'transparent',
                  color: isActive ? '#1d4ed8' : '#334155',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? '800' : '600',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  whiteSpace: 'nowrap',
                  boxShadow: isActive ? '0 2px 6px rgba(37, 99, 235, 0.12)' : 'none',
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#0a2540';
                    e.currentTarget.style.backgroundColor = 'rgba(219, 234, 254, 0.35)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#334155';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span style={{ fontSize: '1rem' }}>{link.icon}</span>
                <span>{link.label}</span>
                {isActive && (
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ea580c',
                    display: 'inline-block',
                    marginLeft: '2px',
                    boxShadow: '0 0 6px rgba(234, 88, 12, 0.6)',
                  }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop User Badge, Notifications & Logout */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
        }} className="member-nav-desktop">
          {/* Notifications Bell Button */}
          <button
            type="button"
            onClick={handleGoToNotifications}
            title="View Installment Notifications"
            style={{
              position: 'relative',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.55rem',
              padding: '0.45rem 0.65rem',
              cursor: 'pointer',
              color: '#0f172a',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.18s ease',
              boxShadow: '0 1px 3px rgba(10, 37, 64, 0.05)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#fffbeb';
              e.currentTarget.style.borderColor = '#f59e0b';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          >
            <span style={{ fontSize: '1.05rem' }}>🔔</span>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontSize: '0.65rem',
                fontWeight: '800',
                minWidth: '18px',
                height: '18px',
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                boxShadow: '0 0 8px rgba(220, 38, 38, 0.5)',
                animation: 'pulseBadge 2s infinite',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User Profile Pill */}
          <Link
            to="/member/profile"
            title="View & Edit My Profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: '0.35rem 0.65rem',
              borderRadius: '0.6rem',
              background: 'linear-gradient(135deg, #ffffff 0%, #fdfbf7 100%)',
              border: '1px solid #cbd5e1',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: '0 1px 3px rgba(10, 37, 64, 0.04)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#0a2540';
              e.currentTarget.style.boxShadow = '0 4px 10px rgba(10, 37, 64, 0.08)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(10, 37, 64, 0.04)';
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0a2540 0%, #1e40af 100%)',
              color: '#ffffff',
              fontWeight: '800',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '2px solid #fde68a',
              boxShadow: '0 2px 6px rgba(10, 37, 64, 0.2)',
            }}>
              {initial}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', maxWidth: '140px' }}>
              <span style={{
                fontSize: '0.825rem',
                fontWeight: '700',
                color: '#0f172a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {displayName}
              </span>
              <span style={{
                fontSize: '0.675rem',
                color: userPhone ? '#059669' : '#ea580c',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}>
                {userPhone ? (
                  <><span>📞</span> {userPhone}</>
                ) : (
                  <><span>⚠️</span> Add Mobile</>
                )}
              </span>
            </div>
          </Link>

          {/* Logout Button */}
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out of your account"
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '0.5rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#fee2e2';
              e.currentTarget.style.borderColor = '#fca5a5';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#fef2f2';
              e.currentTarget.style.borderColor = '#fecaca';
            }}
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>

        {/* Mobile Right Controls: Bell & Hamburger */}
        <div style={{ display: 'none', alignItems: 'center', gap: '0.5rem' }} className="member-nav-mobile-controls">
          <button
            type="button"
            onClick={handleGoToNotifications}
            title="View Notifications"
            style={{
              position: 'relative',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              padding: '0.45rem 0.65rem',
              color: '#0f172a',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '1.05rem' }}>🔔</span>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontSize: '0.65rem',
                fontWeight: '800',
                minWidth: '18px',
                height: '18px',
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="member-nav-mobile-toggle"
            style={{
              padding: '0.45rem 0.75rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              color: '#0f172a',
              fontSize: '1.2rem',
              cursor: 'pointer',
              lineHeight: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '1rem 1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(15, 23, 42, 0.08)',
          }}
          className="member-mobile-drawer"
        >
          {/* User Info Card in Mobile Menu */}
          <Link
            to="/member/profile"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              padding: '0.85rem',
              backgroundColor: '#f8fafc',
              borderRadius: '0.65rem',
              border: '1px solid #e2e8f0',
              marginBottom: '0.5rem',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0a2540, #1e3a8a)',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {initial}
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a' }}>
                  {displayName}
                </div>
                {userPhone ? (
                  <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700' }}>
                    📞 {userPhone}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: '#ea580c', fontWeight: '700' }}>
                    ⚠️ Mobile Number Required
                  </div>
                )}
                {email && (
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {email}
                  </div>
                )}
              </div>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: '700' }}>
              Profile &rarr;
            </span>
          </Link>

          {/* Navigation Links in Mobile Menu */}
          {NAV_LINKS.map((link) => {
            const isActive = activePage === link.id;
            return (
              <Link
                key={link.id}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.55rem',
                  background: isActive
                    ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                    : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? '#bfdbfe' : 'transparent',
                  color: isActive ? '#1d4ed8' : '#334155',
                  textDecoration: 'none',
                  fontSize: '0.925rem',
                  fontWeight: isActive ? '800' : '600',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? '0 2px 6px rgba(37, 99, 235, 0.12)' : 'none',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{link.icon}</span>
                <span style={{ flex: 1 }}>{link.label}</span>
                {isActive && (
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#ea580c',
                    boxShadow: '0 0 6px rgba(234, 88, 12, 0.6)',
                  }} />
                )}
              </Link>
            );
          })}

          {/* Mobile Logout Button */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              handleLogout();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              marginTop: '0.5rem',
              borderRadius: '0.5rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      )}

      {/* Responsive Media Query Helper & Animations */}
      <style>{`
        @keyframes pulseBadge {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(220, 38, 38, 0);
          }
        }
        @media (min-width: 861px) {
          .member-nav-desktop {
            display: flex !important;
          }
          .member-nav-mobile-toggle,
          .member-nav-mobile-controls {
            display: none !important;
          }
          .member-mobile-drawer {
            display: none !important;
          }
        }
        @media (max-width: 860px) {
          .member-nav-desktop {
            display: none !important;
          }
          .member-nav-mobile-toggle {
            display: inline-flex !important;
          }
          .member-nav-mobile-controls {
            display: flex !important;
          }
        }
      `}</style>
    </header>
    </>
  );
};

export default MemberNavbar;
