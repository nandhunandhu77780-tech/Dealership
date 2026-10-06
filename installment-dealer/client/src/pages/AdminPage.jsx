import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AdminDashboardOverview from '../components/AdminDashboardOverview.jsx';
import MemberManagement from '../components/MemberManagement.jsx';
import ProductManagement from '../components/ProductManagement.jsx';
import OrderManagement from '../components/OrderManagement.jsx';
import InstallmentManagement from '../components/InstallmentManagement.jsx';
import AdminPaymentsList from '../components/AdminPaymentsList.jsx';
import DailyCollectionManagement from '../components/DailyCollectionManagement.jsx';
import MemberDetailsView from '../components/MemberDetailsView.jsx';
import ActivityLogManagement from '../components/ActivityLogManagement.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'collection', label: 'Collection', icon: '💰' },
  { id: 'members', label: 'Members', icon: '👥' },
  { id: 'products', label: 'Products', icon: '📦' },
  { id: 'orders', label: 'Orders', icon: '📋' },
  { id: 'installments', label: 'Installments', icon: '💳' },
  { id: 'payments', label: 'Payments', icon: '💵' },
  { id: 'activity_log', label: 'Activity Log', icon: '📜' },
];

const AdminPage = () => {
  const { currentUser, userProfile, logout } = useAuth();
  const { id: urlMemberId } = useParams();
  const location = useLocation();
  const getInitialSection = () => {
    if (location.pathname.includes('activity-log') || location.hash === '#activity_log') return 'activity_log';
    if (location.pathname.includes('collection') || location.hash === '#collection') return 'collection';
    if (location.pathname.includes('members') || location.hash === '#members') return 'members';
    if (location.pathname.includes('products') || location.hash === '#products') return 'products';
    if (location.pathname.includes('orders') || location.hash === '#orders') return 'orders';
    if (location.pathname.includes('installments') || location.hash === '#installments') return 'installments';
    if (location.pathname.includes('payments') || location.hash === '#payments') return 'payments';
    return 'dashboard';
  };
  const [activeSection, setActiveSection] = useState(getInitialSection);
  const [selectedMemberForDetails, setSelectedMemberForDetails] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const displayName = userProfile?.name || currentUser?.displayName || 'Administrator';
  const email = userProfile?.email || currentUser?.email || 'admin@nandanamagencies.com';
  const role = userProfile?.role || 'admin';

  const handleNavClick = (sectionId) => {
    setSelectedMemberForDetails(null);
    setActiveSection(sectionId);
    setMobileMenuOpen(false);
    if (urlMemberId) {
      navigate('/admin');
    }
  };

  return (
    <div className="admin-layout" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Responsive Styles */}
      <style>{`
        .admin-sidebar {
          width: 260px;
          flex-shrink: 0;
          background-color: var(--card-bg);
          border-right: 1px solid var(--card-border);
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          padding: 1.5rem 1rem;
          z-index: 50;
        }

        .admin-mobile-header {
          display: none;
          width: 100%;
          background-color: var(--card-bg);
          border-bottom: 1px solid var(--card-border);
          padding: 0.85rem 1.25rem;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 60;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .admin-backdrop {
          display: none;
        }

        .admin-main-content {
          flex: 1;
          padding: 2rem 2.5rem;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          overflow-x: hidden;
        }

        @media (max-width: 900px) {
          .admin-layout {
            flex-direction: column !important;
          }
          .admin-mobile-header {
            display: flex !important;
          }
          .admin-sidebar {
            display: none !important;
          }
          .admin-sidebar.mobile-open {
            display: flex !important;
            position: fixed !important;
            top: 60px !important;
            left: 0 !important;
            width: 280px !important;
            max-width: 85vw !important;
            height: calc(100vh - 60px) !important;
            z-index: 70 !important;
            box-shadow: 10px 0 25px -5px rgba(0, 0, 0, 0.5);
          }
          .admin-backdrop.active {
            display: block !important;
            position: fixed;
            top: 60px;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(2px);
            z-index: 65;
          }
          .admin-main-content {
            padding: 1.25rem 1rem !important;
          }
        }
      `}</style>

      {/* Mobile Top Header with Hamburger */}
      <div className="admin-mobile-header" style={{
        background: 'linear-gradient(135deg, #07192f 0%, #0a2540 100%)',
        borderBottom: '2px solid #ea580c',
        boxShadow: '0 4px 12px rgba(10, 37, 64, 0.15)',
        color: '#ffffff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '0.65rem',
            background: '#ffffff',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
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
            <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#ffffff', display: 'block', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              NANDANAM Agencies
            </span>
            <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: '700' }}>
              Admin &bull; {NAV_ITEMS.find((n) => n.id === activeSection)?.label || 'Dashboard'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          style={{
            padding: '0.5rem 0.8rem',
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '0.5rem',
            color: '#ffffff',
            fontSize: '1.15rem',
            cursor: 'pointer',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Backdrop Overlay */}
      <div
        className={`admin-backdrop ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
        style={{
          backgroundColor: 'rgba(7, 25, 47, 0.65)',
          backdropFilter: 'blur(3px)',
        }}
      />

      {/* Sidebar Navigation */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`} style={{
        background: 'linear-gradient(180deg, #07192f 0%, #0a2540 55%, #0d2f52 100%)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '4px 0 16px rgba(10, 37, 64, 0.12)',
        color: '#ffffff',
      }}>
        {/* Brand Header */}
        <div style={{ paddingBottom: '1.25rem', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '0.75rem',
              background: '#ffffff',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              border: '2px solid rgba(255, 255, 255, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              padding: '3px',
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
              <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ffffff', display: 'block', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                NANDANAM Agencies
              </span>
              <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span>🛡️</span> Admin Console
              </span>
            </div>
          </div>
        </div>

        {/* Administrator Profile Widget */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '0.75rem',
          padding: '0.85rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)',
            color: '#ffffff',
            fontWeight: '800',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(234, 88, 12, 0.35)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
          }}>
            {(displayName.charAt(0) || 'A').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <span style={{
                fontSize: '0.65rem',
                fontWeight: '800',
                padding: '0.15rem 0.45rem',
                borderRadius: '9999px',
                backgroundColor: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {role}
              </span>
            </div>
            <span style={{ fontSize: '0.725rem', color: '#93c5fd', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email}
            </span>
          </div>
        </div>

        {/* Navigation Items with active highlights */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  padding: '0.7rem 0.95rem',
                  borderRadius: '0.55rem',
                  border: '1px solid',
                  borderColor: isActive ? 'rgba(255, 255, 255, 0.35)' : 'transparent',
                  background: isActive
                    ? 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)'
                    : 'transparent',
                  color: isActive ? '#ffffff' : '#cbd5e1',
                  fontSize: '0.9rem',
                  fontWeight: isActive ? '700' : '500',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  boxShadow: isActive ? '0 4px 14px rgba(234, 88, 12, 0.35)' : 'none',
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#cbd5e1';
                  }
                }}
              >
                <span style={{ fontSize: '1.15rem' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {isActive && (
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#fef08a',
                    boxShadow: '0 0 8px rgba(254, 240, 138, 0.8)',
                  }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Action */}
        <div style={{ paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)', marginTop: 'auto' }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              width: '100%',
              padding: '0.65rem 1rem',
              borderRadius: '0.55rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.28)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.color = '#fca5a5';
            }}
          >
            <span>🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main-content">
        {selectedMemberForDetails ? (
          <MemberDetailsView
            member={selectedMemberForDetails}
            onBack={() => setSelectedMemberForDetails(null)}
          />
        ) : urlMemberId ? (
          <MemberDetailsView
            memberId={urlMemberId}
            onBack={() => {
              navigate('/admin');
              setActiveSection('members');
            }}
          />
        ) : (
          <>
            {activeSection === 'dashboard' && (
              <AdminDashboardOverview onNavigate={(sec) => setActiveSection(sec)} />
            )}
            {activeSection === 'collection' && <DailyCollectionManagement />}
            {activeSection === 'members' && (
              <MemberManagement
                onViewMemberDetails={(member) => setSelectedMemberForDetails(member)}
              />
            )}
            {activeSection === 'products' && <ProductManagement />}
            {activeSection === 'orders' && <OrderManagement />}
            {activeSection === 'installments' && <InstallmentManagement />}
            {activeSection === 'payments' && <AdminPaymentsList />}
            {activeSection === 'activity_log' && <ActivityLogManagement />}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
