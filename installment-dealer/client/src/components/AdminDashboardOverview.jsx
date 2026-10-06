import React, { useState, useEffect, useMemo } from 'react';
import { getMembers } from '../services/memberService.js';
import { getProducts } from '../services/productService.js';
import { getAllOrders } from '../services/orderService.js';
import {
  getAllInstallmentPlans,
  calculateTotalPaid,
  calculateBalanceAmount
} from '../services/installmentService.js';
import { getAllPayments } from '../services/paymentService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';

const AdminDashboardOverview = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [members, setMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        getMembers(),
        getProducts(),
        getAllOrders(),
        getAllInstallmentPlans(),
        getAllPayments(),
      ]);

      const [membersRes, productsRes, ordersRes, plansRes, paymentsRes] = results;

      if (membersRes.status === 'fulfilled') setMembers(membersRes.value || []);
      if (productsRes.status === 'fulfilled') setProducts(productsRes.value || []);
      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value || []);
      if (plansRes.status === 'fulfilled') setPlans(plansRes.value || []);
      if (paymentsRes.status === 'fulfilled') setPayments(paymentsRes.value || []);

      if (results.every((r) => r.status === 'rejected')) {
        setError('Unable to load dashboard data. Please check your network connection.');
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(sanitizeErrorMessage(err, 'An unexpected error occurred while loading dashboard metrics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Calculate Summary Cards
  const summaryMetrics = useMemo(() => {
    const totalMembers = members.length;
    const activeProducts = products.filter((p) => p.status === 'active').length;
    const pendingOrders = orders.filter((o) => o.status === 'pending').length;
    const approvedOrders = orders.filter((o) => o.status === 'approved').length;
    const activePlans = plans.filter(
      (p) => (p.status || '').toLowerCase() !== 'completed'
    ).length;

    // Total Amount Collected from Payments
    const totalCollected = payments.reduce(
      (sum, pay) => sum + (parseFloat(pay.amount) || 0),
      0
    );

    // Total Outstanding Balance across all active/incomplete plans
    const totalOutstanding = plans.reduce(
      (sum, plan) => sum + calculateBalanceAmount(plan),
      0
    );

    return {
      totalMembers,
      activeProducts,
      pendingOrders,
      approvedOrders,
      activePlans,
      totalCollected: parseFloat(totalCollected.toFixed(2)),
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
    };
  }, [members, products, orders, plans, payments]);

  // Recent Orders: Latest 5
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);
  }, [orders]);

  // Recent Payments: Latest 5
  const recentPayments = useMemo(() => {
    return [...payments]
      .sort((a, b) => (b.createdAt || b.paymentDate || '').localeCompare(a.createdAt || a.paymentDate || ''))
      .slice(0, 5);
  }, [payments]);

  // Status badge styling
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

  if (loading) {
    return (
      <div className="loading-container" style={{ padding: '6rem 1.5rem' }}>
        <div className="loading-spinner" />
        <p style={{ fontSize: '1rem', color: '#0a2540', fontWeight: '700', margin: 0 }}>Loading Admin Dashboard...</p>
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Aggregating business metrics and records</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state-card" style={{ borderColor: '#fecaca', marginTop: '2rem' }}>
        <div className="empty-state-icon" style={{ color: '#b91c1c' }}>⚠️</div>
        <h3 className="empty-state-title" style={{ color: '#b91c1c' }}>Failed to Load Dashboard</h3>
        <p className="empty-state-desc">{error}</p>
        <button
          type="button"
          onClick={loadDashboardData}
          className="btn btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Dashboard Top Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
            Business Overview
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem', margin: 0 }}>
            Live performance indicators and telemetry across sales, members, and installment collections
          </p>
        </div>

        <button
          type="button"
          onClick={loadDashboardData}
          className="btn btn-secondary btn-sm"
        >
          <span>🔄</span>
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Summary Cards Grid - Distinct Professional Colourful Themes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem',
      }}>
        {/* Card 1: Total Members (Royal Blue / Navy Theme) */}
        <div
          className="card card-tint-blue"
          onClick={() => onNavigate('members')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            borderRadius: '0.875rem',
            boxShadow: '0 2px 6px rgba(29, 78, 216, 0.08)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#60a5fa';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(29, 78, 216, 0.16)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = '#bfdbfe';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(29, 78, 216, 0.08)';
          }}
        >
          <div className="icon-tile icon-tile-blue" style={{
            background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(29, 78, 216, 0.28)',
            border: 'none',
          }}>
            👥
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#1e40af', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Members
            </span>
            <strong style={{ fontSize: '1.45rem', color: '#0a2540', fontWeight: '800' }}>
              {summaryMetrics.totalMembers}
            </strong>
          </div>
        </div>

        {/* Card 2: Active Products (Mint Green / Emerald Theme) */}
        <div
          className="card card-tint-green"
          onClick={() => onNavigate('products')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            borderRadius: '0.875rem',
            boxShadow: '0 2px 6px rgba(5, 150, 105, 0.08)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#34d399';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(5, 150, 105, 0.16)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = '#a7f3d0';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(5, 150, 105, 0.08)';
          }}
        >
          <div className="icon-tile icon-tile-green" style={{
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(5, 150, 105, 0.28)',
            border: 'none',
          }}>
            📦
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#065f46', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Products
            </span>
            <strong style={{ fontSize: '1.45rem', color: '#047857', fontWeight: '800' }}>
              {summaryMetrics.activeProducts}
            </strong>
          </div>
        </div>

        {/* Card 3: Pending Orders (Orange / Amber Theme) */}
        <div
          className="card card-tint-orange"
          onClick={() => onNavigate('orders')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            borderRadius: '0.875rem',
            boxShadow: '0 2px 6px rgba(234, 88, 12, 0.08)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#fb923c';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(234, 88, 12, 0.18)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = '#fed7aa';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(234, 88, 12, 0.08)';
          }}
        >
          <div className="icon-tile icon-tile-orange" style={{
            background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(234, 88, 12, 0.28)',
            border: 'none',
          }}>
            ⏳
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#9a3412', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending Orders
            </span>
            <strong style={{ fontSize: '1.45rem', color: '#c2410c', fontWeight: '800' }}>
              {summaryMetrics.pendingOrders}
            </strong>
          </div>
        </div>

        {/* Card 4: Approved Orders (Sky Blue Theme) */}
        <div
          className="card card-tint-blue"
          onClick={() => onNavigate('orders')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            borderRadius: '0.875rem',
            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.08)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#38bdf8';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(2, 132, 199, 0.18)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = '#bfdbfe';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(2, 132, 199, 0.08)';
          }}
        >
          <div className="icon-tile icon-tile-blue" style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(2, 132, 199, 0.28)',
            border: 'none',
          }}>
            ✅
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#0369a1', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Approved Orders
            </span>
            <strong style={{ fontSize: '1.45rem', color: '#0a2540', fontWeight: '800' }}>
              {summaryMetrics.approvedOrders}
            </strong>
          </div>
        </div>

        {/* Card 5: Active Installment Plans (Purple Theme) */}
        <div
          className="card card-tint-purple"
          onClick={() => onNavigate('installments')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            borderRadius: '0.875rem',
            boxShadow: '0 2px 6px rgba(109, 40, 217, 0.08)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#a78bfa';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(109, 40, 217, 0.18)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = '#ddd6fe';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(109, 40, 217, 0.08)';
          }}
        >
          <div className="icon-tile icon-tile-purple" style={{
            background: 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(109, 40, 217, 0.28)',
            border: 'none',
          }}>
            💳
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#6d28d9', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Plans
            </span>
            <strong style={{ fontSize: '1.45rem', color: '#5b21b6', fontWeight: '800' }}>
              {summaryMetrics.activePlans}
            </strong>
          </div>
        </div>

        {/* Card 6: Total Amount Collected (Mint Green / Emerald Theme) */}
        <div
          className="card card-tint-green"
          onClick={() => onNavigate('payments')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            borderRadius: '0.875rem',
            boxShadow: '0 2px 6px rgba(4, 120, 87, 0.08)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#34d399';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(4, 120, 87, 0.18)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = '#a7f3d0';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(4, 120, 87, 0.08)';
          }}
        >
          <div className="icon-tile icon-tile-green" style={{
            background: 'linear-gradient(135deg, #047857 0%, #059669 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(4, 120, 87, 0.28)',
            border: 'none',
          }}>
            💰
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#047857', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Collected
            </span>
            <strong style={{ fontSize: '1.35rem', color: '#047857', fontWeight: '800' }}>
              {formatINR(summaryMetrics.totalCollected)}
            </strong>
          </div>
        </div>

        {/* Card 7: Total Outstanding Amount (Rose / Red Theme) */}
        <div
          className="card card-tint-red"
          onClick={() => onNavigate('installments')}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.25rem',
            borderRadius: '0.875rem',
            boxShadow: '0 2px 6px rgba(185, 28, 28, 0.08)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = '#f87171';
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(185, 28, 28, 0.18)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = '#fecdd3';
            e.currentTarget.style.boxShadow = '0 2px 6px rgba(185, 28, 28, 0.08)';
          }}
        >
          <div className="icon-tile icon-tile-red" style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(220, 38, 38, 0.28)',
            border: 'none',
          }}>
            📉
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#991b1b', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Outstanding Balance
            </span>
            <strong style={{ fontSize: '1.35rem', color: '#991b1b', fontWeight: '800' }}>
              {formatINR(summaryMetrics.totalOutstanding)}
            </strong>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts with Colorful Action Buttons */}
      <div className="card" style={{
        padding: '1.35rem 1.5rem',
        background: 'linear-gradient(135deg, #ffffff 0%, #fbf8f1 60%, #eff6ff 100%)',
        border: '1px solid #e2e8f0',
        borderRadius: '0.875rem',
        boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
          <span style={{ fontSize: '1.1rem' }}>⚡</span>
          <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0a2540', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Quick Actions
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => onNavigate('members')}
            className="btn btn-primary btn-sm"
          >
            <span>👤</span>
            <span>Add Member</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="btn btn-success btn-sm"
          >
            <span>📦</span>
            <span>Add Product</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="btn btn-secondary btn-sm"
            style={{ borderColor: '#bfdbfe', color: '#1e40af' }}
          >
            <span>📋</span>
            <span>Manage Orders</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('installments')}
            className="btn btn-purple btn-sm"
          >
            <span>💳</span>
            <span>Installment Plans</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="btn btn-secondary btn-sm"
            style={{ borderColor: '#fed7aa', color: '#c2410c' }}
          >
            <span>💵</span>
            <span>Payment Audit</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('collection')}
            className="btn btn-orange btn-sm"
          >
            <span>💰</span>
            <span>Daily Collection</span>
          </button>
        </div>
      </div>

      {/* 2-Column Grid: Recent Orders & Recent Payments */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
      }}>
        {/* Recent Orders */}
        <section className="card" style={{
          padding: '1.5rem',
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
          border: '1px solid #e2e8f0',
          borderRadius: '0.875rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                width: '32px',
                height: '32px',
                borderRadius: '0.5rem',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.05rem',
              }}>
                📋
              </span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                Recent Orders
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              style={{
                background: 'none',
                border: 'none',
                color: '#ea580c',
                fontSize: '0.825rem',
                fontWeight: '700',
                cursor: 'pointer',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.35rem',
              }}
            >
              View All &rarr;
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="empty-state-card" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon" style={{ fontSize: '2rem' }}>📋</div>
              <p className="empty-state-desc" style={{ margin: 0 }}>No orders submitted yet.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Member</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const badge = getOrderStatusBadge(order.status);
                    return (
                      <tr key={order.id}>
                        <td data-label="Order ID">
                          <code style={{ fontSize: '0.75rem', color: '#0a2540', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.15rem 0.4rem', borderRadius: '0.3rem', fontWeight: '700' }}>
                            #{order.id ? order.id.slice(0, 6) : 'N/A'}
                          </code>
                        </td>
                        <td data-label="Member">
                          <div style={{ color: '#0f172a', fontWeight: '700' }}>
                            {order.memberName || 'Customer'}
                          </div>
                          {order.memberPhone && (
                            <div style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}>
                              <a
                                href={`tel:${order.memberPhone}`}
                                style={{
                                  color: '#0284c7',
                                  fontWeight: '600',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                }}
                                title="Click to call customer"
                              >
                                📞 {order.memberPhone}
                              </a>
                            </div>
                          )}
                          {order.memberCode && (
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                              ID: {order.memberCode}
                            </div>
                          )}
                        </td>
                        <td data-label="Product" style={{ color: '#334155' }}>
                          {order.productName || 'Product'}
                        </td>
                        <td data-label="Amount" style={{ fontWeight: '800', color: '#0a2540', textAlign: 'right' }}>
                          {formatINR(order.totalAmount)}
                        </td>
                        <td data-label="Date" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
                          {formatIndianDate(order.createdAt)}
                        </td>
                        <td data-label="Status" style={{ textAlign: 'center' }}>
                          <span style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '9999px',
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            textTransform: 'capitalize',
                          }}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent Payments */}
        <section className="card" style={{
          padding: '1.5rem',
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
          border: '1px solid #e2e8f0',
          borderRadius: '0.875rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                width: '32px',
                height: '32px',
                borderRadius: '0.5rem',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.05rem',
              }}>
                💵
              </span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                Recent Payments
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              style={{
                background: 'none',
                border: 'none',
                color: '#ea580c',
                fontSize: '0.825rem',
                fontWeight: '700',
                cursor: 'pointer',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.35rem',
              }}
            >
              View All &rarr;
            </button>
          </div>

          {recentPayments.length === 0 ? (
            <div className="empty-state-card" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon" style={{ fontSize: '2rem' }}>💵</div>
              <p className="empty-state-desc" style={{ margin: 0 }}>No payments recorded yet.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((pay) => (
                    <tr key={pay.id}>
                      <td data-label="Member">
                        <div style={{ color: '#0f172a', fontWeight: '700' }}>
                          {pay.memberName || 'Customer'}
                        </div>
                        {pay.memberPhone && (
                          <div style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}>
                            <a
                              href={`tel:${pay.memberPhone}`}
                              style={{
                                color: '#0284c7',
                                fontWeight: '600',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                              }}
                              title="Click to call customer"
                            >
                              📞 {pay.memberPhone}
                            </a>
                          </div>
                        )}
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>
                          {pay.installmentNumber && <span>Inst #{pay.installmentNumber}</span>}
                          {pay.memberCode && <span> • ID: {pay.memberCode}</span>}
                        </div>
                      </td>
                      <td data-label="Amount" style={{ fontWeight: '700', color: '#047857' }}>
                        {formatINR(pay.amount)}
                      </td>
                      <td data-label="Method">
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.35rem',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                        }}>
                          {pay.paymentMethod}
                        </span>
                      </td>
                      <td data-label="Date" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
                        {formatIndianDate(pay.paymentDate || pay.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminDashboardOverview;
