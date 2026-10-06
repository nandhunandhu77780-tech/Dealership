import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  PRODUCT_CATEGORIES,
} from '../services/productService.js';
import { logAdminActivity, ACTION_TYPES } from '../services/activityLogService.js';
import ProductModal from './ProductModal.jsx';
import DeleteProductModal from './DeleteProductModal.jsx';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';
import { deleteProductImage, isFirebaseStorageUrl } from '../services/storageService.js';

const ProductManagement = () => {
  const { currentUser, userProfile } = useAuth();
  const adminName = userProfile?.name || currentUser?.displayName || 'Administrator';
  const adminEmail = userProfile?.email || currentUser?.email || '';
  const adminId = currentUser?.uid || '';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters and Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  // Alerts
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
      showNotification('Failed to fetch products from Firestore.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // Filter products based on search query, category, and status
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !query ||
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query));

      const matchesCategory =
        categoryFilter === 'all' || p.category === categoryFilter;

      const matchesStatus =
        statusFilter === 'all' || p.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchQuery, categoryFilter, statusFilter]);

  const handleOpenAdd = () => {
    setSelectedProduct(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (product) => {
    setSelectedProduct(product);
    setIsFormModalOpen(true);
  };

  const handleSaveProduct = async (formData) => {
    setActionLoading(true);
    try {
      if (selectedProduct) {
        // Clean up previous storage image if replaced or removed
        if (
          selectedProduct.imageURL &&
          selectedProduct.imageURL !== formData.imageURL &&
          isFirebaseStorageUrl(selectedProduct.imageURL)
        ) {
          deleteProductImage(selectedProduct.imageURL).catch(() => {});
        }

        await updateProduct(selectedProduct.id, formData);
        setProducts((prev) =>
          prev.map((item) =>
            item.id === selectedProduct.id
              ? { ...item, ...formData, updatedAt: new Date().toISOString() }
              : item
          )
        );
        showNotification(`Product "${formData.name}" updated successfully.`);

        // Safe activity log
        logAdminActivity({
          action: `Updated Product "${formData.name || selectedProduct.name}"`,
          actionType: ACTION_TYPES.PRODUCT_EDITED,
          adminId,
          adminName,
          adminEmail,
          targetType: 'product',
          targetId: selectedProduct.id,
          productId: selectedProduct.id,
          productName: formData.name || selectedProduct.name,
          amount: parseFloat(formData.price) || 0,
          details: `Updated catalog specifications for product "${formData.name || selectedProduct.name}"`,
        });
      } else {
        const newProd = await createProduct(formData);
        setProducts((prev) => [newProd, ...prev]);
        showNotification(`Product "${newProd.name}" added to catalog.`);

        // Safe activity log
        logAdminActivity({
          action: `Added Product "${newProd.name}"`,
          actionType: ACTION_TYPES.PRODUCT_ADDED,
          adminId,
          adminName,
          adminEmail,
          targetType: 'product',
          targetId: newProd.id,
          productId: newProd.id,
          productName: newProd.name,
          amount: parseFloat(newProd.price) || 0,
          details: `Added new product "${newProd.name}" to inventory (${newProd.category || 'General'})`,
        });
      }
      setIsFormModalOpen(false);
      setSelectedProduct(null);
    } catch (err) {
      console.error('Failed to save product:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenDelete = (product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (id) => {
    setActionLoading(true);
    const targetProduct = productToDelete || products.find((p) => p.id === id);
    try {
      if (targetProduct?.imageURL && isFirebaseStorageUrl(targetProduct.imageURL)) {
        deleteProductImage(targetProduct.imageURL).catch(() => {});
      }
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showNotification('Product removed from catalog.');

      // Safe activity log
      if (targetProduct) {
        logAdminActivity({
          action: `Deleted Product "${targetProduct.name}"`,
          actionType: ACTION_TYPES.PRODUCT_DELETED,
          adminId,
          adminName,
          adminEmail,
          targetType: 'product',
          targetId: targetProduct.id,
          productId: targetProduct.id,
          productName: targetProduct.name,
          details: `Removed product "${targetProduct.name}" from catalog`,
        });
      }

      setIsDeleteModalOpen(false);
      setProductToDelete(null);
    } catch (err) {
      console.error('Failed to delete product:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {

      setActionLoading(false);
    }
  };

  const handleToggleStatus = async (product) => {
    try {
      const nextStatus = await toggleProductStatus(product.id, product.status);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: nextStatus } : p))
      );
      showNotification(
        `"${product.name}" is now ${nextStatus.toUpperCase()}.`
      );

      // Safe activity log
      logAdminActivity({
        action: `${nextStatus === 'active' ? 'Activated' : 'Deactivated'} Product "${product.name}"`,
        actionType: nextStatus === 'active' ? ACTION_TYPES.PRODUCT_ACTIVATED : ACTION_TYPES.PRODUCT_DEACTIVATED,
        adminId,
        adminName,
        adminEmail,
        targetType: 'product',
        targetId: product.id,
        productId: product.id,
        productName: product.name,
        status: nextStatus,
        details: `Changed product "${product.name}" visibility status to ${nextStatus}`,
      });
    } catch (err) {
      console.error('Failed to update status:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    }
  };

  const formatPrice = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <section style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '0.875rem',
      padding: '2rem',
      marginTop: '1.5rem',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
    }}>
      {/* Header and Add Button */}
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
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
              Product Catalog
            </h2>
            <span style={{
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: '700',
              border: '1px solid #bfdbfe',
            }}>
              {products.length} {products.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
            Manage merchandise, installment prices, and inventory stock in Firestore
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="btn btn-orange"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
          <span>Add Product</span>
        </button>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div style={{
          backgroundColor: notification.type === 'error' ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          color: notification.type === 'error' ? '#b91c1c' : '#047857',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: '600',
        }}>
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
        padding: '0.85rem 1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '0.75rem',
        border: '1px solid #e2e8f0',
      }}>
        {/* Search Box */}
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <span style={{
            position: 'absolute',
            left: '0.85rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#64748b',
            fontSize: '0.9rem',
          }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, description..."
            style={{
              width: '100%',
              padding: '0.6rem 2rem 0.6rem 2.4rem',
              backgroundColor: '#ffffff',
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
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Category Filter */}
        <div style={{ minWidth: '160px' }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 0.85rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              color: '#0f172a',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Categories</option>
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['all', 'active', 'inactive'].map((st) => {
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '0.45rem 0.8rem',
                  borderRadius: '0.45rem',
                  border: '1px solid',
                  borderColor: isSelected ? '#0a2540' : '#e2e8f0',
                  backgroundColor: isSelected ? '#0a2540' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#475569',
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
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ margin: 0, fontWeight: '600' }}>Loading products from Firestore...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        /* Empty State */
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📦</div>
          <h3 style={{ fontSize: '1.1rem', color: '#0a2540', fontWeight: '800', marginBottom: '0.4rem' }}>
            {searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
              ? 'No matching products found'
              : 'No products in catalog yet'}
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            {searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search keywords or resetting category and status filters.'
              : 'Add appliances, electronics, vehicles, or merchandise to start managing your installment catalog.'}
          </p>
          {searchQuery || categoryFilter !== 'all' || statusFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
                setStatusFilter('all');
              }}
              className="btn btn-secondary btn-sm"
            >
              Reset Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="btn btn-orange btn-sm"
            >
              + Add First Product
            </button>
          )}
        </div>
      ) : (
        /* Product Table */
        <div className="table-container">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const isActive = product.status === 'active';
                const isOutOfStock = product.stock <= 0;
                const isLowStock = product.stock > 0 && product.stock <= 2;

                return (
                  <tr key={product.id}>
                    {/* Image & Name Column */}
                    <td data-label="Product">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        {/* Thumbnail */}
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '0.5rem',
                          backgroundColor: '#f8fafc',
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
                                if (product.googleDriveFileId && !e.target.dataset.triedDrive) {
                                  e.target.dataset.triedDrive = 'true';
                                  e.target.src = `https://lh3.googleusercontent.com/d/${product.googleDriveFileId}`;
                                } else {
                                  e.target.style.display = 'none';
                                  if (e.target.parentElement) e.target.parentElement.innerHTML = '📦';
                                }
                              }}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ fontSize: '1.25rem', opacity: 0.6 }}>📦</span>
                          )}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '700', color: '#0f172a' }}>
                              {product.name}
                            </span>
                            {product.googleDriveFileId && (
                              <span
                                title={`Google Drive File ID: ${product.googleDriveFileId}`}
                                style={{
                                  fontSize: '0.675rem',
                                  fontWeight: '700',
                                  color: '#15803d',
                                  backgroundColor: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: '0.35rem',
                                  padding: '0.1rem 0.4rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                }}
                              >
                                <svg width="10" height="10" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
                                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                                </svg>
                                Drive Photo
                              </span>
                            )}
                          </div>
                          {product.description && (
                            <div style={{
                              fontSize: '0.8rem',
                              color: '#64748b',
                              marginTop: '0.15rem',
                              maxWidth: '280px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {product.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td data-label="Category" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        color: '#0a2540',
                        borderRadius: '0.35rem',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                      }}>
                        {product.category || 'Other'}
                      </span>
                    </td>

                    {/* Price */}
                    <td data-label="Price" style={{ whiteSpace: 'nowrap' }}>
                      <strong style={{ color: '#047857', fontSize: '0.95rem', fontWeight: '800' }}>
                        {formatINR(product.price)}
                      </strong>
                    </td>

                    {/* Stock */}
                    <td data-label="Stock" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '0.35rem',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        backgroundColor: isOutOfStock
                          ? '#fef2f2'
                          : isLowStock
                          ? '#fff7ed'
                          : '#ecfdf5',
                        color: isOutOfStock
                          ? '#b91c1c'
                          : isLowStock
                          ? '#c2410c'
                          : '#047857',
                        border: `1px solid ${
                          isOutOfStock ? '#fecaca' : isLowStock ? '#fed7aa' : '#a7f3d0'
                        }`,
                      }}>
                        {isOutOfStock ? 'Out of stock' : `${product.stock} in stock`}
                      </span>
                    </td>

                    {/* Status */}
                    <td data-label="Status" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        backgroundColor: isActive ? '#ecfdf5' : '#f1f5f9',
                        color: isActive ? '#047857' : '#64748b',
                        border: `1px solid ${isActive ? '#a7f3d0' : '#e2e8f0'}`,
                      }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: isActive ? '#10b981' : '#94a3b8',
                        }} />
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td data-label="Actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        {/* Toggle Status */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(product)}
                          title={isActive ? 'Deactivate product' : 'Activate product'}
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            borderRadius: '0.35rem',
                            border: '1px solid',
                            borderColor: isActive ? '#fed7aa' : '#a7f3d0',
                            backgroundColor: isActive ? '#fff7ed' : '#ecfdf5',
                            color: isActive ? '#c2410c' : '#047857',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(product)}
                          title="Edit product"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', fontWeight: '700' }}
                        >
                          Edit
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(product)}
                          title="Delete product"
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            borderRadius: '0.35rem',
                            border: '1px solid #fecaca',
                            backgroundColor: '#fef2f2',
                            color: '#b91c1c',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <ProductModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setSelectedProduct(null); }}
        onSave={handleSaveProduct}
        product={selectedProduct}
        loading={actionLoading}
      />

      <DeleteProductModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setProductToDelete(null); }}
        onConfirm={handleConfirmDelete}
        product={productToDelete}
        loading={actionLoading}
      />
    </section>
  );
};

export default ProductManagement;
