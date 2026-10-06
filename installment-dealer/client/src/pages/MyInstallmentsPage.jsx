import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import MemberNavbar from '../components/MemberNavbar.jsx';
import {
  getInstallmentPlansByMember,
  calculateTotalPaid,
  calculateBalanceAmount,
  getNextDueDate
} from '../services/installmentService.js';
import InstallmentScheduleModal from '../components/InstallmentScheduleModal.jsx';
import OnlinePaymentModal from '../components/OnlinePaymentModal.jsx';
import {
  formatINR,
  formatIndianDate,
  sanitizeErrorMessage,
  getInstallmentStatus,
  getInstallmentRemainingAmount,
  getOverdueDays
} from '../utils/formatters.js';

const MyInstallmentsPage = () => {
  const { currentUser } = useAuth();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Schedule Modal
  const [selectedPlanForSchedule, setSelectedPlanForSchedule] = useState(null);

  // Online Payment Modal
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(null);
  const [selectedInstallmentForPayment, setSelectedInstallmentForPayment] = useState(null);

  const loadPlans = async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getInstallmentPlansByMember(currentUser.uid);
      setPlans(data);
    } catch (err) {
      console.error('Failed to load member installment plans:', err);
      setError(sanitizeErrorMessage(err, 'Unable to load installment plans. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, [currentUser?.uid]);

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((p) => {
      const matchesSearch =
        !q ||
        (p.productName && p.productName.toLowerCase().includes(q)) ||
        (p.orderId && p.orderId.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'all' ||
        (p.status || '').toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [plans, searchQuery, statusFilter]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalFinanced = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let activeCount = 0;
    let paidInstallments = 0;
    let pendingInstallments = 0;
    let overdueInstallments = 0;
    let earliestDueDate = null;

    plans.forEach((p) => {
      totalFinanced += parseFloat(p.totalAmount) || 0;
      const paid = calculateTotalPaid(p);
      const balance = calculateBalanceAmount(p);
      totalPaid += paid;
      totalBalance += balance;
      if ((p.status || '').toLowerCase() !== 'completed') activeCount++;

      const schedule = Array.isArray(p.schedule) ? p.schedule : [];
      schedule.forEach((s) => {
        const dynamicStatus = getInstallmentStatus(s);
        if (dynamicStatus === 'Paid') {
          paidInstallments++;
        } else if (dynamicStatus === 'Overdue') {
          overdueInstallments++;
          if (!earliestDueDate || s.dueDate < earliestDueDate) {
            earliestDueDate = s.dueDate;
          }
        } else {
          pendingInstallments++;
          if (!earliestDueDate || s.dueDate < earliestDueDate) {
            earliestDueDate = s.dueDate;
          }
        }
      });
    });

    return {
      totalFinanced: parseFloat(totalFinanced.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalBalance: parseFloat(totalBalance.toFixed(2)),
      activeCount,
      paidInstallments,
      pendingInstallments,
      overdueInstallments,
      earliestDueDate,
    };
  }, [plans]);

  const getStatusBadge = (status) => {
    if ((status || '').toLowerCase() === 'completed') {
      return {
        bg: '#ecfdf5',
        color: '#047857',
        border: '#a7f3d0',
        label: 'Completed',
        icon: '✓',
      };
    }
    return {
      bg: '#eff6ff',
      color: '#1d4ed8',
      border: '#bfdbfe',
      label: 'Active',
      icon: '⏳',
    };
  };

  // Status mapping as requested:
  // Paid = green, Due Today = orange, Overdue = red, Upcoming = blue
  const getInstallmentStatusBadge = (status) => {
    switch (status) {
      case 'Paid':
        return {
          bg: '#ecfdf5',
          color: '#047857',
          border: '#a7f3d0',
          icon: '✓',
          label: 'Paid',
        };
      case 'Partially Paid':
        return {
          bg: '#eff6ff',
          color: '#1d4ed8',
          border: '#bfdbfe',
          icon: '◐',
          label: 'Partially Paid',
        };
      case 'Overdue':
        return {
          bg: '#fef2f2',
          color: '#b91c1c',
          border: '#fecaca',
          icon: '⚠️',
          label: 'Overdue',
        };
      case 'Due Today':
        return {
          bg: '#fff7ed',
          color: '#c2410c',
          border: '#fed7aa',
          icon: '⚡',
          label: 'Due Today',
        };
      case 'Upcoming':
      case 'Pending':
      default:
        return {
          bg: '#eff6ff',
          color: '#1d4ed8',
          border: '#bfdbfe',
          icon: '⏱',
          label: status || 'Upcoming',
        };
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Unified Member Navigation */}
      <MemberNavbar activePage="installments" />

      {/* Main Container */}
      <main className="container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.75rem 1.25rem 3rem' }}>
        {/* Title & Count Banner */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                My Installment Plans
              </h1>
              <span className="badge badge-blue">
                {plans.length} {plans.length === 1 ? 'plan' : 'plans'}
              </span>
            </div>
            <p style={{ color: '#475569', fontSize: '0.9rem', marginTop: '0.25rem', margin: 0 }}>
              Track installment progress, pay online via UPI, and monitor upcoming due dates
            </p>
          </div>

          <button
            type="button"
            onClick={loadPlans}
            className="btn btn-secondary btn-sm"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* 4 Summary Metric Cards: Orders / Financed, Installments, Paid Amount, and Outstanding Amount */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}>
          {/* Card 1: Total Financed */}
          <div className="card" style={{
            padding: '1.35rem 1.5rem',
            borderLeft: '4px solid #0a2540',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                Total Financed
              </span>
              <strong style={{ fontSize: '1.5rem', color: '#0f172a', fontWeight: '800', marginTop: '0.25rem', display: 'block' }}>
                {formatINR(metrics.totalFinanced)}
              </strong>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Across all active purchases</span>
            </div>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '0.6rem',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>
              💰
            </div>
          </div>

          {/* Card 2: Installments Active */}
          <div className="card" style={{
            padding: '1.35rem 1.5rem',
            borderLeft: '4px solid #2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                Active Plans
              </span>
              <strong style={{ fontSize: '1.5rem', color: '#0f172a', fontWeight: '800', marginTop: '0.25rem', display: 'block' }}>
                {metrics.activeCount}
              </strong>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {metrics.paidInstallments} paid &bull; {metrics.pendingInstallments} upcoming
              </span>
            </div>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '0.6rem',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>
              💳
            </div>
          </div>

          {/* Card 3: Paid Amount */}
          <div className="card" style={{
            padding: '1.35rem 1.5rem',
            borderLeft: '4px solid #059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#065f46', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                Paid Amount
              </span>
              <strong style={{ fontSize: '1.5rem', color: '#059669', fontWeight: '800', marginTop: '0.25rem', display: 'block' }}>
                {formatINR(metrics.totalPaid)}
              </strong>
              <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '600' }}>
                ✓ Cleared successfully
              </span>
            </div>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '0.6rem',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>
              ✅
            </div>
          </div>

          {/* Card 4: Outstanding Amount */}
          <div className="card" style={{
            padding: '1.35rem 1.5rem',
            borderLeft: '4px solid #ea580c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#9a3412', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                Outstanding Amount
              </span>
              <strong style={{ fontSize: '1.5rem', color: '#ea580c', fontWeight: '800', marginTop: '0.25rem', display: 'block' }}>
                {formatINR(metrics.totalBalance)}
              </strong>
              <span style={{ fontSize: '0.75rem', color: metrics.overdueInstallments > 0 ? '#b91c1c' : '#9a3412', fontWeight: '600' }}>
                {metrics.overdueInstallments > 0 ? `⚠️ ${metrics.overdueInstallments} overdue` : `Next due: ${formatIndianDate(metrics.earliestDueDate)}`}
              </span>
            </div>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '0.6rem',
              backgroundColor: '#fff7ed',
              border: '1px solid #fed7aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>
              ⚡
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          padding: '1rem 1.25rem',
          marginBottom: '1.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: 'var(--shadow-xs)',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
            <span style={{
              position: 'absolute',
              left: '0.85rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: '0.95rem',
              pointerEvents: 'none',
            }}>
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product name or order ID..."
              style={{
                width: '100%',
                padding: '0.65rem 2rem 0.65rem 2.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                }}
              >
                &times;
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {['all', 'active', 'completed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '0.4rem',
                  border: '1px solid',
                  borderColor: statusFilter === st ? '#0a2540' : '#cbd5e1',
                  backgroundColor: statusFilter === st ? '#eff6ff' : '#ffffff',
                  color: statusFilter === st ? '#0a2540' : '#475569',
                  fontSize: '0.825rem',
                  fontWeight: statusFilter === st ? '700' : '600',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s',
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="loading-container" style={{ padding: '4rem 1.5rem' }}>
            <div className="loading-spinner" />
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>Loading installment plans...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="empty-state-card" style={{ borderColor: '#fca5a5' }}>
            <div className="empty-state-icon" style={{ color: '#dc2626' }}>⚠️</div>
            <h3 className="empty-state-title" style={{ color: '#dc2626' }}>Failed to Load Plans</h3>
            <p className="empty-state-desc">{error}</p>
            <button
              type="button"
              onClick={loadPlans}
              className="btn btn-primary"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredPlans.length === 0 && (
          <div className="empty-state-card">
            <div className="empty-state-icon">💳</div>
            <h3 className="empty-state-title">
              {searchQuery || statusFilter !== 'all'
                ? 'No matching installment plans found'
                : 'No installment plans yet'}
            </h3>
            <p className="empty-state-desc">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search terms or filter.'
                : 'Once NANDANAM Agencies approves your purchase order and configures an installment schedule, it will appear here.'}
            </p>
            {searchQuery || statusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="btn btn-secondary"
              >
                Reset Filters
              </button>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <Link to="/member/products" className="btn btn-orange">
                  Browse Products
                </Link>
                <Link to="/member/orders" className="btn btn-secondary">
                  View Orders
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Plans List Cards */}
        {!loading && !error && filteredPlans.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '3rem' }}>
            {filteredPlans.map((plan) => {
              const badge = getStatusBadge(plan.status);
              const totalPaid = calculateTotalPaid(plan);
              const balanceAmount = calculateBalanceAmount(plan);
              const nextDue = getNextDueDate(plan);
              const schedule = plan.schedule || [];
              const paidCount = schedule.filter((s) => getInstallmentStatus(s) === 'Paid').length;
              const overdueCount = schedule.filter((s) => getInstallmentStatus(s) === 'Overdue').length;
              const percentPaid = plan.totalAmount > 0 ? Math.min(100, Math.round((totalPaid / plan.totalAmount) * 100)) : 0;

              return (
                <div
                  key={plan.id}
                  className="card"
                  style={{
                    padding: '1.75rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '1.25rem',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  {/* Header Row */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginBottom: '1.25rem',
                    paddingBottom: '1rem',
                    borderBottom: '1px solid #e2e8f0',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                          {plan.productName}
                        </h3>
                        <code style={{
                          color: '#0a2540',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          backgroundColor: '#f1f5f9',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.35rem',
                          border: '1px solid #e2e8f0',
                        }}>
                          Order #{plan.orderId ? plan.orderId.slice(0, 8) : 'N/A'}
                        </code>
                      </div>
                      <span style={{ fontSize: '0.825rem', color: '#475569', marginTop: '0.35rem', display: 'block' }}>
                        Repayment: <strong>{plan.frequency}</strong> &bull; {plan.numberOfInstallments} total installments
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.3rem 0.75rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        textTransform: 'uppercase',
                      }}>
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => setSelectedPlanForSchedule(plan)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontWeight: '700' }}
                      >
                        <span>📅</span>
                        <span>Schedule Modal</span>
                      </button>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '1rem',
                    padding: '1.15rem 1.25rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '0.75rem',
                    border: '1px solid #e2e8f0',
                    marginBottom: '1.25rem',
                  }}>
                    <div>
                      <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Total Amount</span>
                      <strong style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: '800' }}>
                        {formatINR(plan.totalAmount)}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Down Payment</span>
                      <strong style={{ fontSize: '1.05rem', color: '#0a2540', fontWeight: '800' }}>
                        {formatINR(plan.downPayment)}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.725rem', color: '#065f46', display: 'block', fontWeight: '600' }}>Total Paid</span>
                      <strong style={{ fontSize: '1.05rem', color: '#059669', fontWeight: '800' }}>
                        {formatINR(totalPaid)}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.725rem', color: '#9a3412', display: 'block', fontWeight: '600' }}>Remaining Balance</span>
                      <strong style={{ fontSize: '1.05rem', color: '#ea580c', fontWeight: '800' }}>
                        {formatINR(balanceAmount)}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Inst. Amount</span>
                      <strong style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: '800' }}>
                        {formatINR(plan.installmentAmount)}
                      </strong>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Next Due</span>
                      <strong style={{ fontSize: '0.95rem', color: '#c2410c', fontWeight: '800' }}>
                        {formatIndianDate(nextDue)}
                      </strong>
                    </div>
                  </div>

                  {/* Progress Bar & Status */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem', color: '#475569' }}>
                      <span style={{ fontWeight: '600' }}>Payment Progress ({paidCount} of {plan.numberOfInstallments} paid)</span>
                      <strong style={{ color: '#0a2540' }}>{percentPaid}%</strong>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '8px',
                      backgroundColor: '#e2e8f0',
                      borderRadius: '9999px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${percentPaid}%`,
                        height: '100%',
                        backgroundColor: percentPaid >= 100 ? '#059669' : '#0a2540',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    {overdueCount > 0 && (
                      <span style={{ fontSize: '0.775rem', color: '#dc2626', marginTop: '0.45rem', display: 'block', fontWeight: '700' }}>
                        ⚠️ Attention: You have {overdueCount} overdue installment{overdueCount > 1 ? 's' : ''} on this plan.
                      </span>
                    )}
                  </div>

                  {/* Installments & Pay Now List (Requirement 1) */}
                  <div style={{
                    marginTop: '1.25rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid #e2e8f0',
                  }}>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      marginBottom: '0.85rem',
                    }}>
                      <span style={{
                        fontSize: '0.9rem',
                        fontWeight: '800',
                        color: '#0f172a',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}>
                        <span>📋</span> Installment Dues & Instant Online Payment
                      </span>
                      <span style={{ fontSize: '0.775rem', color: '#64748b' }}>
                        Supports UPI, Google Pay, PhonePe, and QR Code
                      </span>
                    </div>

                    <div style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.75rem',
                      overflowX: 'auto',
                    }}>
                      <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                          <tr style={{
                            borderBottom: '1px solid #e2e8f0',
                            color: '#475569',
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            backgroundColor: '#f8fafc',
                          }}>
                            <th style={{ padding: '0.75rem 1rem' }}>Inst. #</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Due Date</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Amount Due</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Paid Amount</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Remaining</th>
                            <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map((item) => {
                            const dynamicStatus = getInstallmentStatus(item);
                            const itemRem = getInstallmentRemainingAmount(item);
                            const isPaid = dynamicStatus === 'Paid';
                            const isOverdue = dynamicStatus === 'Overdue';
                            const overdueDays = isOverdue ? getOverdueDays(item.dueDate) : 0;
                            const instBadge = getInstallmentStatusBadge(dynamicStatus);

                            return (
                              <tr
                                key={item.installmentNumber}
                                style={{
                                  borderBottom: '1px solid #f1f5f9',
                                  backgroundColor: isOverdue ? '#fff5f5' : dynamicStatus === 'Due Today' ? '#fffaf0' : 'transparent',
                                  transition: 'background-color 0.15s',
                                }}
                              >
                                <td data-label="Inst. #" style={{ padding: '0.75rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                                  #{item.installmentNumber}
                                </td>
                                <td data-label="Due Date" style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: isOverdue ? '#dc2626' : '#0f172a', fontWeight: isOverdue ? '700' : '500' }}>
                                  <div>{formatIndianDate(item.dueDate)}</div>
                                  {isOverdue && overdueDays > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: '700' }}>
                                      ({overdueDays}d overdue)
                                    </div>
                                  )}
                                </td>
                                <td data-label="Amount Due" style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                  <strong style={{ color: '#0f172a' }}>{formatINR(item.amount)}</strong>
                                </td>
                                <td data-label="Paid Amount" style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                  <span style={{ color: item.paidAmount > 0 ? '#059669' : '#64748b', fontWeight: '600' }}>
                                    {formatINR(item.paidAmount || 0)}
                                  </span>
                                </td>
                                <td data-label="Remaining" style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                  <strong style={{ color: isOverdue ? '#dc2626' : (itemRem > 0 ? '#ea580c' : '#059669') }}>
                                    {formatINR(itemRem)}
                                  </strong>
                                </td>
                                <td data-label="Status" style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.725rem',
                                    fontWeight: '700',
                                    backgroundColor: instBadge.bg,
                                    color: instBadge.color,
                                    border: `1px solid ${instBadge.border}`,
                                    textTransform: 'uppercase',
                                  }}>
                                    <span>{instBadge.icon}</span>
                                    <span>{instBadge.label}</span>
                                  </span>
                                </td>
                                <td data-label="Action" style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  {!isPaid ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPlanForPayment(plan);
                                        setSelectedInstallmentForPayment(item.installmentNumber);
                                      }}
                                      className="btn btn-orange btn-sm"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        padding: '0.35rem 0.85rem',
                                        fontSize: '0.775rem',
                                        fontWeight: '800',
                                      }}
                                      title={`Pay Installment #${item.installmentNumber} online via UPI`}
                                    >
                                      <span>⚡</span>
                                      <span>Pay Now</span>
                                    </button>
                                  ) : (
                                    <span style={{ color: '#059669', fontSize: '0.8rem', fontWeight: '700' }}>
                                      ✓ Paid
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Installment Schedule Modal */}
      {selectedPlanForSchedule && (
        <InstallmentScheduleModal
          isOpen={Boolean(selectedPlanForSchedule)}
          onClose={() => setSelectedPlanForSchedule(null)}
          plan={selectedPlanForSchedule}
          canPayOnline={true}
          onPlanUpdated={loadPlans}
        />
      )}

      {/* Online Payment Modal */}
      {selectedPlanForPayment && (
        <OnlinePaymentModal
          isOpen={Boolean(selectedPlanForPayment)}
          onClose={() => {
            setSelectedPlanForPayment(null);
            setSelectedInstallmentForPayment(null);
          }}
          plan={selectedPlanForPayment}
          installmentNumber={selectedInstallmentForPayment}
          onPaymentSuccess={() => {
            loadPlans();
          }}
        />
      )}
    </div>
  );
};

export default MyInstallmentsPage;
