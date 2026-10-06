import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import MemberNavbar from '../components/MemberNavbar.jsx';
import { getOrdersByMember, getNormalizedDeliveryStatus } from '../services/orderService.js';
import DeliveryTimeline, { SimpleDeliveryTimeline } from '../components/DeliveryTimeline.jsx';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';

const MyOrdersPage = () => {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const queryOrderId = searchParams.get('orderId');

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Order for Details Modal
  const [selectedOrder, setSelectedOrder] = useState(null);

  const loadMemberOrders = async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrdersByMember(currentUser.uid);
      setOrders(data);
    } catch (err) {
      console.error('Failed to load member orders:', err);
      setError(sanitizeErrorMessage(err, 'Unable to load orders. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemberOrders();
  }, [currentUser?.uid]);

  // Automatically open Order Details modal if query parameter ?orderId=... is in URL
  useEffect(() => {
    if (queryOrderId && orders.length > 0) {
      const match = orders.find(
        (o) => o.id === queryOrderId || (o.id && o.id.startsWith(queryOrderId))
      );
      if (match) {
        setSelectedOrder(match);
      }
    }
  }, [queryOrderId, orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesSearch =
        !q ||
        (o.productName && o.productName.toLowerCase().includes(q)) ||
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.deliveryStatus && o.deliveryStatus.toLowerCase().includes(q)) ||
        (o.expectedDeliveryDate && o.expectedDeliveryDate.includes(q)) ||
        (o.deliveryNote && o.deliveryNote.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'all' ||
        (o.status || '').toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'approved':
        return {
          bg: '#eff6ff',
          color: '#1d4ed8',
          border: '#bfdbfe',
          label: 'Approved',
          icon: '✓',
        };
      case 'completed':
        return {
          bg: '#ecfdf5',
          color: '#047857',
          border: '#a7f3d0',
          label: 'Completed',
          icon: '★',
        };
      case 'rejected':
        return {
          bg: '#fef2f2',
          color: '#b91c1c',
          border: '#fecaca',
          label: 'Rejected',
          icon: '✕',
        };
      case 'pending':
      default:
        return {
          bg: '#fff7ed',
          color: '#c2410c',
          border: '#fed7aa',
          label: 'Pending',
          icon: '⏳',
        };
    }
  };

  const getDeliveryStatusBadge = (status) => {
    switch (status) {
      case 'Delivered':
        return {
          bg: '#ecfdf5',
          color: '#047857',
          border: '#a7f3d0',
          label: 'Delivered',
          icon: '🏠',
        };
      case 'Out for Delivery':
        return {
          bg: '#f5f3ff',
          color: '#6d28d9',
          border: '#ddd6fe',
          label: 'Out for Delivery',
          icon: '🚚',
        };
      case 'Preparing':
        return {
          bg: '#fff7ed',
          color: '#ea580c',
          border: '#fed7aa',
          label: 'Preparing',
          icon: '📦',
        };
      case 'Approved':
        return {
          bg: '#eff6ff',
          color: '#0284c7',
          border: '#bae6fd',
          label: 'Approved',
          icon: '✓',
        };
      case 'Order Placed':
      default:
        return {
          bg: '#f8fafc',
          color: '#334155',
          border: '#cbd5e1',
          label: 'Order Placed',
          icon: '📝',
        };
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Unified Navigation */}
      <MemberNavbar activePage="orders" />

      {/* Main Container */}
      <main className="container" style={{ maxWidth: '1150px', margin: '0 auto', padding: '2rem 1.5rem' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
                My Orders
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
                {orders.length} {orders.length === 1 ? 'order' : 'orders'}
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', marginBottom: 0 }}>
              Track the status of your installment requests and submitted orders
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={loadMemberOrders}
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
            <Link
              to="/member/products"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.55rem 1.15rem',
                backgroundColor: '#ea580c',
                border: 'none',
                borderRadius: '0.5rem',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: '700',
                textDecoration: 'none',
                boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
              }}
            >
              <span>+</span>
              <span>New Order</span>
            </Link>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}>
          {/* Search */}
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
              placeholder="Search by product or order ID..."
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

          {/* Status Filters */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {['all', 'pending', 'approved', 'completed', 'rejected'].map((st) => {
              const isActive = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '0.45rem 0.85rem',
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
        {loading && (
          <div style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
            <p style={{ margin: 0, fontWeight: '500' }}>Loading your orders...</p>
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
            <h3 style={{ color: '#b91c1c', fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.4rem' }}>Failed to Load Orders</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1rem' }}>{error}</p>
            <button
              type="button"
              onClick={loadMemberOrders}
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
        {!loading && !error && filteredOrders.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '3.5rem 1rem',
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            border: '1px dashed #cbd5e1',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📋</div>
            <h3 style={{ color: '#0a2540', fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.4rem' }}>
              {searchQuery || statusFilter !== 'all' ? 'No matching orders found' : 'No orders placed yet'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 auto 1.25rem', maxWidth: '420px', lineHeight: 1.5 }}>
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Browse our catalog and request an installment purchase on available products.'}
            </p>
            {searchQuery || statusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
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
                to="/member/products"
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
                Explore Catalog &rarr;
              </Link>
            )}
          </div>
        )}

        {/* Orders Table */}
        {!loading && !error && filteredOrders.length > 0 && (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
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
                    <th style={{ padding: '0.85rem 0.75rem' }}>Order ID</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Product</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Qty</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Total Amount</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Date</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Order Status</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Delivery Status</th>
                    <th style={{ padding: '0.85rem 0.75rem' }}>Expected Delivery</th>
                    <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const badge = getStatusBadge(order.status);
                    const delStatus = getNormalizedDeliveryStatus(order);
                    const dBadge = getDeliveryStatusBadge(delStatus);

                    return (
                      <tr
                        key={order.id}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                      >
                        {/* Order ID */}
                        <td data-label="Order ID" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <code style={{
                            color: '#ea580c',
                            fontSize: '0.825rem',
                            backgroundColor: '#fff7ed',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.3rem',
                            border: '1px solid #fed7aa',
                            fontWeight: '700',
                          }}>
                            #{order.id ? order.id.slice(0, 8) : 'N/A'}
                          </code>
                        </td>

                        {/* Product Name */}
                        <td data-label="Product" style={{ padding: '0.85rem 0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '0.4rem',
                              backgroundColor: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}>
                              {order.productImageURL ? (
                                <img
                                  src={order.productImageURL}
                                  alt={order.productName}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    if (e.target.parentElement) e.target.parentElement.innerHTML = '📦';
                                  }}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ fontSize: '1.1rem', opacity: 0.6 }}>📦</span>
                              )}
                            </div>
                            <div style={{ fontWeight: '700', color: '#0a2540' }}>
                              {order.productName}
                            </div>
                          </div>
                        </td>

                        {/* Quantity */}
                        <td data-label="Quantity" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#0f172a', fontWeight: '600' }}>
                            {order.quantity}
                          </span>
                        </td>

                        {/* Total Amount */}
                        <td data-label="Total Amount" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: '#047857', fontWeight: '800' }}>
                            {formatINR(order.totalAmount)}
                          </strong>
                        </td>

                        {/* Date */}
                        <td data-label="Date" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#475569', fontSize: '0.825rem' }}>
                          {formatIndianDate(order.createdAt, true)}
                        </td>

                        {/* Order Status */}
                        <td data-label="Order Status" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
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

                        {/* Delivery Status */}
                        <td data-label="Delivery Status" style={{ padding: '0.85rem 0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                backgroundColor: dBadge.bg,
                                color: dBadge.color,
                                border: `1px solid ${dBadge.border}`,
                              }}>
                                <span>{dBadge.icon}</span>
                                <span>{delStatus}</span>
                              </span>
                              {order.deliveryNote && (
                                <span title={`Note: ${order.deliveryNote}`} style={{ fontSize: '0.75rem', cursor: 'help' }}>
                                  📝
                                </span>
                              )}
                            </div>
                            {/* Simple Visual Timeline */}
                            <SimpleDeliveryTimeline deliveryStatus={delStatus} orderStatus={order.status} />
                          </div>
                        </td>

                        {/* Expected Delivery Date */}
                        <td data-label="Expected Delivery" style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                          {delStatus === 'Delivered' || order.status === 'completed' ? (
                            <span style={{ color: '#047857', fontWeight: '800', fontSize: '0.85rem' }}>
                              ✓ Delivered
                            </span>
                          ) : order.expectedDeliveryDate ? (
                            <span style={{ color: '#ea580c', fontWeight: '800', fontSize: '0.85rem' }}>
                              📅 {formatIndianDate(order.expectedDeliveryDate)}
                            </span>
                          ) : (
                            <span style={{
                              color: '#9a3412',
                              backgroundColor: '#fff7ed',
                              border: '1px solid #fed7aa',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '0.35rem',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              display: 'inline-block',
                            }}>
                              Delivery date will be updated soon.
                            </span>
                          )}
                        </td>

                        {/* Action */}
                        <td data-label="Action" style={{ padding: '0.85rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              backgroundColor: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#1d4ed8',
                              borderRadius: '0.35rem',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Member Order Details Modal */}
      {selectedOrder && (
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
            maxWidth: '650px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1rem',
            padding: '2rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            maxHeight: '90vh',
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
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                  Order Details
                </h3>
                <code style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: '700' }}>
                  ID: #{selectedOrder.id ? selectedOrder.id.slice(0, 10) : ''}
                </code>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
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

            {/* Visual Delivery Timeline and Status Card */}
            <div style={{ marginBottom: '1.25rem' }}>
              <DeliveryTimeline
                deliveryStatus={getNormalizedDeliveryStatus(selectedOrder)}
                orderStatus={selectedOrder.status}
                expectedDeliveryDate={selectedOrder.expectedDeliveryDate}
                deliveryNote={selectedOrder.deliveryNote}
                deliveredAt={selectedOrder.deliveredAt}
                deliveryUpdatedAt={selectedOrder.deliveryUpdatedAt || selectedOrder.updatedAt}
                showDetailsCard={true}
              />
            </div>

            {/* Order Status Callout */}
            {(() => {
              const badge = getStatusBadge(selectedOrder.status);
              return (
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: badge.bg,
                  border: `1px solid ${badge.border}`,
                  borderRadius: '0.5rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Overall Order Status
                    </span>
                    <strong style={{ color: badge.color, fontSize: '0.925rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {badge.label}
                    </strong>
                  </div>
                  <span style={{ fontSize: '1.4rem' }}>{badge.icon}</span>
                </div>
              );
            })()}

            {/* Item Breakdown */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '0.75rem',
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
              marginBottom: '1.25rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', fontSize: '0.875rem' }}>
                <span style={{ color: '#64748b', fontWeight: '600' }}>Product</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '0.3rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    {selectedOrder.productImageURL ? (
                      <img
                        src={selectedOrder.productImageURL}
                        alt={selectedOrder.productName}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.parentElement) e.target.parentElement.innerHTML = '📦';
                        }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.9rem' }}>📦</span>
                    )}
                  </div>
                  <strong style={{ color: '#0a2540' }}>{selectedOrder.productName}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <span style={{ color: '#64748b' }}>Quantity</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>{selectedOrder.quantity} units</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                <span style={{ color: '#64748b' }}>Unit Price</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>{formatINR(selectedOrder.unitPrice)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.65rem',
                borderTop: '1px solid #e2e8f0',
                fontSize: '0.95rem',
              }}>
                <strong style={{ color: '#0a2540' }}>Total Amount</strong>
                <strong style={{ color: '#047857', fontSize: '1.15rem' }}>
                  {formatINR(selectedOrder.totalAmount)}
                </strong>
              </div>
            </div>

            {/* Delivery Details */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '0.75rem',
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              fontSize: '0.85rem',
            }}>
              <div style={{ marginBottom: '0.65rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Delivery Address</span>
                <span style={{ color: '#0f172a', lineHeight: 1.4 }}>
                  {selectedOrder.address || 'Address on profile'}
                </span>
              </div>

              {selectedOrder.note && (
                <div style={{ marginBottom: '0.65rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Order Note</span>
                  <span style={{ color: '#475569', fontStyle: 'italic' }}>
                    "{selectedOrder.note}"
                  </span>
                </div>
              )}

              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600', textTransform: 'uppercase' }}>Placed On</span>
                <span style={{ color: '#0f172a' }}>
                  {formatIndianDate(selectedOrder.createdAt, true)}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>

              {selectedOrder.status === 'approved' && (
                <Link
                  to="/member/installments"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0.6rem 1.25rem',
                    backgroundColor: '#ea580c',
                    color: '#ffffff',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: '700',
                    textDecoration: 'none',
                    boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                  }}
                >
                  View Installment Plan &rarr;
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOrdersPage;
