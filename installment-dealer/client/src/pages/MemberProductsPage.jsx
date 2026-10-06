import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import MemberNavbar from '../components/MemberNavbar.jsx';
import { getActiveInStockProducts, PRODUCT_CATEGORIES } from '../services/productService.js';
import { formatINR, sanitizeErrorMessage } from '../utils/formatters.js';

const MemberProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const loadCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveInStockProducts();
      setProducts(data);
    } catch (err) {
      console.error('Failed to load member catalog:', err);
      setError(sanitizeErrorMessage(err, 'Unable to load products. Please check your internet connection.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Filter products by search query and category
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !query || (p.name && p.name.toLowerCase().includes(query));
      const matchesCategory =
        categoryFilter === 'all' || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, categoryFilter]);

  const hasActiveFilters = searchQuery.trim() !== '' || categoryFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Unified Navigation */}
      <MemberNavbar activePage="products" />

      {/* Main Container */}
      <main className="container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.75rem 1.25rem 3rem' }}>
        {/* Page Title & Breadcrumb */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <Link to="/member" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.85rem' }}>
                Dashboard
              </Link>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>/</span>
              <span style={{ color: '#0a2540', fontSize: '0.85rem', fontWeight: '700' }}>Products</span>
            </div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Product Catalog
            </h1>
            <p style={{ color: '#475569', fontSize: '0.9rem', marginTop: '0.25rem', margin: 0 }}>
              Explore electronics, appliances & home essentials available on flexible installment plans
            </p>
          </div>

          <button
            type="button"
            onClick={loadCatalog}
            className="btn btn-secondary btn-sm"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter and Search Controls */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.75rem',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: '0.85rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
              fontSize: '1rem',
              pointerEvents: 'none',
            }}>
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by title or brand..."
              style={{
                width: '100%',
                padding: '0.65rem 1rem 0.65rem 2.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>
              Category:
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: '0.65rem 1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.875rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All Categories</option>
              {PRODUCT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="btn btn-secondary btn-sm"
              style={{ color: '#dc2626' }}
            >
              Clear Filters &times;
            </button>
          )}
        </div>

        {/* Results Count Header */}
        {!loading && !error && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            color: '#64748b',
          }}>
            <span>
              Showing <strong style={{ color: '#0f172a' }}>{filteredProducts.length}</strong> available {filteredProducts.length === 1 ? 'product' : 'products'}
            </span>
            {categoryFilter !== 'all' && (
              <span className="badge badge-blue">
                Category: {categoryFilter}
              </span>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p style={{ fontSize: '1rem', color: '#0f172a', fontWeight: '700', margin: 0 }}>Loading catalog...</p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Fetching active products from inventory</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="empty-state-card" style={{ borderColor: '#fca5a5' }}>
            <div className="empty-state-icon" style={{ color: '#dc2626' }}>⚠️</div>
            <h3 className="empty-state-title" style={{ color: '#dc2626' }}>
              Failed to Load Products
            </h3>
            <p className="empty-state-desc">
              {error}
            </p>
            <button
              type="button"
              onClick={loadCatalog}
              className="btn btn-primary"
            >
              Retry Loading
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredProducts.length === 0 && (
          <div className="empty-state-card">
            <div className="empty-state-icon">📦</div>
            <h3 className="empty-state-title">
              {hasActiveFilters ? 'No matching products found' : 'No products available right now'}
            </h3>
            <p className="empty-state-desc">
              {hasActiveFilters
                ? 'No active products match your search or category filter. Try clearing filters to see all available items.'
                : 'Our product inventory is currently being updated. Please check back shortly.'}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="btn btn-primary"
              >
                Clear All Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={loadCatalog}
                className="btn btn-secondary"
              >
                Refresh Catalog
              </button>
            )}
          </div>
        )}

        {/* Responsive Product Cards Grid */}
        {!loading && !error && filteredProducts.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '1.5rem',
            marginBottom: '3rem',
          }}>
            {filteredProducts.map((product) => {
              const isLowStock = product.stock <= 2;

              return (
                <div
                  key={product.id}
                  className="card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '1rem',
                    boxShadow: 'var(--shadow-xs)',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-3px)';
                    e.currentTarget.style.boxShadow = '0 12px 24px -6px rgba(10, 37, 64, 0.08), 0 4px 8px -2px rgba(10, 37, 64, 0.04)';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  {/* Large Product Image Thumbnail */}
                  <div style={{
                    height: '220px',
                    backgroundColor: '#f8fafc',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottom: '1px solid #e2e8f0',
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
                              e.target.parentElement.innerHTML = '<span style="font-size: 3.5rem; opacity: 0.35;">📦</span>';
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          padding: '0.75rem',
                          transition: 'transform 0.3s ease',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '3.5rem', opacity: 0.35 }}>📦</span>
                    )}

                    {/* Category Pill Overlay */}
                    <span style={{
                      position: 'absolute',
                      top: '0.75rem',
                      left: '0.75rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      backdropFilter: 'blur(6px)',
                      color: '#0a2540',
                      border: '1px solid #cbd5e1',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '9999px',
                      fontSize: '0.725rem',
                      fontWeight: '700',
                      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.08)',
                    }}>
                      {product.category || 'General'}
                    </span>

                    {/* Stock Pill Overlay */}
                    <span style={{
                      position: 'absolute',
                      top: '0.75rem',
                      right: '0.75rem',
                      backgroundColor: isLowStock ? '#fff7ed' : '#ecfdf5',
                      color: isLowStock ? '#c2410c' : '#047857',
                      border: `1px solid ${isLowStock ? '#fed7aa' : '#a7f3d0'}`,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      fontSize: '0.725rem',
                      fontWeight: '700',
                      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}>
                      <span>●</span>
                      <span>{isLowStock ? `Only ${product.stock} left` : `${product.stock} in stock`}</span>
                    </span>
                  </div>

                  {/* Product Content */}
                  <div style={{
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                  }}>
                    <h3 style={{
                      fontSize: '1.15rem',
                      fontWeight: '800',
                      color: '#0f172a',
                      marginBottom: '0.4rem',
                      lineHeight: '1.3',
                      letterSpacing: '-0.01em',
                    }}>
                      {product.name}
                    </h3>

                    <p style={{
                      color: '#64748b',
                      fontSize: '0.85rem',
                      lineHeight: '1.5',
                      marginBottom: '1rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      flex: 1,
                    }}>
                      {product.description || 'Flexible weekly or monthly installment financing available for this item.'}
                    </p>

                    {/* Price Row */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      marginBottom: '1.15rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid #f1f5f9',
                    }}>
                      <div>
                        <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'block', fontWeight: '500' }}>
                          Cash / Total Price
                        </span>
                        <strong style={{ fontSize: '1.4rem', color: '#0f172a', fontWeight: '900' }}>
                          {formatINR(product.price)}
                        </strong>
                      </div>

                      <span style={{
                        fontSize: '0.75rem',
                        color: '#ea580c',
                        fontWeight: '700',
                        backgroundColor: '#fff7ed',
                        border: '1px solid #fed7aa',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '0.4rem',
                      }}>
                        ⚡ Easy EMI
                      </span>
                    </div>

                    {/* Prominent Purchase Button */}
                    <Link
                      to={`/member/products/${product.id}`}
                      className="btn btn-orange"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        padding: '0.75rem 1rem',
                        fontWeight: '800',
                        fontSize: '0.95rem',
                        borderRadius: '0.55rem',
                        boxShadow: '0 4px 14px rgba(234, 88, 12, 0.3)',
                        textDecoration: 'none',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      <span>⚡</span>
                      <span>Purchase with Installments &rarr;</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default MemberProductsPage;
