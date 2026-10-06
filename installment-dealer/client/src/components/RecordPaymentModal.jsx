import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  recordInstallmentPayment,
  formatDateToISO,
  PAYMENT_METHODS
} from '../services/paymentService.js';
import { logAdminActivity, ACTION_TYPES } from '../services/activityLogService.js';
import {
  formatINR,
  formatIndianDate,
  sanitizeErrorMessage,
  getInstallmentStatus,
  getInstallmentRemainingAmount
} from '../utils/formatters.js';

const RecordPaymentModal = ({
  isOpen,
  onClose,
  plan = null,
  defaultInstallmentNumber = null,
  onPaymentRecorded = null,
}) => {
  const { currentUser, userProfile } = useAuth();

  const [selectedInstallmentNumber, setSelectedInstallmentNumber] = useState(1);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(formatDateToISO(new Date()));
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Schedule list from plan
  const schedule = useMemo(() => {
    return Array.isArray(plan?.schedule) ? plan.schedule : [];
  }, [plan]);

  // Set default installment when modal opens
  useEffect(() => {
    if (isOpen && plan) {
      setPaymentDate(formatDateToISO(new Date()));
      setPaymentMethod('Cash');
      setNote('');
      setErrorMessage('');
      setSuccessMessage('');
      setSubmitting(false);

      if (defaultInstallmentNumber && schedule.some((s) => s.installmentNumber === Number(defaultInstallmentNumber))) {
        setSelectedInstallmentNumber(Number(defaultInstallmentNumber));
      } else {
        // Find first unpaid installment
        const firstUnpaid = schedule.find((s) => getInstallmentRemainingAmount(s) > 0);
        if (firstUnpaid) {
          setSelectedInstallmentNumber(firstUnpaid.installmentNumber);
        } else if (schedule.length > 0) {
          setSelectedInstallmentNumber(schedule[0].installmentNumber);
        }
      }
    }
  }, [isOpen, plan, defaultInstallmentNumber, schedule]);

  // Current selected installment details
  const selectedItem = useMemo(() => {
    return schedule.find((s) => s.installmentNumber === Number(selectedInstallmentNumber)) || null;
  }, [schedule, selectedInstallmentNumber]);

  const dueAmount = selectedItem ? parseFloat(selectedItem.amount) || 0 : 0;
  const alreadyPaidAmount = selectedItem ? parseFloat(selectedItem.paidAmount) || 0 : 0;
  const remainingAmount = parseFloat(Math.max(0, dueAmount - alreadyPaidAmount).toFixed(2));

  // Auto-fill full remaining amount when installment changes
  useEffect(() => {
    if (remainingAmount > 0) {
      setPaymentAmount(remainingAmount.toString());
    } else {
      setPaymentAmount('0');
    }
  }, [remainingAmount, selectedInstallmentNumber]);

  if (!isOpen || !plan) return null;

  const handlePayFull = () => {
    setPaymentAmount(remainingAmount.toFixed(2));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (submitting) return;

    const amountNum = parseFloat(paymentAmount);

    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage('Payment amount must be greater than 0.');
      return;
    }

    if (amountNum > remainingAmount + 0.001) {
      setErrorMessage(
        `Payment amount (${formatINR(amountNum)}) cannot exceed the remaining amount for Installment #${selectedInstallmentNumber} (${formatINR(remainingAmount)}).`
      );
      return;
    }

    if (!paymentDate) {
      setErrorMessage('Payment date is required.');
      return;
    }

    setSubmitting(true);

    try {
      const adminName =
        userProfile?.name || currentUser?.displayName || currentUser?.email || 'Admin';

      const result = await recordInstallmentPayment({
        installmentPlanId: plan.id,
        installmentNumber: selectedInstallmentNumber,
        amount: amountNum,
        paymentDate,
        paymentMethod,
        note,
        recordedBy: adminName,
        memberPhone: plan.memberPhone || '',
        memberCode: plan.memberCode || '',
      });

      setSuccessMessage(
        `Payment of ${formatINR(amountNum)} recorded successfully for Installment #${selectedInstallmentNumber}!`
      );

      logAdminActivity({
        action: `Recorded Payment of ${formatINR(amountNum)}`,
        actionType: ACTION_TYPES.PAYMENT_RECORDED,
        adminId: currentUser?.uid || '',
        adminName,
        adminEmail: userProfile?.email || currentUser?.email || '',
        targetType: 'payment',
        targetId: result.paymentId,
        paymentId: result.paymentId,
        planId: plan.id,
        orderId: plan.orderId || '',
        memberId: plan.memberId || '',
        memberCode: plan.memberCode || '',
        memberName: plan.memberName || '',
        memberPhone: plan.memberPhone || '',
        productName: plan.productName || '',
        amount: amountNum,
        status: result.updatedPlan?.status || 'Active',
        details: `Recorded ${paymentMethod} payment of ${formatINR(amountNum)} for Installment #${selectedInstallmentNumber} (${plan.productName})`,
      });

      setTimeout(() => {
        if (onPaymentRecorded) {
          onPaymentRecorded(result.payment, result.updatedPlan);
        }
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to record payment:', err);
      setErrorMessage(sanitizeErrorMessage(err));
      setSubmitting(false);
    }
  };

  return (
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
      zIndex: 1200,
      padding: '1rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        maxHeight: '92vh',
        overflowY: 'auto',
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.3rem' }}>💵</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                Record Installment Payment
              </h3>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
              Record a manual offline payment collected by NANDANAM Agencies
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
            }}
          >
            &times;
          </button>
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            color: '#b91c1c',
            fontSize: '0.85rem',
            marginBottom: '1rem',
            fontWeight: '500',
          }}>
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '0.5rem',
            color: '#047857',
            fontSize: '0.85rem',
            marginBottom: '1rem',
            fontWeight: '600',
          }}>
            {successMessage}
          </div>
        )}

        {/* Customer & Plan Context */}
        <div style={{
          backgroundColor: '#eff6ff',
          padding: '1rem',
          borderRadius: '0.75rem',
          border: '1px solid #bfdbfe',
          marginBottom: '1.25rem',
          fontSize: '0.85rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <div>
              <span style={{ color: '#1e40af', fontSize: '0.72rem', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer Name</span>
              <strong style={{ color: '#0a2540', fontSize: '1rem', fontWeight: '700' }}>{plan.memberName}</strong>
              {plan.memberCode && (
                <div style={{ fontSize: '0.72rem', color: '#4338ca', fontWeight: '600', marginTop: '0.15rem' }}>
                  ID: {plan.memberCode}
                </div>
              )}
            </div>

            <div>
              <span style={{ color: '#1e40af', fontSize: '0.72rem', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mobile Number</span>
              {plan.memberPhone ? (
                <a
                  href={`tel:${plan.memberPhone}`}
                  style={{
                    color: '#0284c7',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                  title="Click to call customer"
                >
                  📞 {plan.memberPhone}
                </a>
              ) : (
                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not provided</span>
              )}
            </div>

            <div>
              <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Order ID</span>
              <code style={{ color: '#ea580c', fontWeight: '600' }}>#{plan.orderId ? plan.orderId.slice(0, 8) : 'N/A'}</code>
            </div>

            <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Product</span>
              <strong style={{ color: '#0f172a' }}>{plan.productName}</strong>
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <form onSubmit={handleSubmit}>
          {/* Installment Selector */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.825rem', color: '#0f172a', fontWeight: '600', marginBottom: '0.35rem' }}>
              Select Installment <span style={{ color: '#ea580c' }}>*</span>
            </label>
            <select
              value={selectedInstallmentNumber}
              onChange={(e) => setSelectedInstallmentNumber(Number(e.target.value))}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.875rem',
              }}
            >
              {schedule.map((item) => {
                const dynamicStatus = getInstallmentStatus(item);
                const itemRem = getInstallmentRemainingAmount(item);
                return (
                  <option key={item.installmentNumber} value={item.installmentNumber}>
                    Installment #{item.installmentNumber} (Due: {formatIndianDate(item.dueDate)}) — {formatINR(item.amount)} [Status: {dynamicStatus}, Bal: {formatINR(itemRem)}]
                  </option>
                );
              })}
            </select>
          </div>

          {/* Installment Due, Already Paid, and Remaining Breakdown */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            padding: '0.85rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '0.75rem',
            marginBottom: '1.25rem',
            textAlign: 'center',
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#1e3a8a', fontWeight: '600', display: 'block' }}>Due Amount</span>
              <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{formatINR(dueAmount)}</strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#1e3a8a', fontWeight: '600', display: 'block' }}>Already Paid</span>
              <strong style={{ fontSize: '0.95rem', color: '#047857' }}>{formatINR(alreadyPaidAmount)}</strong>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: '#1e3a8a', fontWeight: '600', display: 'block' }}>Remaining</span>
              <strong style={{ fontSize: '0.95rem', color: remainingAmount > 0 ? '#ea580c' : '#047857' }}>
                {formatINR(remainingAmount)}
              </strong>
            </div>
          </div>

          {/* Payment Amount Input */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.825rem', color: '#0f172a', fontWeight: '600' }}>
                Payment Amount (₹) <span style={{ color: '#ea580c' }}>*</span>
              </label>
              {remainingAmount > 0 && (
                <button
                  type="button"
                  onClick={handlePayFull}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ea580c',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Pay Full Remaining ({formatINR(remainingAmount)})
                </button>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remainingAmount}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              disabled={submitting || remainingAmount <= 0}
              placeholder="Enter amount collected..."
              required
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.95rem',
                fontWeight: '700',
              }}
            />
          </div>

          {/* Payment Date & Payment Method */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', color: '#0f172a', fontWeight: '600', marginBottom: '0.35rem' }}>
                Payment Date <span style={{ color: '#ea580c' }}>*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={submitting}
                required
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  color: '#0f172a',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', color: '#0f172a', fontWeight: '600', marginBottom: '0.35rem' }}>
                Payment Method <span style={{ color: '#ea580c' }}>*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  color: '#0f172a',
                  fontSize: '0.875rem',
                }}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Note */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.825rem', color: '#475569', fontWeight: '500', marginBottom: '0.35rem' }}>
              Optional Note / Transaction Reference
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              placeholder="e.g. Cash collected in office, receipt #1234"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.875rem',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '0.65rem 1.25rem',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                borderRadius: '0.5rem',
                fontWeight: '600',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || remainingAmount <= 0}
              style={{
                padding: '0.65rem 1.5rem',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: '700',
                cursor: submitting || remainingAmount <= 0 ? 'not-allowed' : 'pointer',
                opacity: submitting || remainingAmount <= 0 ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
              }}
            >
              {submitting && <span className="btn-spinner"></span>}
              {submitting ? 'Recording Payment...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecordPaymentModal;
