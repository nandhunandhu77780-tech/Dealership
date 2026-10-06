import React, { useState, useEffect, useMemo } from 'react';
import { getAllPayments } from '../services/paymentService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';
import PaymentReceiptModal from './PaymentReceiptModal.jsx';

const AdminPaymentsList = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null);

  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllPayments();
      setPayments(data || []);
    } catch (err) {
      console.error('Failed to load payments audit:', err);
      setError(sanitizeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanPhone = q.replace(/\D/g, '');
    return payments.filter((p) => {
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
        (p.orderId && p.orderId.toLowerCase().includes(q)) ||
        (p.recordedBy && p.recordedBy.toLowerCase().includes(q));

      const matchesMethod =
        methodFilter === 'all' ||
        (p.paymentMethod || '').toLowerCase() === methodFilter.toLowerCase();

      return matchesSearch && matchesMethod;
    });
  }, [payments, searchQuery, methodFilter]);

  const totalCollected = useMemo(() => {
    return payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  }, [payments]);

  return (
    <section style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '1rem',
      padding: '1.75rem',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
            💵 Payment History & Collections
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
            Audit log of all manual and online payments recorded across customer installment plans
          </p>
        </div>

        <button
          type="button"
          onClick={loadPayments}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.55rem 0.95rem',
            borderRadius: '0.5rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            color: '#334155',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
            Total Receipts Recorded
          </span>
          <strong style={{ fontSize: '1.35rem', color: '#0a2540', fontWeight: '800' }}>
            {payments.length}
          </strong>
        </div>

        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
            Total Collections
          </span>
          <strong style={{ fontSize: '1.35rem', color: '#047857', fontWeight: '800' }}>
            {formatINR(totalCollected)}
          </strong>
        </div>
      </div>

      {/* Filter and Search */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.25rem',
        padding: '0.85rem 1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '0.75rem',
        border: '1px solid #e2e8f0',
      }}>
        <div style={{ flex: '1', minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Search by Name, Mobile Number, Member ID, Product, or Order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 0.85rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              color: '#0f172a',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['all', 'Cash', 'UPI', 'Bank Transfer', 'Other'].map((method) => {
            const isActive = methodFilter === method;
            return (
              <button
                key={method}
                type="button"
                onClick={() => setMethodFilter(method)}
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
                  transition: 'all 0.15s ease',
                }}
              >
                {method === 'all' ? 'All Methods' : method}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ margin: 0, fontWeight: '500' }}>Loading payment records...</p>
        </div>
      )}

      {/* Error Banner */}
      {error && !loading && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          color: '#b91c1c',
          marginBottom: '1rem',
          fontWeight: '500',
        }}>
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredPayments.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1rem',
          color: '#64748b',
          backgroundColor: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🧾</span>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: '#0a2540' }}>No payment records found.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filteredPayments.length > 0 && (
        <div className="table-container" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
          <table
            className="responsive-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}
          >
            <thead>
              <tr style={{
                backgroundColor: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                textAlign: 'left',
                color: '#475569',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: '700',
              }}>
                <th style={{ padding: '0.85rem 0.75rem' }}>Date</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Member</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Product & Order</th>
                <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>Inst #</th>
                <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Method</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Note</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Recorded By</th>
                <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((pay) => (
                <tr
                  key={pay.id}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                >
                  <td data-label="Date" style={{ padding: '0.85rem 0.75rem', color: '#475569', whiteSpace: 'nowrap', fontSize: '0.825rem' }}>
                    {formatIndianDate(pay.paymentDate || pay.createdAt)}
                  </td>
                  <td data-label="Member" style={{ padding: '0.85rem 0.75rem' }}>
                    <div style={{ fontWeight: '800', color: '#0a2540', fontSize: '0.925rem' }}>
                      {pay.memberName || 'Member'}
                    </div>
                    {pay.memberPhone ? (
                      <div style={{ marginTop: '0.2rem' }}>
                        <a
                          href={`tel:${pay.memberPhone}`}
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
                          <span>📞</span> {pay.memberPhone}
                        </a>
                      </div>
                    ) : null}
                    {pay.memberCode ? (
                      <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: '700', display: 'block', marginTop: '0.15rem' }}>
                        {pay.memberCode}
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Product & Order" style={{ padding: '0.85rem 0.75rem' }}>
                    <div style={{ color: '#0f172a', fontWeight: '600' }}>{pay.productName || 'Product'}</div>
                    {pay.orderId && (
                      <code style={{ fontSize: '0.725rem', color: '#ea580c', fontWeight: '600' }}>
                        #{pay.orderId.slice(0, 8)}
                      </code>
                    )}
                  </td>
                  <td data-label="Inst #" style={{ padding: '0.85rem 0.75rem', textAlign: 'center', fontWeight: '700', color: '#0a2540' }}>
                    {pay.installmentNumber ? `#${pay.installmentNumber}` : '-'}
                  </td>
                  <td data-label="Amount" style={{ padding: '0.85rem 0.75rem', textAlign: 'right', fontWeight: '800', color: '#047857', fontSize: '0.95rem' }}>
                    {formatINR(pay.amount)}
                  </td>
                  <td data-label="Method" style={{ padding: '0.85rem 0.75rem' }}>
                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '0.35rem',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                    }}>
                      {pay.paymentMethod || 'Cash'}
                    </span>
                  </td>
                  <td data-label="Note" style={{ padding: '0.85rem 0.75rem', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.825rem' }}>
                    {pay.note || '-'}
                  </td>
                  <td data-label="Recorded By" style={{ padding: '0.85rem 0.75rem', color: '#475569', fontSize: '0.8rem' }}>
                    {pay.recordedBy || 'Admin'}
                  </td>
                  <td data-label="Action" style={{ padding: '0.85rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentForReceipt(pay)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        color: '#1d4ed8',
                        borderRadius: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        transition: 'all 0.15s ease',
                      }}
                      title="View and Print Payment Receipt"
                    >
                      <span>🧾</span>
                      <span>View Receipt</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Receipt Modal */}
      {selectedPaymentForReceipt && (
        <PaymentReceiptModal
          isOpen={Boolean(selectedPaymentForReceipt)}
          onClose={() => setSelectedPaymentForReceipt(null)}
          payment={selectedPaymentForReceipt}
          isAdmin={true}
        />
      )}
    </section>
  );
};

export default AdminPaymentsList;
