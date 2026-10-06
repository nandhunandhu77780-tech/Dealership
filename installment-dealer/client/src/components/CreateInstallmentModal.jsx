import React, { useState, useEffect, useMemo } from 'react';
import {
  createInstallmentPlan,
  generateInstallmentSchedule,
  formatDateToISO,
  INSTALLMENT_FREQUENCIES
} from '../services/installmentService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';

const CreateInstallmentModal = ({ isOpen, onClose, order = null, onPlanCreated = null }) => {
  const [downPayment, setDownPayment] = useState('0');
  const [numberOfInstallments, setNumberOfInstallments] = useState('3');
  const [frequency, setFrequency] = useState('Monthly');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Set initial default date (1 month from today)
  useEffect(() => {
    if (isOpen) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      setFirstDueDate(formatDateToISO(nextMonth));
      setDownPayment('0');
      setNumberOfInstallments('3');
      setFrequency('Monthly');
      setErrorMessage('');
    }
  }, [isOpen, order]);

  // Calculations
  const totalAmount = order ? parseFloat(order.totalAmount) || 0 : 0;
  const dpNum = parseFloat(downPayment) || 0;
  const installmentsCount = parseInt(numberOfInstallments, 10) || 1;

  const remainingAmount = useMemo(() => {
    return parseFloat(Math.max(0, totalAmount - dpNum).toFixed(2));
  }, [totalAmount, dpNum]);

  const installmentAmount = useMemo(() => {
    if (installmentsCount <= 0 || remainingAmount <= 0) return 0;
    return parseFloat((remainingAmount / installmentsCount).toFixed(2));
  }, [remainingAmount, installmentsCount]);

  // Live schedule preview
  const schedulePreview = useMemo(() => {
    if (!firstDueDate || remainingAmount <= 0 || installmentsCount <= 0) return [];
    try {
      return generateInstallmentSchedule(
        remainingAmount,
        installmentsCount,
        frequency,
        firstDueDate
      );
    } catch {
      return [];
    }
  }, [remainingAmount, installmentsCount, frequency, firstDueDate]);

  if (!isOpen || !order) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (dpNum < 0) {
      setErrorMessage('Down payment cannot be negative.');
      return;
    }

    if (dpNum > totalAmount) {
      setErrorMessage(`Down payment cannot exceed total order amount (${formatINR(totalAmount)}).`);
      return;
    }

    if (installmentsCount < 1) {
      setErrorMessage('Number of installments must be at least 1.');
      return;
    }

    if (remainingAmount <= 0) {
      setErrorMessage('Remaining balance is 0. Down payment covers the entire order.');
      return;
    }

    if (!firstDueDate) {
      setErrorMessage('First due date is required.');
      return;
    }

    setLoading(true);
    try {
      const planPayload = {
        orderId: order.id,
        memberPhone: order.memberPhone || '',
        memberCode: order.memberCode || '',
        downPayment: dpNum,
        numberOfInstallments: installmentsCount,
        frequency,
        firstDueDate,
      };

      const createdPlan = await createInstallmentPlan(planPayload);
      if (onPlanCreated) {
        onPlanCreated(createdPlan);
      }
      onClose();
    } catch (err) {
      console.error('Failed to create installment plan:', err);
      setErrorMessage(sanitizeErrorMessage(err));
    } finally {
      setLoading(false);
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
      zIndex: 1100,
      padding: '1rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '620px',
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
              <span style={{ fontSize: '1.3rem' }}>➕</span>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                Create Installment Plan
              </h3>
            </div>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Configure installment financing for approved Order #{order.id.slice(0, 8)}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
            }}
          >
            &times;
          </button>
        </div>

        {/* Order Context Details */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.75rem',
          padding: '1rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          marginBottom: '1.25rem',
          fontSize: '0.85rem',
        }}>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Customer</span>
            <strong style={{ color: '#0a2540', fontSize: '0.95rem' }}>{order.memberName}</strong>
            {order.memberPhone ? (
              <span style={{ color: '#065f46', fontSize: '0.8rem', fontWeight: '800', display: 'block', marginTop: '0.15rem' }}>
                📞 {order.memberPhone}
              </span>
            ) : null}
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Product</span>
            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{order.productName}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Order Total</span>
            <strong style={{ color: '#047857', fontSize: '1.05rem' }}>{formatINR(order.totalAmount)}</strong>
          </div>
        </div>

        {errorMessage && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            fontWeight: '500',
          }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Down Payment & Remaining Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.4rem', fontWeight: '600' }}>
                Down Payment (₹) <span style={{ color: '#ea580c' }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                max={totalAmount}
                step="0.01"
                required
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#475569', marginBottom: '0.4rem', fontWeight: '600' }}>
                Remaining Amount
              </label>
              <div style={{
                padding: '0.65rem 0.85rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                color: '#1e3a8a',
                fontSize: '0.95rem',
                fontWeight: '800',
              }}>
                {formatINR(remainingAmount)}
              </div>
            </div>
          </div>

          {/* Number of Installments & Frequency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.4rem', fontWeight: '600' }}>
                Number of Installments <span style={{ color: '#ea580c' }}>*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={numberOfInstallments}
                onChange={(e) => setNumberOfInstallments(e.target.value)}
                placeholder="3"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.4rem', fontWeight: '600' }}>
                Frequency <span style={{ color: '#ea580c' }}>*</span>
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                {INSTALLMENT_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* First Due Date */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.4rem', fontWeight: '600' }}>
              First Due Date <span style={{ color: '#ea580c' }}>*</span>
            </label>
            <input
              type="date"
              required
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.9rem',
              }}
            />
          </div>

          {/* Calculated Installment Amount Callout */}
          <div style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '0.75rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#1e3a8a', fontWeight: '600', display: 'block' }}>Calculated Installment</span>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#047857' }}>
                {formatINR(installmentAmount)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#64748b' }}>/ {frequency === 'Weekly' ? 'week' : 'month'}</span>
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', color: '#1d4ed8', fontWeight: '700', backgroundColor: '#ffffff', padding: '0.3rem 0.65rem', borderRadius: '0.5rem', border: '1px solid #bfdbfe' }}>
              {installmentsCount} total installments
            </span>
          </div>

          {/* Live Schedule Preview */}
          {schedulePreview.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{
                fontSize: '0.75rem',
                color: '#64748b',
                display: 'block',
                marginBottom: '0.4rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: '700',
              }}>
                Schedule Preview (Exact Rounding)
              </span>
              <div style={{
                maxHeight: '160px',
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                backgroundColor: '#ffffff',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '700' }}>
                      <th style={{ padding: '0.5rem 0.75rem' }}>No.</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Due Date</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulePreview.map((item) => (
                      <tr key={item.installmentNumber} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', fontWeight: '600' }}>
                          #{item.installmentNumber}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#0f172a', fontWeight: '500' }}>
                          {formatIndianDate(item.dueDate)}
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '700', color: '#047857' }}>
                          {formatINR(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.65rem 1.25rem',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                borderRadius: '0.5rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.65rem 1.5rem',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
              }}
            >
              {loading && <span className="btn-spinner"></span>}
              {loading ? 'Creating Plan...' : 'Create Installment Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateInstallmentModal;
