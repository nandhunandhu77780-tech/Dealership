import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import MemberNavbar from '../components/MemberNavbar.jsx';
import { getProductById } from '../services/productService.js';
import PurchaseModal from '../components/PurchaseModal.jsx';
import { formatINR, sanitizeErrorMessage } from '../utils/formatters.js';

const ProductDetailsPage = () => {
  const { id } = useParams();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getProductById(id);
        if (!data) {
          setError('The requested product could not be found.');
        } else {
          setProduct(data);
        }
      } catch (err) {
        console.error('Failed to load product details:', err);
        setError(sanitizeErrorMessage(err, 'Failed to fetch product details.'));
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const handlePurchase = () => {
    setIsPurchaseModalOpen(true);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Unified Member Navigation */}
      <MemberNavbar activePage="products" />

      {/* Main Content Area */}
      <main className="container" style={{ maxWidth: '1050px', margin: '0 auto', padding: '1.75rem 1.25rem 3rem' }}>
        {/* Breadcrumb Navigation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.75rem',
          fontSize: '0.875rem',
        }}>
          <Link to="/member" style={{ color: '#64748b', textDecoration: 'none' }}>
            Dashboard
          </Link>
          <span style={{ color: '#94a3b8' }}>/</span>
          <Link to="/member/products" style={{ color: '#64748b', textDecoration: 'none' }}>
            Products
          </Link>
          <span style={{ color: '#94a3b8' }}>/</span>
          <span style={{ color: '#0a2540', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product?.name || 'Product Details'}
          </span>
        </div>

        {/* Success Alert after Order Placement */}
        {lastPlacedOrder && (
          <div style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            padding: '1.15rem 1.35rem',
            borderRadius: '0.75rem',
            marginBottom: '2rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            boxShadow: 'var(--shadow-xs)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.75rem' }}>🎉</span>
              <div>
                <strong style={{ display: 'block', fontSize: '1.05rem', color: '#065f46' }}>
                  Order submitted successfully!
                </strong>
                <span style={{ fontSize: '0.85rem', color: '#047857' }}>
                  Order ID: <code>#{lastPlacedOrder.id ? lastPlacedOrder.id.slice(0, 8) : 'N/A'}</code> &bull; Quantity: {lastPlacedOrder.quantity} unit(s)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Link to="/member/orders" className="btn btn-primary btn-sm">
                View in My Orders &rarr;
              </Link>
              <button
                type="button"
                onClick={() => setLastPlacedOrder(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#065f46',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '0.2rem',
                }}
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p style={{ fontSize: '1rem', color: '#0f172a', fontWeight: '700', margin: 0 }}>Loading product details...</p>
          </div>
        )}

        {/* Error / Not Found State */}
        {error && !loading && (
          <div className="empty-state-card" style={{ borderColor: '#fca5a5' }}>
            <div className="empty-state-icon" style={{ color: '#dc2626' }}>🔍</div>
            <h2 className="empty-state-title" style={{ color: '#dc2626' }}>
              Product Not Found
            </h2>
            <p className="empty-state-desc">
              {error}
            </p>
            <Link to="/member/products" className="btn btn-primary">
              &larr; Back to Products Catalog
            </Link>
          </div>
        )}

        {/* Product Details Card */}
        {!loading && !error && product && (
          <div className="card" style={{
            padding: 0,
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1.25rem',
            boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '2.5rem',
              padding: '2rem',
            }}>
              {/* Left Column: Product Image */}
              <div>
                <div style={{
                  width: '100%',
                  height: '380px',
                  borderRadius: '1rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  padding: '1rem',
                }}>
                  {product.imageURL ? (
                    <img
                      src={product.imageURL}
                      alt={product.name}
                      onError={(e) => {
                        if (product.googleDriveFileId && !e.target.dataset.triedDrive) {
                          e.target.dataset.triedDrive = 'true';
                          e.target.src = `https://lh3.googleusercontent.com/d/${product.googleDriveFileId}`;
                        } else {
                          e.target.style.display = 'none';
                          if (e.target.parentElement) {
                            e.target.parentElement.innerHTML = '<span style="font-size: 5rem; opacity: 0.3;">📦</span>';
                          }
                        }
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '5rem', opacity: '0.3' }}>📦</span>
                  )}

                  {/* Category badge */}
                  <span style={{
                    position: 'absolute',
                    top: '1rem',
                    left: '1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(6px)',
                    color: '#0a2540',
                    border: '1px solid #cbd5e1',
                    padding: '0.3rem 0.85rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
                  }}>
                    {product.category || 'General'}
                  </span>
                </div>
              </div>

              {/* Right Column: Product Details & Purchase CTA */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Category and Stock Header */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.65rem',
                  marginBottom: '0.85rem',
                }}>
                  <span className="badge badge-blue">
                    🏷️ {product.category}
                  </span>

                  <span className={product.stock > 2 ? 'badge badge-paid' : 'badge badge-due'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>●</span> {product.stock > 0 ? `${product.stock} units available` : 'Out of stock'}
                  </span>
                </div>

                {/* Product Name */}
                <h1 style={{
                  fontSize: '1.85rem',
                  fontWeight: '800',
                  color: '#0f172a',
                  marginBottom: '1rem',
                  lineHeight: '1.25',
                  letterSpacing: '-0.02em',
                }}>
                  {product.name}
                </h1>

                {/* Price Display */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.85rem',
                  padding: '1.25rem 1.5rem',
                  marginBottom: '1.5rem',
                }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', fontWeight: '600' }}>
                    Cash / Total Financed Price
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <strong style={{ fontSize: '2.1rem', color: '#0a2540', fontWeight: '900', letterSpacing: '-0.02em' }}>
                      {formatINR(product.price)}
                    </strong>
                    <span style={{
                      fontSize: '0.8rem',
                      color: '#ea580c',
                      fontWeight: '700',
                      backgroundColor: '#fff7ed',
                      border: '1px solid #fed7aa',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '0.35rem',
                    }}>
                      ⚡ Flexible Installments Eligible
                    </span>
                  </div>
                  <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid #e2e8f0', fontSize: '0.775rem', color: '#64748b' }}>
                    ✓ No hidden fees &bull; Transparent repayment schedules with NANDANAM Agencies
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom: '1.75rem', flex: 1 }}>
                  <h3 style={{ fontSize: '0.825rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                    Product Details & Specifications
                  </h3>
                  <p style={{
                    color: '#0f172a',
                    fontSize: '0.95rem',
                    lineHeight: '1.65',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {product.description || 'Flexible weekly or monthly installment financing is available for this product through NANDANAM Agencies.'}
                  </p>
                </div>

                {/* Action Buttons */}
                <div style={{
                  paddingTop: '1.5rem',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  gap: '0.85rem',
                  flexWrap: 'wrap',
                }}>
                  <Link
                    to="/member/products"
                    className="btn btn-secondary"
                    style={{ flex: '1 1 120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    &larr; Catalog
                  </Link>

                  <button
                    type="button"
                    onClick={handlePurchase}
                    disabled={product.stock <= 0}
                    className="btn btn-orange"
                    style={{
                      flex: '2 1 220px',
                      padding: '0.85rem 1.75rem',
                      fontSize: '1.05rem',
                      fontWeight: '800',
                      opacity: product.stock <= 0 ? 0.5 : 1,
                      cursor: product.stock <= 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span>🛍️</span>
                    <span>{product.stock <= 0 ? 'Out of Stock' : 'Buy Now &bull; Order Plan'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Purchase Modal */}
      {product && (
        <PurchaseModal
          isOpen={isPurchaseModalOpen}
          onClose={() => setIsPurchaseModalOpen(false)}
          product={product}
          onOrderSuccess={(order) => {
            setIsPurchaseModalOpen(false);
            setLastPlacedOrder(order);
          }}
        />
      )}
    </div>
  );
};

export default ProductDetailsPage;
