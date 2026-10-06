import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard component for authenticated and role-based access
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string[]} [props.allowedRoles]
 */
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        color: 'var(--text-secondary)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(59, 130, 246, 0.2)',
          borderTopColor: 'var(--accent-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1rem'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p>Verifying authentication...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If role requirement is specified, verify role
  if (allowedRoles && allowedRoles.length > 0) {
    if (!role || !allowedRoles.includes(role)) {
      // Redirect to user's assigned workspace if they have one
      if (role === 'admin') {
        return <Navigate to="/admin" replace />;
      }
      if (role === 'member') {
        return <Navigate to="/member" replace />;
      }
      return <Navigate to="/login" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
