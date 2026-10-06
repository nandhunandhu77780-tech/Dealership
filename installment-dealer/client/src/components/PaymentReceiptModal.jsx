import React, { useState, useEffect } from 'react';
import { getReceiptDetails } from '../services/receiptService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';

const PaymentReceiptModal = ({
  isOpen,
  onClose,
  payment = null,
  currentUser = null,
  isAdmin = false,
}) => {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchDetails = async () => {
      if (!isOpen || !payment) return;
      setLoading(true);
      setError(null);

      try {
        const details = await getReceiptDetails(payment, currentUser, isAdmin);
        if (isMounted) {
          setReceipt(details);
        }
      } catch (err) {
        console.error('Failed to load receipt details:', err);
        if (isMounted) {
          setError(sanitizeErrorMessage(err, 'Unable to load payment receipt.'));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, payment, currentUser, isAdmin]);

  if (!isOpen || !payment) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="receipt-modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300,
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <div
        className="receipt-modal-card"
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94vh',
        }}
      >
        {/* Modal Top Control Bar (Screen only, hidden in print) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🧾</span>
            <span style={{ fontWeight: '800', color: '#0a2540', fontSize: '1.05rem' }}>
              Payment Receipt
            </span>
            {receipt && (
              <code style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: '700', marginLeft: '0.25rem' }}>
                {receipt.receiptNumber}
              </code>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {receipt && !loading && !error && (
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.95rem',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                }}
              >
                <span>🖨️</span>
                <span>Print Receipt</span>
              </button>
            )}

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
              title="Close modal"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div style={{ overflowY: 'auto', padding: '1.25rem', backgroundColor: '#f8fafc' }}>
          {/* Loading State */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '500' }}>Generating official receipt from Firestore...</p>
            </div>
          )}

          {/* Error / Unauthorized State */}
          {error && !loading && (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem 1.5rem',
                backgroundColor: '#fef2f2',
                borderRadius: '0.75rem',
                border: '1px solid #fecaca',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
              <h4 style={{ color: '#b91c1c', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: '700' }}>
                Receipt Unavailable
              </h4>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 auto 1.25rem', maxWidth: '440px' }}>
                {error}
              </p>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          )}

          {/* Printable Official Receipt Body */}
          {receipt && !loading && !error && (
            <div
              id="printable-receipt-card"
              className="printable-receipt-card"
              style={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                borderRadius: '0.75rem',
                padding: '2rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              {/* Receipt Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '2px solid #0a2540',
                  paddingBottom: '1.25rem',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <img
                      src="/logo.png"
                      alt="NANDANAM Agencies Logo"
                      style={{
                        height: '48px',
                        width: 'auto',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                    <div>
                      <h1
                        style={{
                          fontSize: '1.5rem',
                          fontWeight: '800',
                          color: '#0a2540',
                          margin: 0,
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {receipt.businessName || 'NANDANAM Agencies'}
                      </h1>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: '0.825rem',
                      color: '#ea580c',
                      margin: '0.25rem 0 0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: '700',
                    }}
                  >
                    Official Installment Payment Receipt
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.65rem',
                      backgroundColor: '#ecfdf5',
                      border: '1px solid #10b981',
                      borderRadius: '9999px',
                      color: '#047857',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      marginBottom: '0.35rem',
                    }}
                  >
                    ✓ {receipt.status}
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#475569', fontWeight: '500' }}>
                    Receipt No: <strong style={{ color: '#0a2540' }}>{receipt.receiptNumber}</strong>
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#475569' }}>
                    Date: <strong style={{ color: '#0a2540' }}>{formatIndianDate(receipt.paymentDate)}</strong>
                  </div>
                </div>
              </div>

              {/* Customer & Transaction Two-Column Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '1rem',
                  padding: '1rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                }}
              >
                {/* Column 1: Customer Details */}
                <div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'block',
                      marginBottom: '0.4rem',
                    }}
                  >
                    Customer / Payer Details
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0a2540' }}>
                    {receipt.memberName}
                  </div>
                  <div style={{ color: '#065f46', fontWeight: '800', marginTop: '0.25rem', fontSize: '0.95rem' }}>
                    📞 {receipt.phone}
                  </div>
                  <div style={{ color: '#475569', marginTop: '0.2rem', fontSize: '0.85rem' }}>
                    Member ID: <code style={{ color: '#ea580c', fontWeight: '700' }}>{receipt.memberId}</code>
                  </div>
                  {receipt.email && (
                    <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                      Email: {receipt.email}
                    </div>
                  )}
                </div>

                {/* Column 2: Order & Collector Details */}
                <div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      display: 'block',
                      marginBottom: '0.4rem',
                    }}
                  >
                    Transaction Meta
                  </span>
                  <div style={{ color: '#475569' }}>
                    Order Reference: <strong style={{ color: '#0a2540' }}>#{receipt.orderId}</strong>
                  </div>
                  <div style={{ color: '#475569', marginTop: '0.2rem' }}>
                    Payment Method:{' '}
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '0.25rem',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        fontWeight: '700',
                        fontSize: '0.75rem',
                      }}
                    >
                      {receipt.paymentMethod}
                    </span>
                  </div>
                  <div style={{ color: '#475569', marginTop: '0.2rem' }}>
                    Recorded By: <strong style={{ color: '#0f172a' }}>{receipt.recordedBy}</strong>
                  </div>
                  {receipt.transactionId && (
                    <div style={{ color: '#475569', marginTop: '0.2rem' }}>
                      Txn Ref: <code style={{ color: '#ea580c', fontSize: '0.8rem', backgroundColor: '#fff7ed', padding: '0.1rem 0.35rem', borderRadius: '0.25rem', fontWeight: '600' }}>{receipt.transactionId}</code>
                    </div>
                  )}
                  <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    Financing Plan: <strong>{receipt.frequency}</strong> ({receipt.totalInstallments} Installments)
                  </div>
                </div>
              </div>

              {/* Line Items Breakdown Table */}
              <div style={{ marginBottom: '1.25rem', overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.85rem',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: '#f1f5f9',
                        borderBottom: '2px solid #cbd5e1',
                        color: '#334155',
                        fontWeight: '700',
                      }}
                    >
                      <th style={{ padding: '0.65rem 0.75rem' }}>Description</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Installment</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Due Amount</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <strong style={{ color: '#0a2540', display: 'block' }}>{receipt.productName}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Installment payment collected towards financing account
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: '#334155' }}>
                        #{receipt.installmentNumber} of {receipt.totalInstallments}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#475569' }}>
                        {formatINR(receipt.totalInstallmentAmount)}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '800', color: '#047857', fontSize: '0.95rem' }}>
                        {formatINR(receipt.amountPaid)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Total Calculation & Balance Summary */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '1.5rem',
                  padding: '1rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ flex: '1 1 200px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>
                    Payment Notes / Reference:
                  </span>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#334155', fontStyle: receipt.note ? 'normal' : 'italic' }}>
                    {receipt.note || 'No additional transaction notes provided.'}
                  </p>
                </div>

                <div style={{ minWidth: '220px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.85rem', color: '#475569' }}>
                    <span>Amount Paid (This Receipt):</span>
                    <strong style={{ color: '#047857', fontSize: '1.05rem' }}>{formatINR(receipt.amountPaid)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.85rem', color: '#475569' }}>
                    <span>Total Plan Amount:</span>
                    <span>{formatINR(receipt.totalPlanAmount)}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', fontSize: '0.85rem', color: '#475569' }}>
                    <span>Total Plan Paid So Far:</span>
                    <span>{formatINR(receipt.planTotalPaid)}</span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.5rem 0 0',
                      borderTop: '1px solid #cbd5e1',
                      marginTop: '0.35rem',
                      fontSize: '0.95rem',
                    }}
                  >
                    <span style={{ fontWeight: '700', color: '#0a2540' }}>Remaining Balance:</span>
                    <strong style={{ color: receipt.remainingBalance > 0 ? '#ea580c' : '#047857', fontSize: '1rem', fontWeight: '800' }}>
                      {formatINR(receipt.remainingBalance)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Receipt Footer & Signatures */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  borderTop: '1px dashed #cbd5e1',
                  paddingTop: '1.25rem',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  flexWrap: 'wrap',
                  gap: '1.5rem',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: '700', color: '#0a2540' }}>
                    Thank you for your prompt installment payment!
                  </p>
                  <p style={{ margin: '0.2rem 0 0' }}>
                    This is a computer-generated receipt issued by NANDANAM Agencies.
                  </p>
                  <p style={{ margin: '0.2rem 0 0' }}>
                    Printed on: {formatIndianDate(new Date())}
                  </p>
                </div>

                <div style={{ textAlign: 'center', minWidth: '180px' }}>
                  <div style={{ borderBottom: '1px solid #94a3b8', height: '30px', marginBottom: '0.3rem' }} />
                  <span style={{ fontWeight: '600', color: '#334155' }}>Authorized Signature / Seal</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls (Screen only, hidden in print) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#475569',
              borderRadius: '0.5rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Close
          </button>

          {receipt && !loading && !error && (
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1.4rem',
                fontSize: '0.875rem',
                fontWeight: '700',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
              }}
            >
              <span>🖨️</span>
              <span>Print Receipt</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentReceiptModal;
