import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import MemberPage from './pages/MemberPage.jsx';
import MemberProductsPage from './pages/MemberProductsPage.jsx';
import ProductDetailsPage from './pages/ProductDetailsPage.jsx';
import MyOrdersPage from './pages/MyOrdersPage.jsx';
import MyInstallmentsPage from './pages/MyInstallmentsPage.jsx';
import MemberPaymentsPage from './pages/MemberPaymentsPage.jsx';
import MemberProfilePage from './pages/MemberProfilePage.jsx';
import PushNotificationManager from './components/PushNotificationManager.jsx';

/**
 * Route parameter forwarder for product detail alias
 */
const ProductRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/member/products/${id}`} replace />;
};

/**
 * Root redirector component based on authentication and role
 */
const RootRedirect = () => {
  const { currentUser, role, loading } = useAuth();

  if (loading || (currentUser && !role)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-secondary)'
      }}>
        <div style={{
          width: '42px',
          height: '42px',
          border: '3px solid rgba(59, 130, 246, 0.2)',
          borderTopColor: 'var(--accent-orange, #ea580c)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '1rem'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Loading portal...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  if (role === 'member') {
    return <Navigate to="/member" replace />;
  }

  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PushNotificationManager />
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/members/:id"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/activity-log"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* Protected Member Routes */}
          <Route
            path="/member"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MemberPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member/products"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MemberProductsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member/products/:id"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <ProductDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member/orders"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MyOrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member/installments"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MyInstallmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member/payments"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MemberPaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member/profile"
            element={
              <ProtectedRoute allowedRoles={['member']}>
                <MemberProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Friendly Top-Level Route Aliases */}
          <Route path="/orders" element={<Navigate to="/member/orders" replace />} />
          <Route path="/products" element={<Navigate to="/member/products" replace />} />
          <Route path="/products/:id" element={<ProductRedirect />} />
          <Route path="/installments" element={<Navigate to="/member/installments" replace />} />
          <Route path="/payments" element={<Navigate to="/member/payments" replace />} />
          <Route path="/profile" element={<Navigate to="/member/profile" replace />} />
          <Route path="/activity-log" element={<Navigate to="/admin/activity-log" replace />} />

          {/* Default and Wildcard Redirects */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
