import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import MemberNavbar from '../components/MemberNavbar.jsx';
import { getPaymentsByMember } from '../services/paymentService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';
import PaymentReceiptModal from '../components/PaymentReceiptModal.jsx';

const MemberPaymentsPage = () => {
  const { currentUser } = useAuth();

  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null);

  // Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');

  const loadPayments = async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPaymentsByMember(currentUser.uid);
      setPayments(data || []);
    } catch (err) {
      console.error('Failed to load member payments:', err);
      setError(sanitizeErrorMessage(err, 'Unable to load payment history. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [currentUser?.uid]);

  // Filter payments
  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments.filter((p) => {
      const matchesSearch =
        !q ||
        (p.productName && p.productName.toLowerCase().includes(q)) ||
        (p.paymentMethod && p.paymentMethod.toLowerCase().includes(q)) ||
        (p.note && p.note.toLowerCase().includes(q));

      const matchesMethod = methodFilter === 'all' || p.paymentMethod === methodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [payments, searchQuery, methodFilter]);

  // Summary Metrics
  const totalPaidAmount = useMemo(() => {
    return payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  }, [payments]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Unified Member Navigation */}
      <MemberNavbar activePage="payments" />

      {/* Main Container */}
      <main className="container" style={{ maxWidth: '1150px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Title & Description */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
                Payment History
              </h1>
              <span style={{
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: '700',
              }}>
                {payments.length} {payments.length === 1 ? 'receipt' : 'receipts'}
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
              Audit receipts of all installment payments recorded by NANDANAM Agencies
            </p>
          </div>

          <button
            type="button"
            onClick={loadPayments}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.55rem 0.95rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              color: '#334155',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Summary Metrics Banner */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
              Payments Recorded
            </span>
            <strong style={{ fontSize: '1.5rem', color: '#0a2540', fontWeight: '800' }}>
              {payments.length}
            </strong>
          </div>

          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
              Total Amount Paid
            </span>
            <strong style={{ fontSize: '1.5rem', color: '#047857', fontWeight: '800' }}>
              {formatINR(totalPaidAmount)}
            </strong>
          </div>
        </div>

        {/* Search and Filter */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
          backgroundColor: '#ffffff',
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
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
              placeholder="Search by product, method, or note..."
              style={{
                width: '100%',
                padding: '0.6rem 2rem 0.6rem 2.4rem',
                backgroundColor: '#f8fafc',
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
                  fontSize: '1.1rem',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            )}
          </div>

          {/* Payment Method Filter */}
          <div style={{ flex: '0 1 200px', minWidth: '150px' }}>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
            <p style={{ margin: 0, fontWeight: '500' }}>Loading payment receipts...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.75rem',
            padding: '2rem',
            textAlign: 'center',
            marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
            <h3 style={{ color: '#b91c1c', fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.4rem' }}>Failed to Load Payments</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1rem' }}>{error}</p>
            <button
              type="button"
              onClick={loadPayments}
              style={{
                padding: '0.5rem 1.25rem',
                backgroundColor: '#ea580c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredPayments.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3.5rem 1rem',
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            border: '1px dashed #cbd5e1',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📜</div>
            <h3 style={{ color: '#0a2540', fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.4rem' }}>
              {searchQuery || methodFilter !== 'all'
                ? 'No matching payment records found'
                : 'No payment records yet'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 auto 1.25rem', maxWidth: '420px', lineHeight: 1.5 }}>
              {searchQuery || methodFilter !== 'all'
                ? 'Try resetting your search filter.'
                : 'When NANDANAM Agencies collects an installment payment and records it in the system, your receipt will appear here.'}
            </p>
            {searchQuery || methodFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setMethodFilter('all');
                }}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Reset Filters
              </button>
            ) : (
              <Link
                to="/member/installments"
                style={{
                  display: 'inline-flex',
                  padding: '0.65rem 1.5rem',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  borderRadius: '0.5rem',
                  fontWeight: '700',
                  textDecoration: 'none',
                  boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                }}
              >
                View My Installment Plans &rarr;
              </Link>
            )}
          </div>
        )}

        {/* Payments Table */}
        {!loading && !error && filteredPayments.length > 0 && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            marginBottom: '3rem',
          }}>
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
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
                    <th style={{ padding: '0.85rem 0.75rem' }}>Payment Date</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Product</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>Installment</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Amount Paid</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Method</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Note</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      {/* Payment Date */}
                      <td data-label="Date" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#475569', fontSize: '0.825rem' }}>
                        {formatIndianDate(p.paymentDate, true)}
                      </td>

                      {/* Product Name */}
                      <td data-label="Product" style={{ padding: '0.85rem 0.75rem' }}>
                        <strong style={{ color: '#0a2540' }}>
                          {p.productName}
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                          Order #{p.orderId ? p.orderId.slice(0, 8) : 'N/A'}
                        </div>
                      </td>

                      {/* Installment Number */}
                      <td data-label="Installment" style={{ padding: '0.85rem 0.75rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.3rem',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          color: '#0a2540',
                        }}>
                          {p.installmentNumber ? `#${p.installmentNumber}` : '-'}
                        </span>
                      </td>

                      {/* Amount Paid */}
                      <td data-label="Amount Paid" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: '#047857', fontSize: '1rem', fontWeight: '800' }}>
                          {formatINR(p.amount)}
                        </strong>
                      </td>

                      {/* Payment Method */}
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
                          {p.paymentMethod || 'Cash'}
                        </span>
                      </td>

                      {/* Note */}
                      <td data-label="Note" style={{ padding: '0.85rem 0.75rem', color: '#64748b', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.825rem' }}>
                        {p.note || '-'}
                      </td>

                      {/* Action: View Receipt */}
                      <td data-label="Action" style={{ padding: '0.85rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentForReceipt(p)}
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
                          <span>Receipt</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Payment Receipt Modal */}
      {selectedPaymentForReceipt && (
        <PaymentReceiptModal
          isOpen={Boolean(selectedPaymentForReceipt)}
          onClose={() => setSelectedPaymentForReceipt(null)}
          payment={selectedPaymentForReceipt}
          currentUser={currentUser}
          isAdmin={false}
        />
      )}
    </div>
  );
};

export default MemberPaymentsPage;
