import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import MemberNavbar from '../components/MemberNavbar.jsx';
import { getOrdersByMember, getNormalizedDeliveryStatus } from '../services/orderService.js';
import {
  getInstallmentPlansByMember,
  calculateTotalPaid,
  calculateBalanceAmount
} from '../services/installmentService.js';
import { getPaymentsByMember } from '../services/paymentService.js';
import { getActiveInStockProducts } from '../services/productService.js';
import NotificationList from '../components/NotificationList.jsx';
import {
  formatINR,
  formatIndianDate,
  sanitizeErrorMessage,
  getInstallmentStatus,
  getInstallmentRemainingAmount,
  getOverdueDays
} from '../utils/formatters.js';

const MemberPage = () => {
  const { currentUser, userProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [orders, setOrders] = useState([]);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);

  const displayName = userProfile?.name || currentUser?.displayName || 'Member';
  const email = userProfile?.email || currentUser?.email || 'N/A';

  const loadMemberData = async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled([
        getOrdersByMember(currentUser.uid),
        getInstallmentPlansByMember(currentUser.uid),
        getPaymentsByMember(currentUser.uid),
        getActiveInStockProducts(),
      ]);

      const [ordersRes, plansRes, paymentsRes, productsRes] = results;

      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value || []);
      if (plansRes.status === 'fulfilled') setPlans(plansRes.value || []);
      if (paymentsRes.status === 'fulfilled') setPayments(paymentsRes.value || []);
      if (productsRes.status === 'fulfilled') setFeaturedProducts((productsRes.value || []).slice(0, 4));

      if (results.slice(0, 3).every((r) => r.status === 'rejected')) {
        setError('Unable to load member dashboard data. Please check your internet connection.');
      }
    } catch (err) {
      console.error('Error loading member dashboard:', err);
      setError(sanitizeErrorMessage(err, 'An error occurred while loading your dashboard information.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemberData();
  }, [currentUser?.uid]);

  // 1. Calculate Summary Cards
  const summaryMetrics = useMemo(() => {
    const totalOrders = orders.length;
    const activeOrders = orders.filter(
      (o) => o.status === 'pending' || o.status === 'approved'
    ).length;

    const activePlans = plans.filter(
      (p) => (p.status || '').toLowerCase() !== 'completed'
    ).length;

    const totalPlansCount = plans.length;

    const totalAmount = plans.reduce(
      (sum, p) => sum + (parseFloat(p.totalAmount) || 0),
      0
    );

    const totalPaid = plans.reduce(
      (sum, p) => sum + calculateTotalPaid(p),
      0
    );

    const remainingBalance = plans.reduce(
      (sum, p) => sum + calculateBalanceAmount(p),
      0
    );

    return {
      totalOrders,
      activeOrders,
      activePlans,
      totalPlansCount,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      remainingBalance: parseFloat(remainingBalance.toFixed(2)),
    };
  }, [orders, plans]);

  // 2. Recent Orders: Latest 5
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);
  }, [orders]);

  // 3. Upcoming & Overdue Installments from Active Plans
  const upcomingInstallments = useMemo(() => {
    const list = [];

    plans.forEach((plan) => {
      const planStatus = (plan.status || '').toLowerCase();
      if (planStatus === 'completed') return;

      const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
      schedule.forEach((inst) => {
        const remainingAmount = getInstallmentRemainingAmount(inst);
        if (remainingAmount <= 0) return;

        const status = getInstallmentStatus(inst);
        const overdueDays = getOverdueDays(inst.dueDate);
        const isOverdue = status === 'Overdue';

        list.push({
          planId: plan.id,
          productName: plan.productName || 'Installment Product',
          installmentNumber: inst.installmentNumber,
          amount: parseFloat(inst.amount) || 0,
          remainingAmount,
          dueDate: inst.dueDate,
          status,
          isOverdue,
          overdueDays,
        });
      });
    });

    // Sort: overdue first, then by due date ascending
    return list
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      })
      .slice(0, 6);
  }, [plans]);

  // Order status badge styling
  const getOrderStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'Approved' };
      case 'completed':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'Completed' };
      case 'rejected':
        return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'Rejected' };
      case 'pending':
      default:
        return { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'Pending' };
    }
  };

  const getDeliveryStatusBadge = (status) => {
    switch (status) {
      case 'Delivered':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: '🏠', label: 'Delivered' };
      case 'Out for Delivery':
        return { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', icon: '🚚', label: 'Out for Delivery' };
      case 'Preparing':
        return { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa', icon: '📦', label: 'Preparing' };
      case 'Approved':
        return { bg: '#eff6ff', color: '#0284c7', border: '#bae6fd', icon: '✓', label: 'Approved' };
      case 'Order Placed':
      default:
        return { bg: '#f8fafc', color: '#334155', border: '#cbd5e1', icon: '📝', label: 'Order Placed' };
    }
  };

  // 4. Earliest Next Payment Due for Highlight
  const nextPayment = useMemo(() => {
    return upcomingInstallments.length > 0 ? upcomingInstallments[0] : null;
  }, [upcomingInstallments]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Unified Member Navigation */}
      <MemberNavbar activePage="dashboard" />

      {/* Main Content Area */}
      <main className="container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.75rem 1.25rem 3rem' }}>
        {/* Welcome & Profile Hero Card */}
        <section style={{
          background: 'linear-gradient(135deg, #0a2540 0%, #1e3a8a 60%, #07192f 100%)',
          color: '#ffffff',
          borderRadius: '1.25rem',
          padding: '2rem 2.25rem',
          marginBottom: '1.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
          boxShadow: '0 10px 25px -5px rgba(10, 37, 64, 0.25), 0 8px 10px -6px rgba(10, 37, 64, 0.2)',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          {/* Ambient decorative glowing highlights */}
          <div style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '260px',
            height: '260px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(234, 88, 12, 0.25) 0%, transparent 70%)',
            pointerEvents: 'none',
            filter: 'blur(20px)',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-40px',
            left: '30%',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.2) 0%, transparent 70%)',
            pointerEvents: 'none',
            filter: 'blur(25px)',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', position: 'relative', zIndex: 1 }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
              border: '3px solid rgba(255, 255, 255, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.65rem',
              color: '#ffffff',
              fontWeight: '900',
              flexShrink: 0,
              boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)',
            }}>
              {(displayName.charAt(0) || 'M').toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.65rem', fontWeight: '900', color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                  Welcome back, {displayName}!
                </h1>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#6ee7b7',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                }}>
                  <span style={{ color: '#10b981' }}>●</span> Active Member
                </span>
                {currentUser?.uid && (
                  <span style={{
                    fontSize: '0.725rem',
                    color: '#93c5fd',
                    backgroundColor: 'rgba(30, 58, 138, 0.6)',
                    border: '1px solid rgba(147, 197, 253, 0.3)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '0.35rem',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                  }}>
                    ID: MEM-{currentUser.uid.slice(0, 6).toUpperCase()}
                  </span>
                )}
              </div>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginTop: '0.4rem', margin: 0 }}>
                {email} &bull; <strong style={{ color: '#fed7aa' }}>NANDANAM Agencies</strong> Retail &amp; Installment Financing
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            <Link
              to="/member/profile"
              className="btn"
              title="View and Edit Profile"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                padding: '0.5rem 0.95rem',
                borderRadius: '0.6rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.22)';
                e.currentTarget.style.borderColor = '#ffffff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              }}
            >
              <span>👤</span>
              <span>Edit Profile</span>
            </Link>

            <button
              type="button"
              onClick={loadMemberData}
              className="btn"
              title="Refresh Dashboard Data"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                padding: '0.5rem 0.95rem',
                borderRadius: '0.6rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.22)';
                e.currentTarget.style.borderColor = '#ffffff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
              }}
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </div>
        </section>

        {/* Loading Spinner */}
        {loading && (
          <div className="loading-container" style={{ padding: '4rem 1.5rem' }}>
            <div className="loading-spinner" />
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
              Loading your dashboard...
            </p>
            <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748b' }}>
              Retrieving orders, installment plans, and live payment status
            </p>
          </div>
        )}

        {/* Error Banner */}
        {error && !loading && (
          <div className="form-error-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <button
              onClick={loadMemberData}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.25rem 0.65rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && (
          <>
            {/* Prominent Outstanding Balance & Next Payment Highlight */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.25rem',
              marginBottom: '2rem',
            }}>
              {/* Card A: Outstanding Balance & Settlement Progress */}
              <div style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)',
                border: '1.5px solid #fed7aa',
                borderRadius: '1.15rem',
                padding: '1.5rem 1.75rem',
                boxShadow: '0 4px 16px rgba(234, 88, 12, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.15rem' }}>📉</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Outstanding Balance
                      </span>
                    </div>
                    <span style={{
                      backgroundColor: '#fff7ed',
                      color: '#c2410c',
                      border: '1px solid #fed7aa',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      fontSize: '0.725rem',
                      fontWeight: '700',
                    }}>
                      {summaryMetrics.activePlans} Active Plans
                    </span>
                  </div>

                  <div style={{ fontSize: '2.15rem', fontWeight: '900', color: '#0a2540', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                    {formatINR(summaryMetrics.remainingBalance)}
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.35rem' }}>
                    Total remaining unpaid balance across all your installments
                  </div>
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #ffedd5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem', color: '#475569', marginBottom: '0.35rem', fontWeight: '600' }}>
                    <span>Settlement Progress</span>
                    <span style={{ color: '#047857', fontWeight: '800' }}>
                      {summaryMetrics.totalAmount > 0
                        ? `${Math.round((summaryMetrics.totalPaid / summaryMetrics.totalAmount) * 100)}% Paid`
                        : '0% Paid'}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e2e8f0',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${summaryMetrics.totalAmount > 0 ? Math.min(100, Math.round((summaryMetrics.totalPaid / summaryMetrics.totalAmount) * 100)) : 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #059669 0%, #10b981 100%)',
                      borderRadius: '9999px',
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', color: '#64748b', marginTop: '0.35rem' }}>
                    <span>Paid: <strong style={{ color: '#047857' }}>{formatINR(summaryMetrics.totalPaid)}</strong></span>
                    <span>Total: <strong style={{ color: '#0a2540' }}>{formatINR(summaryMetrics.totalAmount)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Card B: Next Payment Due & Strong Pay Now CTA */}
              <div style={{
                background: nextPayment?.isOverdue
                  ? 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)'
                  : 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)',
                border: nextPayment?.isOverdue
                  ? '1.5px solid #fecaca'
                  : '1.5px solid #bfdbfe',
                borderRadius: '1.15rem',
                padding: '1.5rem 1.75rem',
                boxShadow: nextPayment?.isOverdue
                  ? '0 4px 16px rgba(220, 38, 38, 0.08)'
                  : '0 4px 16px rgba(30, 64, 175, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}>
                {nextPayment ? (
                  <>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.15rem' }}>{nextPayment.isOverdue ? '⚠️' : '⚡'}</span>
                          <span style={{
                            fontSize: '0.8rem',
                            fontWeight: '800',
                            color: nextPayment.isOverdue ? '#dc2626' : '#1d4ed8',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}>
                            {nextPayment.isOverdue ? 'Overdue Payment Alert' : 'Next Payment Due'}
                          </span>
                        </div>
                        <span style={{
                          backgroundColor: nextPayment.isOverdue ? '#fef2f2' : nextPayment.status === 'Due Today' ? '#fff7ed' : '#eff6ff',
                          color: nextPayment.isOverdue ? '#991b1b' : nextPayment.status === 'Due Today' ? '#9a3412' : '#1e40af',
                          border: `1px solid ${nextPayment.isOverdue ? '#fecaca' : nextPayment.status === 'Due Today' ? '#fed7aa' : '#bfdbfe'}`,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.725rem',
                          fontWeight: '800',
                          textTransform: 'uppercase',
                        }}>
                          {nextPayment.isOverdue ? `Overdue (${nextPayment.overdueDays}d)` : nextPayment.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '2.15rem', fontWeight: '900', color: nextPayment.isOverdue ? '#dc2626' : '#0a2540', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
                        {formatINR(nextPayment.remainingAmount)}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.35rem', fontWeight: '600' }}>
                        {nextPayment.productName} &bull; <span style={{ color: '#0a2540' }}>Installment #{nextPayment.installmentNumber}</span>
                      </div>
                      <div style={{ fontSize: '0.775rem', color: nextPayment.isOverdue ? '#dc2626' : '#64748b', marginTop: '0.2rem' }}>
                        Due on: <strong>{formatIndianDate(nextPayment.dueDate)}</strong>
                      </div>
                    </div>

                    {/* Strong Orange/Gold Call-To-Action "Pay Now" Button */}
                    <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: nextPayment.isOverdue ? '1px solid #fee2e2' : '1px solid #dbeafe' }}>
                      <Link
                        to="/member/installments"
                        className="btn btn-orange"
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          padding: '0.85rem 1.25rem',
                          fontSize: '1rem',
                          fontWeight: '900',
                          borderRadius: '0.65rem',
                          boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)',
                          textDecoration: 'none',
                          letterSpacing: '0.01em',
                          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        }}
                      >
                        <span style={{ fontSize: '1.15rem' }}>⚡</span>
                        <span>Pay Now &bull; {formatINR(nextPayment.remainingAmount)}</span>
                        <span style={{ fontSize: '1.2rem' }}>&rarr;</span>
                      </Link>
                    </div>
                  </>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    textAlign: 'center',
                    padding: '1rem 0',
                  }}>
                    <span style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</span>
                    <strong style={{ fontSize: '1.2rem', color: '#065f46', fontWeight: '800' }}>
                      All Payments Settled!
                    </strong>
                    <p style={{ fontSize: '0.85rem', color: '#047857', marginTop: '0.35rem', marginBottom: '1rem', maxWidth: '300px' }}>
                      You have no pending or overdue installments right now. Explore new products with easy EMI!
                    </p>
                    <Link
                      to="/member/products"
                      className="btn btn-orange btn-sm"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontWeight: '800',
                        textDecoration: 'none',
                        padding: '0.5rem 1rem',
                      }}
                    >
                      <span>🛍️</span>
                      <span>Browse Catalog</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* 4 Core Summary Cards with Strict Status Colors */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.25rem',
              marginBottom: '2rem',
            }}>
              {/* Card 1: Orders (Royal Blue / Sky Theme) */}
              <div className="card card-tint-blue" style={{
                padding: '1.35rem 1.5rem',
                borderLeft: '4px solid #1e40af',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(30, 64, 175, 0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', color: '#1e40af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    My Orders
                  </span>
                  <div className="icon-tile icon-tile-blue" style={{
                    width: '38px',
                    height: '38px',
                    fontSize: '1.15rem',
                  }}>
                    🛍️
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1.85rem', color: '#0a2540', fontWeight: '800', lineHeight: 1.1 }}>
                      {summaryMetrics.totalOrders}
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>total</span>
                  </div>
                  <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="badge badge-blue" style={{ fontSize: '0.725rem', padding: '0.15rem 0.55rem' }}>
                      {summaryMetrics.activeOrders} active
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Installments (Purple Theme) */}
              <div className="card card-tint-purple" style={{
                padding: '1.35rem 1.5rem',
                borderLeft: '4px solid #7c3aed',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(124, 58, 237, 0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', color: '#6d28d9', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Installments
                  </span>
                  <div className="icon-tile icon-tile-purple" style={{
                    width: '38px',
                    height: '38px',
                    fontSize: '1.15rem',
                  }}>
                    💳
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1.85rem', color: '#5b21b6', fontWeight: '800', lineHeight: 1.1 }}>
                      {summaryMetrics.activePlans}
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>active plans</span>
                  </div>
                  <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="badge badge-purple" style={{ fontSize: '0.725rem', padding: '0.15rem 0.55rem' }}>
                      {summaryMetrics.totalPlansCount} total plans
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Paid Amount (Green Theme per Requirements) */}
              <div className="card card-tint-green" style={{
                padding: '1.35rem 1.5rem',
                borderLeft: '4px solid #059669',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(5, 150, 105, 0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Total Paid
                  </span>
                  <div className="icon-tile icon-tile-green" style={{
                    width: '38px',
                    height: '38px',
                    fontSize: '1.15rem',
                  }}>
                    ✅
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1.65rem', color: '#047857', fontWeight: '800', lineHeight: 1.1 }}>
                      {formatINR(summaryMetrics.totalPaid)}
                    </strong>
                  </div>
                  <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="badge badge-paid" style={{ fontSize: '0.725rem', padding: '0.15rem 0.55rem' }}>
                      Successfully Settled
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: Remaining Balance (Orange / Gold Theme per Requirements) */}
              <div className="card card-tint-orange" style={{
                padding: '1.35rem 1.5rem',
                borderLeft: '4px solid #ea580c',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.825rem', color: '#9a3412', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Remaining Balance
                  </span>
                  <div className="icon-tile icon-tile-orange" style={{
                    width: '38px',
                    height: '38px',
                    fontSize: '1.15rem',
                  }}>
                    📉
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1.65rem', color: '#c2410c', fontWeight: '800', lineHeight: 1.1 }}>
                      {formatINR(summaryMetrics.remainingBalance)}
                    </strong>
                  </div>
                  <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="badge badge-due" style={{ fontSize: '0.725rem', padding: '0.15rem 0.55rem' }}>
                      Remaining Balance
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Grid */}
            <section style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #fbf8f1 60%, #eff6ff 100%)',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              padding: '1.25rem 1.5rem',
              marginBottom: '2rem',
              boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ fontSize: '1rem' }}>⚡</span>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0a2540', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Quick Navigation
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <Link
                  to="/member/products"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.6rem',
                    backgroundColor: '#fff7ed',
                    border: '1px solid #fed7aa',
                    color: '#c2410c',
                    textDecoration: 'none',
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 3px rgba(234, 88, 12, 0.08)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffedd5';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(234, 88, 12, 0.15)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff7ed';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(234, 88, 12, 0.08)';
                  }}
                >
                  <span style={{ fontSize: '1.15rem' }}>📦</span>
                  <span>Browse Products</span>
                </Link>

                <Link
                  to="/member/orders"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.6rem',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1d4ed8',
                    textDecoration: 'none',
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 3px rgba(29, 78, 216, 0.08)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#dbeafe';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(29, 78, 216, 0.15)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(29, 78, 216, 0.08)';
                  }}
                >
                  <span style={{ fontSize: '1.15rem' }}>📋</span>
                  <span>My Orders</span>
                </Link>

                <Link
                  to="/member/installments"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.6rem',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#047857',
                    textDecoration: 'none',
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 3px rgba(4, 120, 87, 0.08)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#d1fae5';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(4, 120, 87, 0.15)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#ecfdf5';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(4, 120, 87, 0.08)';
                  }}
                >
                  <span style={{ fontSize: '1.15rem' }}>💳</span>
                  <span>My Installments</span>
                </Link>

                <Link
                  to="/member/payments"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.6rem',
                    backgroundColor: '#f5f3ff',
                    border: '1px solid #ddd6fe',
                    color: '#6d28d9',
                    textDecoration: 'none',
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 3px rgba(109, 40, 217, 0.08)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#ede9fe';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(109, 40, 217, 0.15)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f3ff';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(109, 40, 217, 0.08)';
                  }}
                >
                  <span style={{ fontSize: '1.15rem' }}>📜</span>
                  <span>Payment History</span>
                </Link>

                <Link
                  to="/member/profile"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.6rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    color: '#0a2540',
                    textDecoration: 'none',
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 3px rgba(10, 37, 64, 0.05)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(10, 37, 64, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffffff';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(10, 37, 64, 0.05)';
                  }}
                >
                  <span style={{ fontSize: '1.15rem' }}>👤</span>
                  <span>My Profile</span>
                </Link>
              </div>
            </section>

            {/* Installment Due & Overdue Notifications Section */}
            <div id="notifications-section" style={{ marginBottom: '2rem' }}>
              <NotificationList memberId={currentUser?.uid} />
            </div>

            {/* Products Available on Installments (Shopping Experience) */}
            {featuredProducts.length > 0 && (
              <section style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '1.25rem',
                padding: '1.75rem',
                marginBottom: '2rem',
                boxShadow: '0 4px 16px rgba(10, 37, 64, 0.04)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '1.5rem',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>🛍️</span>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                        Available on Easy Installments
                      </h2>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                      Latest appliances, mobile phones &amp; electronics ready for quick financing
                    </p>
                  </div>
                  <Link
                    to="/member/products"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: '#ea580c',
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      textDecoration: 'none',
                    }}
                  >
                    <span>View All Products</span>
                    <span>&rarr;</span>
                  </Link>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1.25rem',
                }}>
                  {featuredProducts.map((prod) => {
                    const isLowStock = Number(prod.stock) <= 2;
                    return (
                      <div
                        key={prod.id}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '1rem',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
                          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-3px)';
                          e.currentTarget.style.boxShadow = '0 10px 20px -4px rgba(10, 37, 64, 0.08), 0 4px 6px -2px rgba(10, 37, 64, 0.04)';
                          e.currentTarget.style.borderColor = '#cbd5e1';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(10, 37, 64, 0.04)';
                          e.currentTarget.style.borderColor = '#e2e8f0';
                        }}
                      >
                        {/* Image Container */}
                        <div style={{
                          height: '160px',
                          backgroundColor: '#f8fafc',
                          position: 'relative',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderBottom: '1px solid #f1f5f9',
                        }}>
                          {prod.imageURL ? (
                            <img
                              src={prod.imageURL}
                              alt={prod.name}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.parentElement) {
                                  e.target.parentElement.innerHTML = '<span style="font-size: 2.5rem; opacity: 0.35;">📦</span>';
                                }
                              }}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                padding: '0.65rem',
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: '2.5rem', opacity: 0.35 }}>📦</span>
                          )}

                          {/* Stock pill */}
                          <span style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            backgroundColor: isLowStock ? '#fff7ed' : '#ecfdf5',
                            color: isLowStock ? '#c2410c' : '#047857',
                            border: `1px solid ${isLowStock ? '#fed7aa' : '#a7f3d0'}`,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}>
                            <span>●</span>
                            <span>{isLowStock ? `Only ${prod.stock} left` : `${prod.stock} in stock`}</span>
                          </span>
                        </div>

                        {/* Product Info & Action */}
                        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <span style={{ fontSize: '0.725rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            {prod.category || 'General'}
                          </span>
                          <h3 style={{
                            fontSize: '0.95rem',
                            fontWeight: '800',
                            color: '#0f172a',
                            margin: 0,
                            lineHeight: '1.35',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginBottom: '0.65rem',
                          }}>
                            {prod.name}
                          </h3>

                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 'auto', marginBottom: '0.85rem' }}>
                            <div>
                              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Cash Price</span>
                              <strong style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '900' }}>
                                {formatINR(prod.price)}
                              </strong>
                            </div>
                            <span style={{
                              fontSize: '0.7rem',
                              color: '#ea580c',
                              backgroundColor: '#fff7ed',
                              border: '1px solid #fed7aa',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '0.35rem',
                              fontWeight: '700',
                            }}>
                              ⚡ Easy EMI
                            </span>
                          </div>

                          <Link
                            to={`/member/products/${prod.id}`}
                            className="btn btn-orange"
                            style={{
                              width: '100%',
                              boxSizing: 'border-box',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.35rem',
                              padding: '0.55rem 0.85rem',
                              fontSize: '0.825rem',
                              fontWeight: '800',
                              borderRadius: '0.5rem',
                              textDecoration: 'none',
                              boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
                            }}
                          >
                            <span>🛍️</span>
                            <span>Purchase &bull; View Plan</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 2-Column Grid: Recent Orders & Upcoming Installments */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2.5rem',
            }}>
              {/* My Recent Orders */}
              <section style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '1rem',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: 'var(--shadow-xs)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>📋</span>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                      My Recent Orders
                    </h2>
                  </div>
                  <Link
                    to="/member/orders"
                    style={{
                      color: '#0a2540',
                      fontSize: '0.825rem',
                      fontWeight: '700',
                      textDecoration: 'none',
                    }}
                  >
                    View All &rarr;
                  </Link>
                </div>

                {recentOrders.length === 0 ? (
                  <div className="empty-state-card" style={{ padding: '2.5rem 1rem' }}>
                    <div className="empty-state-icon" style={{ fontSize: '2.2rem' }}>🛍️</div>
                    <div className="empty-state-title">No orders placed yet</div>
                    <p className="empty-state-desc" style={{ marginBottom: '1rem' }}>
                      Explore our product catalog to place your first installment order.
                    </p>
                    <Link to="/member/products" className="btn btn-primary btn-sm">
                      Browse Products
                    </Link>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="responsive-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Order ID</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                          <th style={{ textAlign: 'center' }}>Order Status</th>
                          <th style={{ textAlign: 'center' }}>Delivery Status</th>
                          <th>Expected Delivery</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((order) => {
                          const badge = getOrderStatusBadge(order.status);
                          const deliveryStatus = getNormalizedDeliveryStatus(order);
                          const dBadge = getDeliveryStatusBadge(deliveryStatus);
                          const isDelivered = deliveryStatus === 'Delivered';

                          return (
                            <tr key={order.id}>
                              <td data-label="Product" style={{ fontWeight: '600', color: '#0f172a' }}>
                                {order.productName || 'Product'}
                              </td>
                              <td data-label="Order ID">
                                <code style={{ fontSize: '0.75rem', color: '#0a2540', fontWeight: '700', backgroundColor: '#f1f5f9', padding: '0.15rem 0.35rem', borderRadius: '0.25rem' }}>
                                  #{order.id ? order.id.slice(0, 8) : 'N/A'}
                                </code>
                              </td>
                              <td data-label="Amount" style={{ fontWeight: '700', color: '#0f172a', textAlign: 'right' }}>
                                {formatINR(order.totalAmount)}
                              </td>
                              <td data-label="Order Status" style={{ textAlign: 'center' }}>
                                <span style={{
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.725rem',
                                  fontWeight: '700',
                                  backgroundColor: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                  textTransform: 'capitalize',
                                }}>
                                  {badge.label}
                                </span>
                              </td>
                              <td data-label="Delivery Status" style={{ textAlign: 'center' }}>
                                <span style={{
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.725rem',
                                  fontWeight: '700',
                                  backgroundColor: dBadge.bg,
                                  color: dBadge.color,
                                  border: `1px solid ${dBadge.border}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span>{dBadge.icon}</span>
                                  <span>{dBadge.label}</span>
                                </span>
                              </td>
                              <td data-label="Expected Delivery" style={{ fontSize: '0.8rem' }}>
                                {isDelivered ? (
                                  <span style={{ color: '#047857', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                    ✓ Delivered
                                  </span>
                                ) : order.expectedDeliveryDate ? (
                                  <span style={{ color: '#0a2540', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                    📅 {formatIndianDate(order.expectedDeliveryDate)}
                                  </span>
                                ) : (
                                  <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.75rem' }}>
                                    Delivery date will be updated soon.
                                  </span>
                                )}
                              </td>
                              <td data-label="Action" style={{ textAlign: 'center' }}>
                                <Link
                                  to="/member/orders"
                                  className="btn btn-outline btn-sm"
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    textDecoration: 'none'
                                  }}
                                >
                                  Track &rarr;
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Upcoming Installments */}
              <section style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '1rem',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: 'var(--shadow-xs)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>📅</span>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                      Upcoming Installments
                    </h2>
                  </div>
                  <Link
                    to="/member/installments"
                    style={{
                      color: '#0a2540',
                      fontSize: '0.825rem',
                      fontWeight: '700',
                      textDecoration: 'none',
                    }}
                  >
                    View Plans &rarr;
                  </Link>
                </div>

                {upcomingInstallments.length === 0 ? (
                  <div className="empty-state-card" style={{ padding: '2.5rem 1rem' }}>
                    <div className="empty-state-icon" style={{ fontSize: '2.2rem' }}>✨</div>
                    <div className="empty-state-title">All caught up!</div>
                    <p className="empty-state-desc">
                      No pending collections due at this moment. All installments are up to date.
                    </p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="responsive-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th style={{ textAlign: 'center' }}>Inst #</th>
                          <th style={{ textAlign: 'right' }}>Amount Due</th>
                          <th>Due Date</th>
                          <th style={{ textAlign: 'center' }}>Status</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcomingInstallments.map((inst, idx) => {
                          const isOverdue = inst.isOverdue;
                          const isDueToday = inst.status === 'Due Today';
                          return (
                            <tr
                              key={`${inst.planId}-${inst.installmentNumber}-${idx}`}
                              style={{
                                backgroundColor: isOverdue ? '#fff5f5' : isDueToday ? '#fffaf0' : 'transparent',
                              }}
                            >
                              <td data-label="Product" style={{ fontWeight: '600', color: '#0f172a' }}>
                                {inst.productName}
                              </td>
                              <td data-label="Inst #" style={{ textAlign: 'center', fontWeight: '700', color: '#0f172a' }}>
                                #{inst.installmentNumber}
                              </td>
                              <td data-label="Amount Due" style={{
                                fontWeight: '800',
                                color: isOverdue ? '#dc2626' : isDueToday ? '#ea580c' : '#0f172a',
                                textAlign: 'right',
                              }}>
                                {formatINR(inst.remainingAmount)}
                              </td>
                              <td data-label="Due Date" style={{
                                color: isOverdue ? '#dc2626' : '#475569',
                                fontWeight: isOverdue ? '700' : 'normal',
                                whiteSpace: 'nowrap',
                              }}>
                                <div>
                                  {isOverdue && <span style={{ marginRight: '0.25rem' }}>⚠️</span>}
                                  {formatIndianDate(inst.dueDate)}
                                </div>
                                {isOverdue && inst.overdueDays > 0 && (
                                  <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: '700' }}>
                                    ({inst.overdueDays}d overdue)
                                  </div>
                                )}
                              </td>
                              <td data-label="Status" style={{ textAlign: 'center' }}>
                                <span style={{
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.725rem',
                                  fontWeight: '700',
                                  backgroundColor: isOverdue
                                    ? '#fef2f2'
                                    : isDueToday
                                    ? '#fff7ed'
                                    : '#eff6ff',
                                  color: isOverdue
                                    ? '#991b1b'
                                    : isDueToday
                                    ? '#9a3412'
                                    : '#1e40af',
                                  border: `1px solid ${
                                    isOverdue
                                      ? '#fecaca'
                                      : isDueToday
                                      ? '#fed7aa'
                                      : '#bfdbfe'
                                  }`,
                                  textTransform: 'uppercase',
                                }}>
                                  {isOverdue ? '⚠️ Overdue' : inst.status === 'Due Today' ? 'Due Today' : 'Upcoming'}
                                </span>
                              </td>
                              <td data-label="Action" style={{ textAlign: 'center' }}>
                                <Link
                                  to="/member/installments"
                                  className="btn btn-orange btn-sm"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.35rem 0.75rem',
                                    fontSize: '0.775rem',
                                    fontWeight: '700',
                                    textDecoration: 'none',
                                  }}
                                >
                                  <span>⚡</span>
                                  <span>Pay Now</span>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default MemberPage;
