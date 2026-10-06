import React, { useState, useEffect, useRef } from 'react';
import { PRODUCT_CATEGORIES } from '../services/productService.js';
import {
  uploadProductImage,
  validateProductImage,
  isFirebaseStorageUrl,
} from '../services/storageService.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  openGoogleDrivePicker,
  getGoogleDriveConfig,
  saveCustomClientId,
  getDriveDirectImageUrl,
} from '../services/googleDriveService.js';

const ProductModal = ({ isOpen, onClose, onSave, product = null, loading = false }) => {
  const { currentUser, role } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: PRODUCT_CATEGORIES[0],
    price: '',
    stock: '',
    imageURL: '',
    googleDriveFileId: '',
    googleDriveFileName: '',
    imageSource: '',
    status: 'active',
  });
  const [validationError, setValidationError] = useState('');
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  // Upload & Storage States
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [useDirectUrl, setUseDirectUrl] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Google Drive States
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveProgressText, setDriveProgressText] = useState('');
  const [showDriveSetupModal, setShowDriveSetupModal] = useState(false);
  const [setupClientIdInput, setSetupClientIdInput] = useState('');

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        category: product.category || PRODUCT_CATEGORIES[0],
        price: product.price !== undefined ? String(product.price) : '',
        stock: product.stock !== undefined ? String(product.stock) : '',
        imageURL: product.imageURL || '',
        googleDriveFileId: product.googleDriveFileId || '',
        googleDriveFileName: product.googleDriveFileName || '',
        imageSource: product.imageSource || (product.googleDriveFileId ? 'google_drive' : ''),
        status: product.status || 'active',
      });
      // Show direct URL input if product has an external URL (not Firebase storage and not Drive)
      setUseDirectUrl(Boolean(product.imageURL && !isFirebaseStorageUrl(product.imageURL) && !product.googleDriveFileId));
    } else {
      setFormData({
        name: '',
        description: '',
        category: PRODUCT_CATEGORIES[0],
        price: '',
        stock: '1',
        imageURL: '',
        googleDriveFileId: '',
        googleDriveFileName: '',
        imageSource: '',
        status: 'active',
      });
      setUseDirectUrl(false);
    }
    setValidationError('');
    setUploadError('');
    setUploading(false);
    setUploadProgress(0);
    setImageLoadFailed(false);
    setIsDragOver(false);
    setIsDriveLoading(false);
    setDriveProgressText('');
    setShowDriveSetupModal(false);
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'imageURL') {
      setImageLoadFailed(false);
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = async (file) => {
    if (!file) return;
    setUploadError('');
    const validation = validateProductImage(file);
    if (!validation.valid) {
      setUploadError(validation.error);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadProductImage(file, (pct) => {
        setUploadProgress(pct);
      });
      setFormData((prev) => ({
        ...prev,
        imageURL: result.downloadURL,
        googleDriveFileId: '',
        googleDriveFileName: '',
        imageSource: 'upload',
      }));
      setImageLoadFailed(false);
    } catch (err) {
      console.error('Image upload failed:', err);
      setUploadError(err.message || 'Failed to upload product image to Firebase Storage.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleChooseFromGoogleDrive = async (overrideClientId = '') => {
    setUploadError('');
    setIsDriveLoading(true);
    setDriveProgressText('Connecting to Google Drive...');

    try {
      await openGoogleDrivePicker({
        user: currentUser,
        role,
        customClientId: overrideClientId,
        onPick: async (pickedData) => {
          setIsDriveLoading(false);
          setDriveProgressText('');
          setImageLoadFailed(false);

          // 1. Immediate preview using the downloaded blob URL or Google thumbnail
          const directUrl = pickedData.previewURL || pickedData.thumbnailLink || getDriveDirectImageUrl(pickedData.fileId);
          setFormData((prev) => ({
            ...prev,
            imageURL: directUrl,
            googleDriveFileId: pickedData.fileId,
            googleDriveFileName: pickedData.fileName,
            imageSource: 'google_drive',
          }));

          // 2. Upload to Firebase Storage so all members and devices can view the photo without needing personal Google permissions
          if (pickedData.file) {
            setUploading(true);
            setUploadProgress(0);
            try {
              const result = await uploadProductImage(pickedData.file, (pct) => {
                setUploadProgress(pct);
              });
              setFormData((prev) => ({
                ...prev,
                imageURL: result.downloadURL,
                googleDriveFileId: pickedData.fileId,
                googleDriveFileName: pickedData.fileName,
                imageSource: 'google_drive',
              }));
            } catch (storageErr) {
              console.warn('Storage upload fallback for Drive file:', storageErr);
              // In case Storage is temporarily unreachable, maintain the Google Drive image URL
              setFormData((prev) => ({
                ...prev,
                imageURL: directUrl,
                googleDriveFileId: pickedData.fileId,
                googleDriveFileName: pickedData.fileName,
                imageSource: 'google_drive',
              }));
            } finally {
              setUploading(false);
            }
          }
        },
        onCancel: () => {
          setIsDriveLoading(false);
          setDriveProgressText('');
        },
        onError: (err) => {
          setIsDriveLoading(false);
          setDriveProgressText('');
          if (err.code === 'CONFIG_REQUIRED' || err.message === 'GOOGLE_DRIVE_NOT_CONFIGURED') {
            setSetupClientIdInput(getGoogleDriveConfig().clientId || '');
            setShowDriveSetupModal(true);
          } else {
            console.error('Google Drive error:', err);
            setUploadError(err.message || 'Google Drive authorization or photo selection failed.');
          }
        },
      });
    } catch (err) {
      setIsDriveLoading(false);
      setDriveProgressText('');
      if (err.code === 'CONFIG_REQUIRED' || err.message === 'GOOGLE_DRIVE_NOT_CONFIGURED') {
        setSetupClientIdInput(getGoogleDriveConfig().clientId || '');
        setShowDriveSetupModal(true);
      } else {
        setUploadError(err.message || 'Failed to open Google Drive picker.');
      }
    }
  };

  const handleSaveDriveConfig = (e) => {
    e?.preventDefault();
    if (!setupClientIdInput.trim()) {
      setUploadError('Please enter a valid Google OAuth Client ID.');
      return;
    }
    saveCustomClientId(setupClientIdInput.trim());
    setShowDriveSetupModal(false);
    handleChooseFromGoogleDrive(setupClientIdInput.trim());
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({
      ...prev,
      imageURL: '',
      googleDriveFileId: '',
      googleDriveFileName: '',
      imageSource: '',
    }));
    setImageLoadFailed(false);
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (uploading) {
      setValidationError('Please wait for the image upload to finish before saving.');
      return;
    }

    // Required field validation
    if (!formData.name.trim()) {
      setValidationError('Product Name is required.');
      return;
    }

    if (!formData.category.trim()) {
      setValidationError('Category is required.');
      return;
    }

    const priceNum = parseFloat(formData.price);
    if (formData.price === '' || isNaN(priceNum) || priceNum < 0) {
      setValidationError('Price must be a valid number greater than or equal to 0.');
      return;
    }

    const stockNum = parseInt(formData.stock, 10);
    if (formData.stock === '' || isNaN(stockNum) || stockNum < 0) {
      setValidationError('Stock Quantity must be a valid non-negative integer (0 or greater).');
      return;
    }

    onSave({
      ...formData,
      price: priceNum,
      stock: stockNum,
    });
  };

  const isFormBusy = loading || uploading || isDriveLoading;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 37, 64, 0.45)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.25rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '580px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1.25rem',
        padding: '2rem',
        boxShadow: '0 20px 45px -10px rgba(10, 37, 64, 0.25)',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '0.6rem',
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                color: '#ea580c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                border: '1px solid #fed7aa',
              }}>
                📦
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                {product ? 'Edit Product' : 'Add New Product'}
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem', marginBottom: 0 }}>
              {product ? `Modifying catalog item: ${product.name}` : 'Create an item for the installment catalog'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isFormBusy}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#64748b',
              fontSize: '1.25rem',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isFormBusy ? 'not-allowed' : 'pointer',
              lineHeight: 1,
              transition: 'all 0.15s ease',
              opacity: isFormBusy ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!isFormBusy) { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; } }}
            onMouseLeave={(e) => { if (!isFormBusy) { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.color = '#64748b'; } }}
          >
            &times;
          </button>
        </div>

        {validationError && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span>⚠️</span>
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Product Name */}
          <div style={{ marginBottom: '1.1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
              Product Name <span className="required-star" style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Samsung 43-inch Crystal 4K TV"
              style={{
                width: '100%',
                padding: '0.75rem 0.95rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.65rem',
                color: '#0f172a',
                fontSize: '0.925rem',
                outline: 'none',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => e.target.style.borderColor = '#ea580c'}
              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* Category and Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Category <span className="required-star" style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.925rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              >
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Status <span className="required-star" style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.925rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              >
                <option value="active">Active (Available)</option>
                <option value="inactive">Inactive (Archived)</option>
              </select>
            </div>
          </div>

          {/* Price and Stock */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Price (₹) <span className="required-star" style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                name="price"
                step="0.01"
                min="0"
                required
                value={formData.price}
                onChange={handleChange}
                placeholder="25000"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.925rem',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
                Stock Quantity <span className="required-star" style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="number"
                name="stock"
                step="1"
                min="0"
                required
                value={formData.stock}
                onChange={handleChange}
                placeholder="10"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.65rem',
                  color: '#0f172a',
                  fontSize: '0.925rem',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>
          </div>

          {/* Product Image Section (Upload, Google Drive, Replace, Remove, Preview) */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.45rem',
            }}>
              <label style={{ fontSize: '0.85rem', color: '#334155', fontWeight: '600' }}>
                Product Image
              </label>
              <button
                type="button"
                onClick={() => setUseDirectUrl((prev) => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ea580c',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {useDirectUrl ? '← Upload / Choose Image' : 'Or enter Image URL'}
              </button>
            </div>

            {/* Hidden File Input for Device Upload */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
              disabled={isFormBusy}
            />

            {/* Upload Error Banner */}
            {uploadError && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '0.65rem 0.95rem',
                borderRadius: '0.65rem',
                marginBottom: '0.75rem',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                lineHeight: 1.4,
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>⚠️</span>
                  <span>{uploadError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setUploadError('')}
                  style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '1.1rem', padding: 0 }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Drive Connection / Loading Banner */}
            {isDriveLoading && (
              <div style={{
                padding: '0.85rem 1rem',
                backgroundColor: '#eff6ff',
                borderRadius: '0.65rem',
                border: '1px solid #bfdbfe',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                fontSize: '0.85rem',
                color: '#1e40af',
              }}>
                <span style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(29, 78, 216, 0.3)',
                  borderTopColor: '#1d4ed8',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                  display: 'inline-block',
                }} />
                <span style={{ fontWeight: '600' }}>
                  {driveProgressText || 'Connecting to Google Drive...'}
                </span>
              </div>
            )}

            {/* Upload Progress State */}
            {uploading && (
              <div style={{
                padding: '1rem',
                backgroundColor: '#fff7ed',
                borderRadius: '0.65rem',
                border: '1px solid #fed7aa',
                marginBottom: '0.75rem',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  fontSize: '0.85rem',
                }}>
                  <span style={{ color: '#9a3412', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
                    <span style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(234, 88, 12, 0.3)',
                      borderTopColor: '#ea580c',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                      display: 'inline-block',
                    }} />
                    Processing and saving image...
                  </span>
                  <strong style={{ color: '#ea580c' }}>{uploadProgress}%</strong>
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: '#ffedd5',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${uploadProgress}%`,
                    height: '100%',
                    backgroundColor: '#ea580c',
                    borderRadius: '9999px',
                    transition: 'width 0.2s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Direct URL Input Mode */}
            {useDirectUrl ? (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <input
                  type="url"
                  name="imageURL"
                  value={formData.imageURL}
                  onChange={handleChange}
                  placeholder="https://images.unsplash.com/... or direct image link"
                  style={{
                    flex: 1,
                    padding: '0.75rem 0.95rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.65rem',
                    color: '#0f172a',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#ea580c'}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
                {/* Small preview */}
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '0.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  {formData.imageURL && !imageLoadFailed ? (
                    <img
                      src={formData.imageURL}
                      alt="Preview"
                      onError={() => setImageLoadFailed(true)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '1.2rem', opacity: 0.6 }}>📦</span>
                  )}
                </div>
              </div>
            ) : formData.imageURL && !uploading ? (
              /* Image Present: Preview Thumbnail with Replace & Remove Actions */
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.85rem 1rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.75rem',
              }}>
                {/* Thumbnail Preview */}
                <div style={{
                  width: '74px',
                  height: '74px',
                  borderRadius: '0.6rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                }}>
                  {!imageLoadFailed ? (
                    <img
                      src={formData.imageURL}
                      alt="Product Preview"
                      onError={() => setImageLoadFailed(true)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '1.5rem', opacity: 0.5 }}>⚠️</span>
                  )}
                </div>

                {/* Details & Actions */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{
                      fontSize: '0.725rem',
                      fontWeight: '700',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      backgroundColor: formData.googleDriveFileId
                        ? '#eff6ff'
                        : isFirebaseStorageUrl(formData.imageURL)
                          ? '#ecfdf5'
                          : '#eff6ff',
                      color: formData.googleDriveFileId
                        ? '#1d4ed8'
                        : isFirebaseStorageUrl(formData.imageURL)
                          ? '#047857'
                          : '#1d4ed8',
                      border: `1px solid ${formData.googleDriveFileId ? '#bfdbfe' : isFirebaseStorageUrl(formData.imageURL) ? '#a7f3d0' : '#bfdbfe'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}>
                      {formData.googleDriveFileId ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
                            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                          </svg>
                          <span>Google Drive Photo</span>
                        </>
                      ) : isFirebaseStorageUrl(formData.imageURL) ? (
                        '☁️ Cloud Storage'
                      ) : (
                        '🔗 Web Link'
                      )}
                    </span>
                    {imageLoadFailed && (
                      <span style={{ fontSize: '0.725rem', color: '#ef4444', fontWeight: '500' }}>Preview failed to load</span>
                    )}
                  </div>

                  {formData.googleDriveFileName && (
                    <p style={{ margin: '0 0 0.15rem 0', fontSize: '0.8rem', fontWeight: '700', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                      {formData.googleDriveFileName}
                    </p>
                  )}

                  {formData.googleDriveFileId ? (
                    <p style={{ margin: '0 0 0.45rem 0', fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                      Ref ID: {formData.googleDriveFileId}
                    </p>
                  ) : (
                    <p style={{
                      margin: '0 0 0.45rem 0',
                      fontSize: '0.775rem',
                      color: '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '300px',
                    }}>
                      {formData.imageURL}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    <button
                      type="button"
                      onClick={() => handleChooseFromGoogleDrive()}
                      disabled={isFormBusy}
                      style={{
                        padding: '0.35rem 0.65rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#0f172a',
                        borderRadius: '0.45rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: isFormBusy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                      onMouseEnter={(e) => { if (!isFormBusy) e.currentTarget.style.borderColor = '#1d4ed8'; }}
                      onMouseLeave={(e) => { if (!isFormBusy) e.currentTarget.style.borderColor = '#cbd5e1'; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
                        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                      </svg>
                      <span>Replace from Drive</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isFormBusy}
                      style={{
                        padding: '0.35rem 0.65rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#0f172a',
                        borderRadius: '0.45rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: isFormBusy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                      onMouseEnter={(e) => { if (!isFormBusy) e.currentTarget.style.borderColor = '#ea580c'; }}
                      onMouseLeave={(e) => { if (!isFormBusy) e.currentTarget.style.borderColor = '#cbd5e1'; }}
                    >
                      <span>🔄</span>
                      <span>From Device</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      disabled={isFormBusy}
                      style={{
                        padding: '0.35rem 0.65rem',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#b91c1c',
                        borderRadius: '0.45rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: isFormBusy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <span>🗑️</span>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* No Image Selected: Action Choices & Dropzone */
              <div>
                {/* Two Action Buttons: Google Drive + Device Upload */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.65rem',
                  marginBottom: '0.75rem',
                }}>
                  <button
                    type="button"
                    onClick={() => handleChooseFromGoogleDrive()}
                    disabled={isFormBusy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 0.85rem',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '0.65rem',
                      color: '#15803d',
                      fontSize: '0.825rem',
                      fontWeight: '700',
                      cursor: isFormBusy ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isFormBusy) {
                        e.currentTarget.style.backgroundColor = '#dcfce7';
                        e.currentTarget.style.borderColor = '#86efac';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isFormBusy) {
                        e.currentTarget.style.backgroundColor = '#f0fdf4';
                        e.currentTarget.style.borderColor = '#bbf7d0';
                      }
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
                      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                    </svg>
                    <span>Choose Image from Google Drive</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isFormBusy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 0.85rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '0.65rem',
                      color: '#0f172a',
                      fontSize: '0.825rem',
                      fontWeight: '600',
                      cursor: isFormBusy ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isFormBusy) {
                        e.currentTarget.style.borderColor = '#ea580c';
                        e.currentTarget.style.backgroundColor = '#fff7ed';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isFormBusy) {
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                      }
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>💻</span>
                    <span>Upload from Device</span>
                  </button>
                </div>

                {/* Drag & Drop Upload Dropzone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragOver ? '#ea580c' : '#cbd5e1'}`,
                    backgroundColor: isDragOver ? '#fff7ed' : '#f8fafc',
                    borderRadius: '0.75rem',
                    padding: '1.4rem 1rem',
                    textAlign: 'center',
                    cursor: isFormBusy ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.35rem', opacity: 0.85 }}>
                    📸
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.2rem' }}>
                    Click to browse device or drag & drop image file
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    JPG, JPEG, PNG, or WEBP &bull; Max 5MB
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginBottom: '0.4rem', fontWeight: '600' }}>
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              placeholder="Features, specifications, warranty, or installment terms..."
              style={{
                width: '100%',
                padding: '0.75rem 0.95rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '0.65rem',
                color: '#0f172a',
                fontSize: '0.9rem',
                resize: 'vertical',
                outline: 'none',
              }}
              onFocus={(e) => e.target.style.borderColor = '#ea580c'}
              onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* Modal Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isFormBusy}
              className="btn btn-secondary"
              style={{
                padding: '0.7rem 1.4rem',
                cursor: isFormBusy ? 'not-allowed' : 'pointer',
                opacity: isFormBusy ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isFormBusy}
              className="btn btn-orange"
              style={{
                padding: '0.7rem 1.75rem',
                cursor: isFormBusy ? 'not-allowed' : 'pointer',
                opacity: isFormBusy ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {uploading ? (
                <>
                  <span style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block'
                  }} />
                  <span>Uploading Image...</span>
                </>
              ) : loading ? (
                <>
                  <span style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block'
                  }} />
                  <span>Saving...</span>
                </>
              ) : (
                product ? 'Update Product' : 'Add Product'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Google Drive Configuration Modal */}
      {showDriveSetupModal && (
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
          padding: '1.25rem',
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '1rem',
            padding: '1.75rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1rem' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '0.65rem',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                  Connect Google Drive
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  Google OAuth 2.0 Web Client configuration
                </p>
              </div>
            </div>

            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.65rem',
              padding: '0.85rem 1rem',
              marginBottom: '1.25rem',
              fontSize: '0.8rem',
              color: '#334155',
              lineHeight: 1.5,
            }}>
              <p style={{ margin: '0 0 0.4rem 0', fontWeight: '700', color: '#0f172a' }}>
                Setup instructions (1-time):
              </p>
              <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
                <li>Open <strong>Google Cloud Console</strong> for your project (<code>project-karthi-b0f29</code>).</li>
                <li>Enable <strong>Google Picker API</strong> and <strong>Google Drive API</strong>.</li>
                <li>Under <strong>Credentials</strong>, create an <strong>OAuth 2.0 Client ID</strong> (Application type: <em>Web application</em>).</li>
                <li>Add Authorized JavaScript origin: <code>{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}</code></li>
                <li>Copy the Client ID and paste below. (You can also set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>client/.env</code>).</li>
              </ol>
            </div>

            <form onSubmit={handleSaveDriveConfig}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                  Google OAuth Client ID <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={setupClientIdInput}
                  onChange={(e) => setSetupClientIdInput(e.target.value)}
                  placeholder="e.g. 403319967428-xxxx.apps.googleusercontent.com"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem 0.9rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.55rem',
                    fontSize: '0.85rem',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => setShowDriveSetupModal(false)}
                  style={{
                    padding: '0.6rem 1.1rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.55rem',
                    color: '#475569',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!setupClientIdInput.trim()}
                  style={{
                    padding: '0.6rem 1.35rem',
                    backgroundColor: '#15803d',
                    border: 'none',
                    borderRadius: '0.55rem',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    cursor: !setupClientIdInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: !setupClientIdInput.trim() ? 0.6 : 1,
                  }}
                >
                  Save & Connect Drive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductModal;
