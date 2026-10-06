import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getAllInstallmentPlans,
  calculateTotalPaid,
  calculateBalanceAmount,
  getNextDueDate
} from '../services/installmentService.js';
import { logAdminActivity, ACTION_TYPES } from '../services/activityLogService.js';
import { getAllOrders } from '../services/orderService.js';
import InstallmentScheduleModal from './InstallmentScheduleModal.jsx';
import CreateInstallmentModal from './CreateInstallmentModal.jsx';
import RecordPaymentModal from './RecordPaymentModal.jsx';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';

const InstallmentManagement = () => {
  const { currentUser, userProfile } = useAuth();
  const adminName = userProfile?.name || currentUser?.displayName || 'Administrator';
  const adminEmail = userProfile?.email || currentUser?.email || '';
  const adminId = currentUser?.uid || '';
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [selectedPlanForSchedule, setSelectedPlanForSchedule] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedOrderForPlan, setSelectedOrderForPlan] = useState(null);
  const [planForPayment, setPlanForPayment] = useState(null);

  // Approved orders without plans picker modal
  const [isOrderPickerOpen, setIsOrderPickerOpen] = useState(false);
  const [approvedOrders, setApprovedOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Notifications
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await getAllInstallmentPlans();
      setPlans(data);
    } catch (err) {
      console.error('Failed to load installment plans:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleOpenCreatePicker = async () => {
    setOrdersLoading(true);
    setIsOrderPickerOpen(true);
    try {
      const allOrders = await getAllOrders();
      const existingOrderIds = new Set(plans.map((p) => p.orderId));
      const eligible = allOrders.filter(
        (o) => o.status === 'approved' && !existingOrderIds.has(o.id)
      );
      setApprovedOrders(eligible);
    } catch (err) {
      console.error('Failed to load approved orders:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleSelectOrderForPlan = (order) => {
    setSelectedOrderForPlan(order);
    setIsOrderPickerOpen(false);
    setIsCreateModalOpen(true);
  };

  const handlePlanCreated = (newPlan) => {
    setPlans((prev) => [newPlan, ...prev]);
    showNotification(`Installment plan created for ${newPlan.productName} (${newPlan.memberName}).`);

    logAdminActivity({
      action: `Created Installment Plan for ${newPlan.productName}`,
      actionType: ACTION_TYPES.PLAN_CREATED,
      adminId,
      adminName,
      adminEmail,
      targetType: 'plan',
      targetId: newPlan.id,
      planId: newPlan.id,
      orderId: newPlan.orderId,
      memberId: newPlan.memberId,
      memberName: newPlan.memberName,
      productName: newPlan.productName,
      amount: parseFloat(newPlan.totalAmount) || 0,
      details: `Created ${newPlan.numberOfInstallments}-installment ${newPlan.frequency || 'Monthly'} plan for ${newPlan.memberName} (Total: ₹${newPlan.totalAmount})`,
    });
  };

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanPhone = q.replace(/\D/g, '');
    return plans.filter((p) => {
      const pPhoneDigits = (p.memberPhone || '').replace(/\D/g, '');
      const matchesSearch =
        !q ||
        (p.memberName && p.memberName.toLowerCase().includes(q)) ||
        (p.memberPhone && p.memberPhone.toLowerCase().includes(q)) ||
        (cleanPhone && pPhoneDigits.includes(cleanPhone)) ||
        (p.memberCode && p.memberCode.toLowerCase().includes(q)) ||
        (p.memberId && p.memberId.toLowerCase().includes(q)) ||
        (p.memberEmail && p.memberEmail.toLowerCase().includes(q)) ||
        (p.productName && p.productName.toLowerCase().includes(q)) ||
        (p.orderId && p.orderId.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'all' ||
        (p.status || '').toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [plans, searchQuery, statusFilter]);

  // Metrics
  const activePlansCount = plans.filter(
    (p) => (p.status || '').toLowerCase() !== 'completed'
  ).length;
  const totalFinanced = plans.reduce((acc, p) => acc + (parseFloat(p.totalAmount) || 0), 0);
  const totalBalance = plans.reduce((acc, p) => acc + calculateBalanceAmount(p), 0);

  return (
    <section style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '1rem',
      padding: '1.75rem',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    }}>
      {/* Header and Add Action */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
              Installment Plans
            </h2>
            <span style={{
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: '700',
            }}>
              {plans.length} {plans.length === 1 ? 'plan' : 'plans'}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', marginBottom: 0 }}>
            Configure financing schedules, down payments, and inspect recurring installment due dates
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={loadPlans}
            disabled={loading}
            style={{
              padding: '0.55rem 0.95rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#334155',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s',
            }}
          >
            <span>↻</span>
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreatePicker}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 1.25rem',
              backgroundColor: '#ea580c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c2410c'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ea580c'}
          >
            <span>+</span>
            <span>New Installment Plan</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          backgroundColor: '#f8fafc',
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
            Active Plans
          </span>
          <strong style={{ fontSize: '1.35rem', color: '#1e3a8a', fontWeight: '800' }}>
            {activePlansCount}
          </strong>
        </div>

        <div style={{
          backgroundColor: '#f8fafc',
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
            Total Financed
          </span>
          <strong style={{ fontSize: '1.35rem', color: '#047857', fontWeight: '800' }}>
            {formatINR(totalFinanced)}
          </strong>
        </div>

        <div style={{
          backgroundColor: '#f8fafc',
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
            Outstanding Balance
          </span>
          <strong style={{ fontSize: '1.35rem', color: '#c2410c', fontWeight: '800' }}>
            {formatINR(totalBalance)}
          </strong>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div style={{
          backgroundColor: notification.type === 'error' ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          color: notification.type === 'error' ? '#b91c1c' : '#047857',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
        padding: '0.85rem 1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '0.75rem',
        border: '1px solid #e2e8f0',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
          <span style={{
            position: 'absolute',
            left: '0.85rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            fontSize: '0.9rem',
          }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name, Mobile Number, Member ID, or Plan..."
            style={{
              width: '100%',
              padding: '0.6rem 2rem 0.6rem 2.4rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              color: '#0f172a',
              fontSize: '0.875rem',
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
                fontSize: '1rem',
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['all', 'active', 'completed'].map((st) => {
            const isActive = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.4rem',
                  border: '1px solid',
                  borderColor: isActive ? '#0a2540' : '#e2e8f0',
                  backgroundColor: isActive ? '#0a2540' : '#ffffff',
                  color: isActive ? '#ffffff' : '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.15s',
                }}
              >
                {st}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ margin: 0, fontWeight: '500' }}>Loading installment plans...</p>
        </div>
      ) : filteredPlans.length === 0 ? (
        /* Empty State */
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💳</div>
          <h3 style={{ fontSize: '1.1rem', color: '#0a2540', fontWeight: '700', marginBottom: '0.4rem' }}>
            {searchQuery || statusFilter !== 'all' ? 'No matching installment plans found' : 'No installment plans configured'}
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search keywords or status filter.'
              : 'Create installment plans for approved orders to begin tracking periodic installment schedules.'}
          </p>
          {searchQuery || statusFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#334155',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreatePicker}
              style={{
                padding: '0.65rem 1.25rem',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              + Create First Plan
            </button>
          )}
        </div>
      ) : (
        /* Plans Table */
        <div className="table-container" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
          <table
            className="responsive-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.85rem',
            }}
          >
            <thead>
              <tr style={{
                backgroundColor: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                color: '#475569',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: '700',
              }}>
                <th style={{ padding: '0.85rem 0.75rem' }}>Member</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Product</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Total</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Down Pay</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Remaining</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Installment</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Count</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Paid</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Balance</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Next Due</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Status</th>
                <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.map((plan) => {
                const totalPaid = calculateTotalPaid(plan);
                const balance = calculateBalanceAmount(plan);
                const nextDue = getNextDueDate(plan.schedule);
                const isCompleted = (plan.status || '').toLowerCase() === 'completed';

                return (
                  <tr
                    key={plan.id}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    {/* Customer Name & Mobile */}
                    <td data-label="Member" style={{ padding: '0.85rem 0.75rem' }}>
                      <div style={{ fontWeight: '800', color: '#0a2540', fontSize: '0.925rem' }}>
                        {plan.memberName}
                      </div>
                      {plan.memberPhone ? (
                        <div style={{ marginTop: '0.2rem' }}>
                          <a
                            href={`tel:${plan.memberPhone}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.15rem 0.45rem',
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #86efac',
                              borderRadius: '0.35rem',
                              color: '#065f46',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              textDecoration: 'none',
                            }}
                          >
                            <span>📞</span> {plan.memberPhone}
                          </a>
                        </div>
                      ) : null}
                      <div style={{ marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {plan.memberCode ? (
                          <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: '700' }}>
                            {plan.memberCode}
                          </span>
                        ) : null}
                        <code style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>
                          #{plan.orderId ? plan.orderId.slice(0, 8) : 'N/A'}
                        </code>
                      </div>
                    </td>

                    {/* Product */}
                    <td data-label="Product" style={{ padding: '0.85rem 0.75rem', fontWeight: '600', color: '#0f172a' }}>
                      {plan.productName}
                    </td>

                    {/* Total */}
                    <td data-label="Total" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', fontWeight: '600', color: '#0f172a' }}>
                      {formatINR(plan.totalAmount)}
                    </td>

                    {/* Down Payment */}
                    <td data-label="Down Pay" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#1d4ed8', fontWeight: '600' }}>
                      {formatINR(plan.downPayment)}
                    </td>

                    {/* Remaining */}
                    <td data-label="Remaining" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#475569' }}>
                      {formatINR(plan.remainingAmount)}
                    </td>

                    {/* Installment Amount */}
                    <td data-label="Installment" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <strong style={{ color: '#047857' }}>{formatINR(plan.installmentAmount)}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>/{plan.frequency === 'Weekly' ? 'wk' : 'mo'}</span>
                    </td>

                    {/* Count */}
                    <td data-label="Count" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#475569' }}>
                      {plan.numberOfInstallments} payments
                    </td>

                    {/* Paid */}
                    <td data-label="Paid" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#047857', fontWeight: '600' }}>
                      {formatINR(totalPaid)}
                    </td>

                    {/* Balance */}
                    <td data-label="Balance" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <strong style={{ color: balance > 0 ? '#ea580c' : '#047857' }}>
                        {formatINR(balance)}
                      </strong>
                    </td>

                    {/* Next Due */}
                    <td data-label="Next Due" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#475569', fontSize: '0.8rem' }}>
                      {formatIndianDate(nextDue)}
                    </td>

                    {/* Status */}
                    <td data-label="Status" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: isCompleted ? '#ecfdf5' : '#eff6ff',
                        color: isCompleted ? '#047857' : '#1d4ed8',
                        border: `1px solid ${isCompleted ? '#a7f3d0' : '#bfdbfe'}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {plan.status || 'Active'}
                      </span>
                    </td>

                    {/* Action: View Schedule & Record Payment */}
                    <td data-label="Action" style={{ padding: '0.85rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => setPlanForPayment(plan)}
                            title="Record Payment"
                            style={{
                              padding: '0.35rem 0.7rem',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              color: '#047857',
                              borderRadius: '0.35rem',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span>💵</span> Pay
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedPlanForSchedule(plan)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            borderRadius: '0.35rem',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                          }}
                        >
                          Schedule
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Select Approved Order Modal */}
      {isOrderPickerOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '560px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight: '85vh',
            overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid #e2e8f0',
            }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                  Select Approved Order
                </h3>
                <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
                  Only approved orders without an existing installment plan can be configured
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderPickerOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {ordersLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 0.75rem' }} />
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Checking approved orders...</p>
              </div>
            ) : approvedOrders.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '2.5rem 1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '0.75rem',
                border: '1px dashed #cbd5e1',
              }}>
                <p style={{ color: '#0a2540', fontWeight: '700', fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                  No unconfigured approved orders found.
                </p>
                <span style={{ fontSize: '0.825rem', color: '#64748b', lineHeight: 1.5 }}>
                  First approve an order under the "Orders" tab, then return here to configure its installment plan.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {approvedOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      padding: '1rem',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', color: '#0a2540' }}>
                        {order.productName} &times; {order.quantity}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                        Customer: <strong style={{ color: '#0f172a' }}>{order.memberName}</strong> &bull; Total: <span style={{ color: '#047857', fontWeight: '700' }}>{formatINR(order.totalAmount)}</span>
                      </div>
                      <code style={{ fontSize: '0.75rem', color: '#ea580c', fontWeight: '600' }}>#{order.id.slice(0, 8)}</code>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectOrderForPlan(order)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#ea580c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '0.5rem',
                        fontSize: '0.825rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                      }}
                    >
                      Configure Plan &rarr;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={() => setIsOrderPickerOpen(false)}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Installment Plan Modal */}
      <CreateInstallmentModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setSelectedOrderForPlan(null);
        }}
        order={selectedOrderForPlan}
        onPlanCreated={handlePlanCreated}
      />

      {/* Installment Schedule Inspection Modal */}
      <InstallmentScheduleModal
        isOpen={Boolean(selectedPlanForSchedule)}
        onClose={() => setSelectedPlanForSchedule(null)}
        plan={selectedPlanForSchedule}
        canRecordPayment={true}
        onPlanUpdated={(updatedPlan) => {
          setPlans((prev) =>
            prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p))
          );
          setSelectedPlanForSchedule(updatedPlan);
          showNotification('Payment recorded and installment schedule updated!', 'success');
        }}
      />

      {/* Standalone Record Payment Modal */}
      {planForPayment && (
        <RecordPaymentModal
          isOpen={Boolean(planForPayment)}
          onClose={() => setPlanForPayment(null)}
          plan={planForPayment}
          onPaymentRecorded={(payment, updatedPlan) => {
            setPlans((prev) =>
              prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p))
            );
            showNotification(
              `Payment of ${formatINR(payment.amount)} recorded for ${updatedPlan.productName}!`,
              'success'
            );
            setPlanForPayment(null);
          }}
        />
      )}
    </section>
  );
};

export default InstallmentManagement;
