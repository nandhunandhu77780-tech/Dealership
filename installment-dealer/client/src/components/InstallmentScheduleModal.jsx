import React, { useState, useEffect } from 'react';
import { calculateTotalPaid, calculateBalanceAmount } from '../services/installmentService.js';
import { getPaymentsByInstallmentPlan } from '../services/paymentService.js';
import {
  formatINR,
  formatIndianDate,
  getInstallmentStatus,
  getInstallmentRemainingAmount,
  getOverdueDays,
} from '../utils/formatters.js';
import RecordPaymentModal from './RecordPaymentModal.jsx';
import PaymentReceiptModal from './PaymentReceiptModal.jsx';
import OnlinePaymentModal from './OnlinePaymentModal.jsx';

const InstallmentScheduleModal = ({
  isOpen,
  onClose,
  plan = null,
  canRecordPayment = false,
  canPayOnline = false,
  onPlanUpdated = null,
}) => {
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'history'
  const [currentPlan, setCurrentPlan] = useState(plan);
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null);

  // Admin Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [targetInstallmentNumber, setTargetInstallmentNumber] = useState(null);

  // Member Online Payment Modal
  const [onlinePaymentModalOpen, setOnlinePaymentModalOpen] = useState(false);
  const [onlineTargetInstNumber, setOnlineTargetInstNumber] = useState(null);

  useEffect(() => {
    setCurrentPlan(plan);
    setActiveTab('schedule');
  }, [plan, isOpen]);

  // Load payment history when modal opens or tab changes
  const loadPaymentHistory = async () => {
    if (!currentPlan?.id) return;
    setLoadingPayments(true);
    try {
      const data = await getPaymentsByInstallmentPlan(currentPlan.id);
      setPayments(data);
    } catch (err) {
      console.error('Failed to load payment history:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentPlan?.id) {
      loadPaymentHistory();
    }
  }, [isOpen, currentPlan?.id, activeTab]);

  if (!isOpen || !currentPlan) return null;

  const totalPaid = calculateTotalPaid(currentPlan);
  const balanceRemaining = calculateBalanceAmount(currentPlan);

  // Status mapping as requested:
  // Paid = green, Due Today = orange, Overdue = red, Upcoming = blue
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Paid':
        return {
          bg: '#ecfdf5',
          color: '#047857',
          border: '#a7f3d0',
          icon: '✓',
          label: 'PAID',
        };
      case 'Overdue':
        return {
          bg: '#fef2f2',
          color: '#b91c1c',
          border: '#fecaca',
          icon: '⚠️',
          label: 'OVERDUE',
        };
      case 'Due Today':
        return {
          bg: '#fff7ed',
          color: '#c2410c',
          border: '#fed7aa',
          icon: '🔔',
          label: 'DUE TODAY',
        };
      case 'Upcoming':
      case 'Pending':
      default:
        return {
          bg: '#eff6ff',
          color: '#1d4ed8',
          border: '#bfdbfe',
          icon: '⏱',
          label: 'UPCOMING',
        };
    }
  };

  const scheduleList = Array.isArray(currentPlan.schedule) ? currentPlan.schedule : [];

  const handleOpenPaymentForInstallment = (instNumber) => {
    setTargetInstallmentNumber(instNumber);
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = (newPayment, updatedPlan) => {
    setCurrentPlan(updatedPlan);
    loadPaymentHistory();
    if (onPlanUpdated) {
      onPlanUpdated(updatedPlan);
    }
  };

  const handleOpenOnlinePayment = (instNumber) => {
    setOnlineTargetInstNumber(instNumber);
    setOnlinePaymentModalOpen(true);
  };

  const handleOnlinePaymentSuccess = (newPayment, updatedPlan) => {
    setCurrentPlan(updatedPlan);
    loadPaymentHistory();
    if (onPlanUpdated) {
      onPlanUpdated(updatedPlan);
    }
  };

  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '780px',
          backgroundColor: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '1.25rem',
          padding: '2rem',
          boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}>
          {/* Modal Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid #e2e8f0',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.3rem' }}>💳</span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Installment Plan Details
                </h3>
              </div>
              <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0a2540' }}>
                  👤 {currentPlan.memberName}
                </span>
                {currentPlan.memberPhone ? (
                  <a
                    href={`tel:${currentPlan.memberPhone}`}
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      color: '#065f46',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: '0.35rem',
                      padding: '0.15rem 0.5rem',
                      textDecoration: 'none',
                    }}
                  >
                    📞 {currentPlan.memberPhone}
                  </a>
                ) : null}
                {currentPlan.memberCode ? (
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#ea580c', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '0.35rem', padding: '0.15rem 0.45rem' }}>
                    {currentPlan.memberCode}
                  </span>
                ) : null}
                <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
                  &bull; Order #{currentPlan.orderId ? currentPlan.orderId.slice(0, 8) : 'N/A'} &bull; <strong style={{ color: '#0a2540' }}>{currentPlan.productName}</strong>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {canRecordPayment && (currentPlan.status || '').toLowerCase() !== 'completed' && (
                <button
                  type="button"
                  onClick={() => handleOpenPaymentForInstallment(null)}
                  className="btn btn-success btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontWeight: '700',
                  }}
                >
                  <span>💵</span>
                  <span>Record Payment</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '1.6rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: '0.25rem',
                }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Plan Overview Metrics */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.85rem',
            marginBottom: '1.25rem',
          }}>
            <div style={{
              backgroundColor: '#f8fafc',
              padding: '0.85rem 1rem',
              borderRadius: '0.6rem',
              border: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Total Financed</span>
              <strong style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: '800' }}>{formatINR(currentPlan.totalAmount)}</strong>
            </div>

            <div style={{
              backgroundColor: '#f8fafc',
              padding: '0.85rem 1rem',
              borderRadius: '0.6rem',
              border: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Down Payment</span>
              <strong style={{ fontSize: '1.05rem', color: '#0a2540', fontWeight: '800' }}>{formatINR(currentPlan.downPayment)}</strong>
            </div>

            <div style={{
              backgroundColor: '#f8fafc',
              padding: '0.85rem 1rem',
              borderRadius: '0.6rem',
              border: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: '0.725rem', color: '#065f46', display: 'block', fontWeight: '600' }}>Total Paid</span>
              <strong style={{ fontSize: '1.05rem', color: '#059669', fontWeight: '800' }}>{formatINR(totalPaid)}</strong>
            </div>

            <div style={{
              backgroundColor: '#f8fafc',
              padding: '0.85rem 1rem',
              borderRadius: '0.6rem',
              border: '1px solid #e2e8f0',
            }}>
              <span style={{ fontSize: '0.725rem', color: '#9a3412', display: 'block', fontWeight: '600' }}>Remaining Balance</span>
              <strong style={{ fontSize: '1.05rem', color: balanceRemaining > 0 ? '#ea580c' : '#059669', fontWeight: '800' }}>
                {formatINR(balanceRemaining)}
              </strong>
            </div>
          </div>

          {/* Member & Plan Info Bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '0.6rem',
            marginBottom: '1.25rem',
            fontSize: '0.85rem',
          }}>
            <div>
              <span style={{ color: '#475569' }}>Member: </span>
              <strong style={{ color: '#0f172a' }}>{currentPlan.memberName}</strong>
            </div>
            <div>
              <span style={{ color: '#475569' }}>Frequency: </span>
              <strong style={{ color: '#1e40af' }}>{currentPlan.frequency}</strong> ({currentPlan.numberOfInstallments} installments)
            </div>
            <div>
              <span style={{ color: '#475569' }}>Plan Status: </span>
              <span style={{
                textTransform: 'uppercase',
                fontWeight: '800',
                fontSize: '0.75rem',
                color: (currentPlan.status || '').toLowerCase() === 'completed' ? '#059669' : '#1e40af',
              }}>
                {currentPlan.status || 'Active'}
              </span>
            </div>
          </div>

          {/* Tab Selection: Schedule vs Payment History */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            borderBottom: '1px solid #e2e8f0',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '0.4rem',
                border: 'none',
                backgroundColor: activeTab === 'schedule' ? '#0a2540' : 'transparent',
                color: activeTab === 'schedule' ? '#ffffff' : '#475569',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>📅</span>
              <span>Installment Schedule</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '0.4rem',
                border: 'none',
                backgroundColor: activeTab === 'history' ? '#0a2540' : 'transparent',
                color: activeTab === 'history' ? '#ffffff' : '#475569',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>📜</span>
              <span>Payment History</span>
              {payments.length > 0 && (
                <span style={{
                  backgroundColor: activeTab === 'history' ? 'rgba(255,255,255,0.25)' : '#eff6ff',
                  color: activeTab === 'history' ? '#ffffff' : '#1e40af',
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '9999px',
                  border: activeTab === 'history' ? 'none' : '1px solid #bfdbfe',
                }}>
                  {payments.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: INSTALLMENT SCHEDULE */}
          {activeTab === 'schedule' && (
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              marginBottom: '1.5rem',
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="responsive-table" style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                }}>
                  <thead>
                    <tr style={{
                      borderBottom: '1px solid #e2e8f0',
                      color: '#475569',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      backgroundColor: '#f8fafc',
                    }}>
                      <th style={{ padding: '0.75rem 0.85rem' }}>No.</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Due Date</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Amount Due</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Paid Amount</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Remaining</th>
                      <th style={{ padding: '0.75rem 0.85rem' }}>Status</th>
                      {(canRecordPayment || canPayOnline) && (
                        <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleList.map((item) => {
                      const dynamicStatus = getInstallmentStatus(item);
                      const badge = getStatusBadge(dynamicStatus);
                      const isPaid = dynamicStatus === 'Paid';
                      const isOverdue = dynamicStatus === 'Overdue';
                      const isDueToday = dynamicStatus === 'Due Today';
                      const remainingAmount = getInstallmentRemainingAmount(item);
                      const overdueDays = isOverdue ? getOverdueDays(item.dueDate) : 0;

                      return (
                        <tr
                          key={item.installmentNumber}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: isOverdue
                              ? '#fef2f2'
                              : isDueToday
                              ? '#fff7ed'
                              : 'transparent',
                            transition: 'background-color 0.15s',
                          }}
                        >
                          {/* No. */}
                          <td data-label="No." style={{ padding: '0.75rem 0.85rem', fontWeight: '700', color: '#0f172a' }}>
                            #{item.installmentNumber}
                          </td>

                          {/* Due Date (Red if overdue) */}
                          <td data-label="Due Date" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <div style={{
                              color: isOverdue ? '#dc2626' : isDueToday ? '#ea580c' : '#0f172a',
                              fontWeight: isOverdue ? '800' : isDueToday ? '700' : 'normal',
                            }}>
                              {formatIndianDate(item.dueDate)}
                            </div>
                            {isOverdue && (
                              <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: '700', marginTop: '0.1rem' }}>
                                ⚠️ {overdueDays} {overdueDays === 1 ? 'day' : 'days'} overdue
                              </div>
                            )}
                            {isDueToday && (
                              <div style={{ fontSize: '0.7rem', color: '#ea580c', fontWeight: '700', marginTop: '0.1rem' }}>
                                🔔 Due Today
                              </div>
                            )}
                          </td>

                          {/* Amount Due */}
                          <td data-label="Amount Due" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#0f172a', fontWeight: '700' }}>
                              {formatINR(item.amount)}
                            </span>
                          </td>

                          {/* Paid Amount */}
                          <td data-label="Paid Amount" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <span style={{ color: item.paidAmount > 0 ? '#059669' : '#64748b', fontWeight: '600' }}>
                              {formatINR(item.paidAmount || 0)}
                            </span>
                          </td>

                          {/* Remaining Amount */}
                          <td data-label="Remaining" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <strong style={{
                              color: isOverdue ? '#dc2626' : remainingAmount > 0 ? '#ea580c' : '#059669',
                              fontWeight: '800',
                            }}>
                              {formatINR(remainingAmount)}
                            </strong>
                          </td>

                          {/* Status Badge */}
                          <td data-label="Status" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              fontSize: '0.7rem',
                              fontWeight: '800',
                              backgroundColor: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}>
                              <span>{badge.icon}</span>
                              <span>{badge.label}</span>
                            </span>
                          </td>

                          {/* Admin Action: Manual Record Payment */}
                          {canRecordPayment && (
                            <td data-label="Action" style={{ padding: '0.75rem 0.85rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {!isPaid ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPaymentForInstallment(item.installmentNumber)}
                                  className="btn btn-success btn-sm"
                                  style={{
                                    padding: '0.3rem 0.65rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                  }}
                                >
                                  <span>💵</span> Pay
                                </button>
                              ) : (
                                <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: '700' }}>
                                  Fully Paid
                                </span>
                              )}
                            </td>
                          )}

                          {/* Member Action: Online Pay Now (UPI/Cards) */}
                          {canPayOnline && !canRecordPayment && (
                            <td data-label="Action" style={{ padding: '0.75rem 0.85rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {!isPaid ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOnlinePayment(item.installmentNumber)}
                                  className="btn btn-orange btn-sm"
                                  style={{
                                    padding: '0.35rem 0.8rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                  }}
                                >
                                  <span>⚡</span> Pay Now
                                </button>
                              ) : (
                                <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: '700' }}>
                                  ✓ Paid
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PAYMENT HISTORY */}
          {activeTab === 'history' && (
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              marginBottom: '1.5rem',
            }}>
              {loadingPayments ? (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 0.75rem' }}></div>
                  <p>Loading payment records...</p>
                </div>
              ) : payments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: '#64748b' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📜</div>
                  <h4 style={{ color: '#0f172a', margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: '700' }}>
                    No payments recorded yet
                  </h4>
                  <p style={{ fontSize: '0.825rem', margin: 0 }}>
                    When payments are collected for this installment plan, receipts will appear here.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="responsive-table" style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '0.85rem',
                  }}>
                    <thead>
                      <tr style={{
                        borderBottom: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backgroundColor: '#f8fafc',
                      }}>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Date</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Inst. #</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Amount</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Method</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Note</th>
                        <th style={{ padding: '0.75rem 0.85rem' }}>Recorded By</th>
                        <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                          }}
                        >
                          <td data-label="Date" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', color: '#0f172a' }}>
                            {formatIndianDate(p.paymentDate)}
                          </td>
                          <td data-label="Inst. #" style={{ padding: '0.75rem 0.85rem', fontWeight: '700', color: '#0f172a' }}>
                            #{p.installmentNumber}
                          </td>
                          <td data-label="Amount" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: '#059669' }}>{formatINR(p.amount)}</strong>
                          </td>
                          <td data-label="Method" style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '0.3rem',
                              backgroundColor: '#eff6ff',
                              color: '#1e40af',
                              border: '1px solid #bfdbfe',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                            }}>
                              {p.paymentMethod}
                            </span>
                          </td>
                          <td data-label="Note" style={{ padding: '0.75rem 0.85rem', color: '#475569', fontSize: '0.8rem' }}>
                            {p.note || '—'}
                          </td>
                          <td data-label="Recorded By" style={{ padding: '0.75rem 0.85rem', color: '#475569', fontSize: '0.8rem' }}>
                            {p.recordedBy || 'Admin'}
                          </td>
                          <td data-label="Action" style={{ padding: '0.75rem 0.85rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedPaymentForReceipt(p)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                              }}
                              title="View & Print Payment Receipt"
                            >
                              <span>🧾</span>
                              <span>Receipt</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontWeight: '700' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Record Payment Modal */}
      {paymentModalOpen && (
        <RecordPaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          plan={currentPlan}
          defaultInstallmentNumber={targetInstallmentNumber}
          onPaymentRecorded={handlePaymentSuccess}
        />
      )}

      {/* Embedded Payment Receipt Modal */}
      {selectedPaymentForReceipt && (
        <PaymentReceiptModal
          isOpen={Boolean(selectedPaymentForReceipt)}
          onClose={() => setSelectedPaymentForReceipt(null)}
          payment={selectedPaymentForReceipt}
          currentUser={null}
          isAdmin={true}
        />
      )}

      {/* Embedded Member Online Payment Modal */}
      {onlinePaymentModalOpen && (
        <OnlinePaymentModal
          isOpen={onlinePaymentModalOpen}
          onClose={() => setOnlinePaymentModalOpen(false)}
          plan={currentPlan}
          installmentNumber={onlineTargetInstNumber}
          onPaymentSuccess={handleOnlinePaymentSuccess}
        />
      )}
    </>
  );
};

export default InstallmentScheduleModal;
