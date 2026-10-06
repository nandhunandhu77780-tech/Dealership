import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createOrder } from '../services/orderService.js';
import { formatINR, sanitizeErrorMessage } from '../utils/formatters.js';

const PurchaseModal = ({ isOpen, onClose, product, onOrderSuccess }) => {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setAddress(userProfile?.address || '');
      setNote('');
      setErrorMessage('');
      setPlacedOrder(null);
    }
  }, [isOpen, product, userProfile?.address]);

  if (!isOpen || !product) return null;

  const maxStock = parseInt(product.stock, 10) || 1;
  const unitPrice = parseFloat(product.price) || 0;
  const totalAmount = parseFloat((quantity * unitPrice).toFixed(2));

  const formatPrice = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleQuantityChange = (newVal) => {
    const parsed = parseInt(newVal, 10);
    if (isNaN(parsed)) {
      setQuantity(1);
    } else if (parsed < 1) {
      setQuantity(1);
    } else if (parsed > maxStock) {
      setQuantity(maxStock);
    } else {
      setQuantity(parsed);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!address.trim()) {
      setErrorMessage('Delivery/Address information is required.');
      return;
    }

    if (quantity < 1) {
      setErrorMessage('Quantity must be at least 1.');
      return;
    }

    if (quantity > maxStock) {
      setErrorMessage(`Quantity cannot exceed available stock (${maxStock}).`);
      return;
    }

    setLoading(true);
    try {
      const orderPayload = {
        memberId: currentUser?.uid,
        memberName: userProfile?.name || currentUser?.displayName || 'Member',
        memberPhone: userProfile?.phone || '',
        memberCode: userProfile?.memberId || '',
        memberEmail: userProfile?.email || currentUser?.email || '',
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
        address,
        note,
      };

      const newOrder = await createOrder(orderPayload);
      setPlacedOrder(newOrder);
      if (onOrderSuccess) {
        onOrderSuccess(newOrder);
      }
    } catch (err) {
      console.error('Failed to submit order:', err);
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
        maxWidth: '540px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        maxHeight: '92vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
              {placedOrder ? 'Order Placed' : 'Confirm Purchase'}
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              {placedOrder ? 'Your order has been recorded in Firestore' : 'Complete your installment purchase details'}
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

        {/* Success Confirmation Screen */}
        {placedOrder ? (
          <div>
            <div style={{
              textAlign: 'center',
              padding: '1.5rem 1rem',
              backgroundColor: '#ecfdf5',
              borderRadius: '0.75rem',
              border: '1px solid #a7f3d0',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
              <h3 style={{ fontSize: '1.25rem', color: '#047857', fontWeight: '800', marginBottom: '0.25rem' }}>
                Order placed successfully
              </h3>
              <p style={{ color: '#475569', fontSize: '0.875rem', margin: 0 }}>
                Your order is currently pending NANDANAM Agencies approval.
              </p>
            </div>

            {/* Order Details Receipt */}
            <div style={{
              backgroundColor: '#f8fafc',
              borderRadius: '0.75rem',
              border: '1px solid #e2e8f0',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              fontSize: '0.9rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <span style={{ color: '#64748b' }}>Order ID</span>
                <code style={{ color: '#ea580c', fontWeight: '700' }}>#{placedOrder.id}</code>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <span style={{ color: '#64748b' }}>Item</span>
                <strong style={{ color: '#0a2540' }}>{placedOrder.productName}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <span style={{ color: '#64748b' }}>Quantity</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>{placedOrder.quantity} units</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <span style={{ color: '#64748b' }}>Unit Price</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>{formatINR(placedOrder.unitPrice)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.65rem',
                borderTop: '1px solid #e2e8f0',
                marginBottom: '0.65rem',
              }}>
                <strong style={{ color: '#0a2540' }}>Total Amount</strong>
                <strong style={{ color: '#047857', fontSize: '1.15rem' }}>
                  {formatINR(placedOrder.totalAmount)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <span style={{ color: '#64748b' }}>Status</span>
                <span style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  backgroundColor: '#fff7ed',
                  color: '#c2410c',
                  border: '1px solid #fed7aa',
                  textTransform: 'uppercase',
                }}>
                  Pending
                </span>
              </div>

              <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Delivery Address</span>
                <span style={{ color: '#0f172a', fontSize: '0.85rem' }}>{placedOrder.address}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: '0.5rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/member/orders');
                }}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(234, 88, 12, 0.25)',
                }}
              >
                Go to My Orders &rarr;
              </button>
            </div>
          </div>
        ) : (
          /* Purchase Input Form */
          <form onSubmit={handleSubmit}>
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

            {/* Selected Product Summary Card */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.75rem',
              marginBottom: '1.25rem',
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '0.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                {product.imageURL ? (
                  <img
                    src={product.imageURL}
                    alt={product.name}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      if (e.target.parentElement) e.target.parentElement.innerHTML = '📦';
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '1.5rem', opacity: 0.6 }}>📦</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontSize: '0.75rem',
                  color: '#1d4ed8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: '700',
                }}>
                  {product.category}
                </span>
                <h4 style={{
                  fontSize: '1rem',
                  fontWeight: '700',
                  color: '#0a2540',
                  margin: '0.15rem 0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {product.name}
                </h4>
                <span style={{
                  fontSize: '0.75rem',
                  color: product.stock > 2 ? '#047857' : '#ea580c',
                  fontWeight: '700',
                }}>
                  ● {product.stock} available in stock
                </span>
              </div>
            </div>

            {/* Quantity Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                color: '#0f172a',
                marginBottom: '0.4rem',
                fontWeight: '600',
              }}>
                Quantity <span style={{ color: '#ea580c' }}>*</span> (Available: {maxStock})
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - 1)}
                  disabled={quantity <= 1 || loading}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '0.4rem',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '1.2rem',
                    cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                    opacity: quantity <= 1 ? 0.4 : 1,
                  }}
                >
                  -
                </button>

                <input
                  type="number"
                  min="1"
                  max={maxStock}
                  value={quantity}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  disabled={loading}
                  style={{
                    width: '80px',
                    textAlign: 'center',
                    padding: '0.55rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.4rem',
                    color: '#0f172a',
                    fontSize: '1rem',
                    fontWeight: '700',
                  }}
                />

                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity + 1)}
                  disabled={quantity >= maxStock || loading}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '0.4rem',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '1.2rem',
                    cursor: quantity >= maxStock ? 'not-allowed' : 'pointer',
                    opacity: quantity >= maxStock ? 0.4 : 1,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Price Breakdown Calculation */}
            <div style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '0.75rem',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                <span style={{ color: '#475569' }}>Unit Price:</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>₹{formatPrice(unitPrice)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                <span style={{ color: '#475569' }}>Quantity:</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>{quantity}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.5rem',
                borderTop: '1px solid #bfdbfe',
                fontWeight: '700',
              }}>
                <span style={{ color: '#0a2540' }}>Total Order Value:</span>
                <span style={{ color: '#047857', fontSize: '1.15rem', fontWeight: '800' }}>
                  ₹{formatPrice(totalAmount)}
                </span>
              </div>
            </div>

            {/* Delivery Address */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                color: '#0f172a',
                marginBottom: '0.4rem',
                fontWeight: '600',
              }}>
                Delivery Address <span style={{ color: '#ea580c' }}>*</span>
              </label>
              <textarea
                rows="3"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                disabled={loading}
                placeholder="Enter complete shipping address with landmark and pincode..."
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  color: '#0f172a',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Optional Note */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                color: '#475569',
                marginBottom: '0.4rem',
                fontWeight: '500',
              }}>
                Order Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={loading}
                placeholder="Preferred installment duration, contact timing, etc."
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
                {loading ? 'Submitting Order...' : 'Confirm Order'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default PurchaseModal;
