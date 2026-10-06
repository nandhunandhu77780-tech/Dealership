import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getAllOrders,
  updateOrderStatus,
  updateOrderDeliveryDetails,
  ORDER_STATUSES,
  DELIVERY_STATUSES,
  getNormalizedDeliveryStatus,
} from '../services/orderService.js';
import { logAdminActivity, ACTION_TYPES } from '../services/activityLogService.js';
import RejectOrderModal from './RejectOrderModal.jsx';
import CreateInstallmentModal from './CreateInstallmentModal.jsx';
import DeliveryTimeline from './DeliveryTimeline.jsx';
import { notifyDeliveryDateUpdated, notifyDeliveryStatusUpdated } from '../services/notificationService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage, getLocalDateString } from '../utils/formatters.js';

const OrderManagement = () => {
  const { currentUser, userProfile } = useAuth();
  const adminName = userProfile?.name || currentUser?.displayName || 'Administrator';
  const adminEmail = userProfile?.email || currentUser?.email || '';
  const adminId = currentUser?.uid || '';
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters and Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState(null);
  const [orderToReject, setOrderToReject] = useState(null);
  const [installmentOrder, setInstallmentOrder] = useState(null);

  // Delivery Edit States for Selected Order Modal
  const [deliveryStatusEdit, setDeliveryStatusEdit] = useState('Order Placed');
  const [expectedDeliveryDateEdit, setExpectedDeliveryDateEdit] = useState('');
  const [deliveryNoteEdit, setDeliveryNoteEdit] = useState('');
  const [deliverySaving, setDeliverySaving] = useState(false);

  // Sync delivery state whenever an order is selected
  useEffect(() => {
    if (selectedOrderForDetails) {
      setDeliveryStatusEdit(getNormalizedDeliveryStatus(selectedOrderForDetails));
      setExpectedDeliveryDateEdit(selectedOrderForDetails.expectedDeliveryDate || '');
      setDeliveryNoteEdit(selectedOrderForDetails.deliveryNote || '');
    }
  }, [selectedOrderForDetails]);

  // Notifications
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const handleSaveDeliveryDetails = async () => {
    if (!selectedOrderForDetails) return;
    setDeliverySaving(true);
    try {
      const orderId = selectedOrderForDetails.id;
      const oldDeliveryDate = selectedOrderForDetails.expectedDeliveryDate || null;
      const newDeliveryDate = expectedDeliveryDateEdit ? expectedDeliveryDateEdit.trim() : null;

      // Date notification logic: Send notification when date is set or changed; do not send duplicate for unchanged date
      const isDateChanged = Boolean(newDeliveryDate && newDeliveryDate !== oldDeliveryDate);
      const isDateAlreadyNotified = selectedOrderForDetails.lastNotifiedDeliveryDate === newDeliveryDate;
      const shouldNotifyDate = isDateChanged && !isDateAlreadyNotified;

      // Status notification logic: Send notification when admin changes status to Preparing, Out for Delivery, or Delivered
      const oldDeliveryStatus = selectedOrderForDetails.deliveryStatus || 'Order Placed';
      const newDeliveryStatus = deliveryStatusEdit;
      const validTrackedStages = ['Preparing', 'Out for Delivery', 'Delivered'];
      const isStatusChanged = newDeliveryStatus !== oldDeliveryStatus && validTrackedStages.includes(newDeliveryStatus);
      const isStatusAlreadyNotified = selectedOrderForDetails.lastNotifiedDeliveryStatus === newDeliveryStatus;
      const shouldNotifyStatus = isStatusChanged && !isStatusAlreadyNotified;

      const payload = {
        expectedDeliveryDate: newDeliveryDate,
        deliveryNote: deliveryNoteEdit,
        deliveryStatus: deliveryStatusEdit,
      };

      if (shouldNotifyDate) {
        payload.lastNotifiedDeliveryDate = newDeliveryDate;
      }
      if (shouldNotifyStatus) {
        payload.lastNotifiedDeliveryStatus = newDeliveryStatus;
      }

      const res = await updateOrderDeliveryDetails(orderId, payload);

      // Trigger delivery status in-app and push notification for the member
      let statusNotifDispatched = false;
      if (shouldNotifyStatus && selectedOrderForDetails.memberId) {
        try {
          const statusRes = await notifyDeliveryStatusUpdated({
            memberId: selectedOrderForDetails.memberId,
            memberName: selectedOrderForDetails.memberName,
            orderId,
            productName: selectedOrderForDetails.productName,
            deliveryStatus: newDeliveryStatus,
          });
          statusNotifDispatched = statusRes.created;
        } catch (stErr) {
          console.warn('Could not dispatch delivery status notification:', stErr);
        }
      }

      // Trigger delivery date in-app and push notification for the member
      let dateNotifDispatched = false;
      if (shouldNotifyDate && selectedOrderForDetails.memberId) {
        try {
          const notifRes = await notifyDeliveryDateUpdated({
            memberId: selectedOrderForDetails.memberId,
            memberName: selectedOrderForDetails.memberName,
            orderId,
            productName: selectedOrderForDetails.productName,
            deliveryDate: newDeliveryDate,
          });
          dateNotifDispatched = notifRes.created;
        } catch (notifErr) {
          console.warn('Could not dispatch delivery date notification:', notifErr);
        }
      }

      const updatedDeliveryFields = {
        expectedDeliveryDate: newDeliveryDate,
        deliveryNote: deliveryNoteEdit,
        deliveryStatus: deliveryStatusEdit,
        deliveredAt: res.deliveredAt || selectedOrderForDetails.deliveredAt,
        lastNotifiedDeliveryDate: shouldNotifyDate ? newDeliveryDate : selectedOrderForDetails.lastNotifiedDeliveryDate,
        lastNotifiedDeliveryStatus: shouldNotifyStatus ? newDeliveryStatus : selectedOrderForDetails.lastNotifiedDeliveryStatus,
        deliveryUpdatedAt: res.deliveryUpdatedAt || res.updatedAt,
        updatedAt: res.updatedAt,
      };

      // Update local orders array
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updatedDeliveryFields } : o))
      );

      // Update currently open details modal
      setSelectedOrderForDetails((prev) =>
        prev && prev.id === orderId ? { ...prev, ...updatedDeliveryFields } : prev
      );

      let successMsg = `Delivery details for Order #${orderId.slice(0, 8)} updated successfully!`;
      if (statusNotifDispatched && dateNotifDispatched) {
        successMsg = `Delivery stage ("${newDeliveryStatus}") & date updated! Customer notified.`;
      } else if (statusNotifDispatched) {
        successMsg = `Delivery stage updated to "${newDeliveryStatus}" & customer notified!`;
      } else if (dateNotifDispatched) {
        successMsg = `Expected delivery date updated & notification sent to ${selectedOrderForDetails.memberName || 'member'}!`;
      }

      showNotification(successMsg, 'success');

      // Safe activity log
      logAdminActivity({
        action: `Updated Delivery for Order #${orderId.slice(0, 8)} (${deliveryStatusEdit})`,
        actionType: ACTION_TYPES.ORDER_APPROVED,
        adminId,
        adminName,
        adminEmail,
        targetType: 'order',
        targetId: orderId,
        orderId,
        memberId: selectedOrderForDetails.memberId,
        memberName: selectedOrderForDetails.memberName,
        productId: selectedOrderForDetails.productId,
        productName: selectedOrderForDetails.productName,
        amount: parseFloat(selectedOrderForDetails.totalAmount) || 0,
        status: selectedOrderForDetails.status,
        details: `Updated delivery status to "${deliveryStatusEdit}"${newDeliveryDate ? `, Expected Delivery: ${newDeliveryDate}` : ''}${statusNotifDispatched || dateNotifDispatched ? ' (Notification sent to member)' : ''} for ${selectedOrderForDetails.memberName}`,
      });
    } catch (err) {
      console.error('Failed to update delivery details:', err);
      showNotification(sanitizeErrorMessage(err, 'Failed to update delivery details.'), 'error');
    } finally {
      setDeliverySaving(false);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await getAllOrders();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
      showNotification('Failed to fetch orders from Firestore.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanPhone = q.replace(/\D/g, '');
    return orders.filter((o) => {
      const oPhoneDigits = (o.memberPhone || '').replace(/\D/g, '');
      const matchesSearch =
        !q ||
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.memberName && o.memberName.toLowerCase().includes(q)) ||
        (o.memberPhone && o.memberPhone.toLowerCase().includes(q)) ||
        (cleanPhone && oPhoneDigits.includes(cleanPhone)) ||
        (o.memberCode && o.memberCode.toLowerCase().includes(q)) ||
        (o.memberId && o.memberId.toLowerCase().includes(q)) ||
        (o.memberEmail && o.memberEmail.toLowerCase().includes(q)) ||
        (o.productName && o.productName.toLowerCase().includes(q)) ||
        (o.deliveryStatus && o.deliveryStatus.toLowerCase().includes(q)) ||
        (o.expectedDeliveryDate && o.expectedDeliveryDate.includes(q)) ||
        (o.deliveryNote && o.deliveryNote.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const handleStatusChange = async (order, nextStatus) => {
    if (order.status === nextStatus) return;

    if (nextStatus === 'rejected') {
      // Prompt confirmation before rejecting (Requirement 14)
      setOrderToReject(order);
      return;
    }

    setActionLoading(true);
    try {
      await updateOrderStatus(order.id, nextStatus);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() }
            : o
        )
      );

      if (nextStatus === 'approved') {
        showNotification(
          `Order #${order.id.slice(0, 8)} approved. Product stock reduced by ${order.quantity} unit(s).`,
          'success'
        );
      } else {
        showNotification(
          `Order #${order.id.slice(0, 8)} status updated to ${nextStatus.toUpperCase()}.`,
          'success'
        );
      }

      // Safe activity log
      logAdminActivity({
        action: `${nextStatus === 'approved' ? 'Approved' : nextStatus === 'completed' ? 'Completed' : 'Updated'} Order #${order.id.slice(0, 8)}`,
        actionType: nextStatus === 'approved'
          ? ACTION_TYPES.ORDER_APPROVED
          : nextStatus === 'completed'
          ? ACTION_TYPES.ORDER_COMPLETED
          : ACTION_TYPES.ORDER_APPROVED,
        adminId,
        adminName,
        adminEmail,
        targetType: 'order',
        targetId: order.id,
        orderId: order.id,
        memberId: order.memberId,
        memberName: order.memberName,
        productId: order.productId,
        productName: order.productName,
        amount: parseFloat(order.totalAmount) || 0,
        status: nextStatus,
        details: `${nextStatus === 'approved' ? 'Approved purchase order' : `Updated order status to ${nextStatus}`} for ${order.memberName} (${order.productName}, Qty: ${order.quantity})`,
      });
    } catch (err) {
      console.error('Failed to update order status:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async (orderId) => {
    setActionLoading(true);
    const targetOrder = orderToReject || orders.find((o) => o.id === orderId);
    try {
      await updateOrderStatus(orderId, 'rejected');
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: 'rejected', updatedAt: new Date().toISOString() }
            : o
        )
      );
      showNotification(`Order #${orderId.slice(0, 8)} has been rejected.`, 'success');

      // Safe activity log
      if (targetOrder) {
        logAdminActivity({
          action: `Rejected Order #${orderId.slice(0, 8)}`,
          actionType: ACTION_TYPES.ORDER_REJECTED,
          adminId,
          adminName,
          adminEmail,
          targetType: 'order',
          targetId: orderId,
          orderId: orderId,
          memberId: targetOrder.memberId,
          memberName: targetOrder.memberName,
          productId: targetOrder.productId,
          productName: targetOrder.productName,
          amount: parseFloat(targetOrder.totalAmount) || 0,
          status: 'rejected',
          details: `Rejected purchase order for ${targetOrder.memberName} (${targetOrder.productName})`,
        });
      }

      setOrderToReject(null);
    } catch (err) {
      console.error('Failed to reject order:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const formatPrice = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

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
          icon: '⏱',
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

  // Quick statistics
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const approvedCount = orders.filter((o) => o.status === 'approved').length;
  const completedCount = orders.filter((o) => o.status === 'completed').length;
  const rejectedCount = orders.filter((o) => o.status === 'rejected').length;

  return (
    <section style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '1.25rem',
      padding: '2rem',
      marginTop: '1.5rem',
      boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
    }}>
      {/* Header and Summary */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Orders & Purchases
            </h2>
            <span style={{
              backgroundColor: '#fff7ed',
              color: '#ea580c',
              border: '1px solid #fed7aa',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: '700',
            }}>
              {orders.length} total
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.35rem', marginBottom: 0 }}>
            Review purchase requests, approve inventory deductions, and configure installment plans
          </p>
        </div>

        <button
          type="button"
          onClick={loadOrders}
          disabled={loading || actionLoading}
          className="btn btn-secondary"
          style={{
            padding: '0.55rem 1rem',
            fontSize: '0.85rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>↻</span> Refresh Orders
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          backgroundColor: '#fff7ed',
          padding: '1rem 1.15rem',
          borderRadius: '0.75rem',
          border: '1px solid #fed7aa',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#9a3412', display: 'block', fontWeight: '600' }}>Pending Orders</span>
          <strong style={{ fontSize: '1.4rem', color: '#ea580c' }}>{pendingCount}</strong>
        </div>

        <div style={{
          backgroundColor: '#eff6ff',
          padding: '1rem 1.15rem',
          borderRadius: '0.75rem',
          border: '1px solid #bfdbfe',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#1e40af', display: 'block', fontWeight: '600' }}>Approved</span>
          <strong style={{ fontSize: '1.4rem', color: '#1d4ed8' }}>{approvedCount}</strong>
        </div>

        <div style={{
          backgroundColor: '#ecfdf5',
          padding: '1rem 1.15rem',
          borderRadius: '0.75rem',
          border: '1px solid #a7f3d0',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#065f46', display: 'block', fontWeight: '600' }}>Completed</span>
          <strong style={{ fontSize: '1.4rem', color: '#047857' }}>{completedCount}</strong>
        </div>

        <div style={{
          backgroundColor: '#fef2f2',
          padding: '1rem 1.15rem',
          borderRadius: '0.75rem',
          border: '1px solid #fecaca',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#991b1b', display: 'block', fontWeight: '600' }}>Rejected</span>
          <strong style={{ fontSize: '1.4rem', color: '#dc2626' }}>{rejectedCount}</strong>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div style={{
          backgroundColor: notification.type === 'error' ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          color: notification.type === 'error' ? '#b91c1c' : '#047857',
          padding: '0.85rem 1.15rem',
          borderRadius: '0.75rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Search and Filters */}
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
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
          <span style={{
            position: 'absolute',
            left: '0.85rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            fontSize: '0.95rem',
          }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name, Mobile Number, Member ID, or Order #..."
            style={{
              width: '100%',
              padding: '0.65rem 2rem 0.65rem 2.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.55rem',
              color: '#0f172a',
              fontSize: '0.875rem',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#ea580c'}
            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
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

        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {['all', 'pending', 'approved', 'completed', 'rejected'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '0.45rem',
                border: '1px solid',
                borderColor: statusFilter === st ? '#ea580c' : '#e2e8f0',
                backgroundColor: statusFilter === st ? '#ea580c' : '#ffffff',
                color: statusFilter === st ? '#ffffff' : '#64748b',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.15s ease',
              }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
          <div style={{
            width: '36px',
            height: '36px',
            border: '3px solid #fed7aa',
            borderTopColor: '#ea580c',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 1rem',
          }} />
          <p style={{ fontWeight: '500' }}>Loading orders from Firestore...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        /* Empty State */
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
          <h3 style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '700', marginBottom: '0.4rem' }}>
            {searchQuery || statusFilter !== 'all' ? 'No matching orders found' : 'No orders recorded yet'}
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            {searchQuery || statusFilter !== 'all'
              ? 'Try resetting your search query or status filter.'
              : 'Orders submitted by authenticated members will appear here in real-time.'}
          </p>
          {(searchQuery || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="btn btn-secondary"
              style={{
                padding: '0.55rem 1.15rem',
                fontSize: '0.85rem',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        /* Orders Table */
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table
            className="responsive-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.9rem',
            }}
          >
            <thead>
              <tr style={{
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                color: '#64748b',
                fontSize: '0.775rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: '700',
              }}>
                <th style={{ padding: '0.9rem 1rem' }}>Order ID</th>
                <th style={{ padding: '0.9rem 1rem' }}>Member</th>
                <th style={{ padding: '0.9rem 1rem' }}>Product</th>
                <th style={{ padding: '0.9rem 1rem' }}>Qty</th>
                <th style={{ padding: '0.9rem 1rem' }}>Total Amount</th>
                <th style={{ padding: '0.9rem 1rem' }}>Date</th>
                <th style={{ padding: '0.9rem 1rem' }}>Order Status</th>
                <th style={{ padding: '0.9rem 1rem' }}>Delivery Tracking</th>
                <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>Actions</th>
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
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    {/* Order ID */}
                    <td data-label="Order ID" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                      <code style={{
                        color: '#ea580c',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        backgroundColor: '#fff7ed',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.35rem',
                        border: '1px solid #fed7aa',
                      }}>
                        #{order.id.slice(0, 8)}
                      </code>
                    </td>

                    {/* Customer Name & Mobile */}
                    <td data-label="Customer" style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '800', color: '#0a2540', fontSize: '0.95rem' }}>
                        {order.memberName || 'Member'}
                      </div>
                      {order.memberPhone ? (
                        <div style={{ marginTop: '0.2rem' }}>
                          <a
                            href={`tel:${order.memberPhone}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.5rem',
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #86efac',
                              borderRadius: '0.4rem',
                              color: '#065f46',
                              fontSize: '0.825rem',
                              fontWeight: '700',
                              textDecoration: 'none',
                            }}
                          >
                            <span>📞</span> {order.memberPhone}
                          </a>
                        </div>
                      ) : null}
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                        {order.memberCode ? <span style={{ color: '#ea580c', fontWeight: '600', marginRight: '0.4rem' }}>{order.memberCode}</span> : null}
                        {order.memberEmail ? <span>{order.memberEmail}</span> : null}
                      </div>
                    </td>

                    {/* Product */}
                    <td data-label="Product" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '0.5rem',
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
                        <div style={{ fontWeight: '700', color: '#0f172a' }}>
                          {order.productName}
                        </div>
                      </div>
                    </td>

                    {/* Quantity */}
                    <td data-label="Qty" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#0f172a', fontWeight: '600' }}>
                        {order.quantity}
                      </span>
                    </td>

                    {/* Total Amount */}
                    <td data-label="Total Amount" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                      <strong style={{ color: '#047857', fontSize: '1rem', fontWeight: '800' }}>
                        {formatINR(order.totalAmount)}
                      </strong>
                    </td>

                    {/* Date */}
                    <td data-label="Date" style={{ padding: '1rem', whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.825rem' }}>
                      {formatIndianDate(order.createdAt)}
                    </td>

                    {/* Order Status Badge */}
                    <td data-label="Order Status" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        textTransform: 'uppercase',
                      }}>
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </span>
                    </td>

                    {/* Delivery Tracking */}
                    <td data-label="Delivery Tracking" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                      <div>
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
                        <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#64748b' }}>
                          {delStatus === 'Delivered' ? (
                            <span style={{ color: '#047857', fontWeight: '700' }}>✓ Delivered</span>
                          ) : order.expectedDeliveryDate ? (
                            <span style={{ color: '#ea580c', fontWeight: '700' }}>
                              📅 {formatIndianDate(order.expectedDeliveryDate)}
                            </span>
                          ) : order.status === 'approved' ? (
                            <span style={{ color: '#c2410c', fontStyle: 'italic' }}>⏱ Date pending</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Pending approval</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Actions */}
                    <td data-label="Actions" style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Status Select Menu */}
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusChange(order, e.target.value)}
                          disabled={actionLoading}
                          style={{
                            padding: '0.4rem 0.65rem',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            borderRadius: '0.4rem',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#0f172a',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="completed">Completed</option>
                          <option value="rejected">Rejected</option>
                        </select>

                        {/* View Full Details Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedOrderForDetails(order)}
                          style={{
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            borderRadius: '0.4rem',
                            border: '1px solid #bfdbfe',
                            backgroundColor: '#eff6ff',
                            color: '#1d4ed8',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dbeafe'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                        >
                          Details
                        </button>

                        {/* Create Installment Plan Action (Approved orders only - Requirement 2 & 3) */}
                        {order.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => setInstallmentOrder(order)}
                            title="Create Installment Plan"
                            className="btn btn-orange"
                            style={{
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.8rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span>💳</span> Plan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin Order Details Modal */}
      {selectedOrderForDetails && (
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
          zIndex: 1100,
          padding: '1.25rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '680px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1.25rem',
            padding: '2rem',
            boxShadow: '0 20px 45px -10px rgba(10, 37, 64, 0.25)',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid #f1f5f9',
            }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Order Inspection
                </h3>
                <code style={{ fontSize: '0.825rem', color: '#ea580c', fontWeight: '700' }}>
                  #{selectedOrderForDetails.id}
                </code>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetails(null)}
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
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {/* Member & Order Info */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '1.25rem',
              padding: '1.15rem',
              backgroundColor: '#f8fafc',
              borderRadius: '0.75rem',
              border: '1px solid #e2e8f0',
            }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Customer Name</span>
                <strong style={{ color: '#0a2540', fontSize: '1rem', fontWeight: '800' }}>{selectedOrderForDetails.memberName}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#047857', display: 'block', fontWeight: '700' }}>Mobile Number</span>
                {selectedOrderForDetails.memberPhone ? (
                  <a
                    href={`tel:${selectedOrderForDetails.memberPhone}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      color: '#065f46',
                      fontWeight: '800',
                      fontSize: '0.95rem',
                      textDecoration: 'none',
                    }}
                  >
                    <span>📞</span> {selectedOrderForDetails.memberPhone}
                  </a>
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No mobile recorded</span>
                )}
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Account Email (Secondary)</span>
                <span style={{ color: '#475569', fontSize: '0.85rem' }}>{selectedOrderForDetails.memberEmail || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Order Date</span>
                <span style={{ color: '#334155', fontSize: '0.85rem', fontWeight: '500' }}>{formatDate(selectedOrderForDetails.createdAt)}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Current Status</span>
                <span style={{
                  display: 'inline-block',
                  marginTop: '0.2rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  backgroundColor: getStatusBadge(selectedOrderForDetails.status).bg,
                  color: getStatusBadge(selectedOrderForDetails.status).color,
                  border: `1px solid ${getStatusBadge(selectedOrderForDetails.status).border}`,
                }}>
                  {selectedOrderForDetails.status}
                </span>
              </div>
            </div>

            {/* Product Breakdown */}
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              border: '1px solid #e2e8f0',
              padding: '1.15rem',
              marginBottom: '1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: '600' }}>Item</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
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
                  }}>
                    {selectedOrderForDetails.productImageURL ? (
                      <img
                        src={selectedOrderForDetails.productImageURL}
                        alt={selectedOrderForDetails.productName}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.parentElement) e.target.parentElement.innerHTML = '📦';
                        }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: '1rem', opacity: 0.6 }}>📦</span>
                    )}
                  </div>
                  <strong style={{ color: '#0f172a' }}>{selectedOrderForDetails.productName}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Unit Price</span>
                <span style={{ color: '#0f172a', fontWeight: '600' }}>₹{formatPrice(selectedOrderForDetails.unitPrice)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Quantity Requested</span>
                <span style={{ color: '#0f172a', fontWeight: '700' }}>{selectedOrderForDetails.quantity} unit(s)</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '0.65rem',
                borderTop: '1px solid #e2e8f0',
              }}>
                <strong style={{ color: '#0f172a' }}>Total Order Value</strong>
                <strong style={{ color: '#047857', fontSize: '1.2rem', fontWeight: '800' }}>
                  ₹{formatPrice(selectedOrderForDetails.totalAmount)}
                </strong>
              </div>
            </div>

            {/* Address */}
            <div style={{ marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.35rem', fontWeight: '600' }}>
                Delivery Address
              </span>
              <div style={{
                padding: '0.85rem 1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '0.65rem',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: '0.875rem',
                lineHeight: '1.5',
              }}>
                {selectedOrderForDetails.address}
              </div>
            </div>

            {/* Note */}
            {selectedOrderForDetails.note && (
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '0.35rem', fontWeight: '600' }}>
                  Customer Note
                </span>
                <div style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '0.65rem',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: '0.875rem',
                  fontStyle: 'italic',
                }}>
                  "{selectedOrderForDetails.note}"
                </div>
              </div>
            )}

            {/* Delivery Tracking Section */}
            <div style={{
              marginTop: '1rem',
              marginBottom: '1.5rem',
              padding: '1.25rem',
              backgroundColor: '#ffffff',
              borderRadius: '1rem',
              border: '2px solid #bfdbfe',
              boxShadow: '0 4px 14px rgba(29, 78, 216, 0.08)',
            }}>
              {/* Section Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>🚚</span>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0a2540' }}>
                      Delivery Tracking
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Manage delivery status stages, expected delivery date, and customer notes
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    backgroundColor: getDeliveryStatusBadge(deliveryStatusEdit).bg,
                    color: getDeliveryStatusBadge(deliveryStatusEdit).color,
                    border: `1px solid ${getDeliveryStatusBadge(deliveryStatusEdit).border}`,
                  }}>
                    <span>{getDeliveryStatusBadge(deliveryStatusEdit).icon}</span>
                    <span>{deliveryStatusEdit}</span>
                  </span>
                </div>
              </div>

              {/* Delivery Tracking Details Summary Cards (Required 4 items) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.25rem',
              }}>
                {/* 1. Expected Delivery Date */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.6rem',
                  padding: '0.75rem 0.85rem',
                }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'block',
                    marginBottom: '0.25rem',
                  }}>
                    Expected Delivery Date
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.95rem' }}>📅</span>
                    <strong style={{
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      color: selectedOrderForDetails.expectedDeliveryDate ? '#ea580c' : '#c2410c',
                    }}>
                      {selectedOrderForDetails.expectedDeliveryDate
                        ? formatIndianDate(selectedOrderForDetails.expectedDeliveryDate)
                        : 'Delivery date will be updated soon.'}
                    </strong>
                  </div>
                </div>

                {/* 2. Current Delivery Status */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.6rem',
                  padding: '0.75rem 0.85rem',
                }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'block',
                    marginBottom: '0.25rem',
                  }}>
                    Current Delivery Status
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.95rem' }}>{getDeliveryStatusBadge(selectedOrderForDetails.deliveryStatus || 'Order Placed').icon}</span>
                    <strong style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0a2540' }}>
                      {selectedOrderForDetails.deliveryStatus || 'Order Placed'}
                    </strong>
                  </div>
                </div>

                {/* 3. Delivery Note */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.6rem',
                  padding: '0.75rem 0.85rem',
                }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'block',
                    marginBottom: '0.25rem',
                  }}>
                    Delivery Note
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#334155', fontSize: '0.825rem' }}>
                    <span>📝</span>
                    <span style={{
                      fontWeight: selectedOrderForDetails.deliveryNote ? '600' : '400',
                      fontStyle: selectedOrderForDetails.deliveryNote ? 'normal' : 'italic',
                      color: selectedOrderForDetails.deliveryNote ? '#0f172a' : '#94a3b8',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '180px',
                    }}>
                      {selectedOrderForDetails.deliveryNote ? `"${selectedOrderForDetails.deliveryNote}"` : 'None added'}
                    </span>
                  </div>
                </div>

                {/* 4. Last Updated Date/Time */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.6rem',
                  padding: '0.75rem 0.85rem',
                }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: '800',
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'block',
                    marginBottom: '0.25rem',
                  }}>
                    Last Updated Date/Time
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#334155' }}>
                    <span style={{ fontSize: '0.95rem' }}>🕒</span>
                    <strong style={{ fontSize: '0.825rem', fontWeight: '700' }}>
                      {formatIndianDate(selectedOrderForDetails.deliveryUpdatedAt || selectedOrderForDetails.updatedAt || selectedOrderForDetails.createdAt, true)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Delivery Timeline Live Preview */}
              <div style={{ marginBottom: '1.25rem' }}>
                <DeliveryTimeline
                  deliveryStatus={deliveryStatusEdit}
                  orderStatus={selectedOrderForDetails.status}
                  expectedDeliveryDate={expectedDeliveryDateEdit}
                  deliveryNote={deliveryNoteEdit}
                  deliveredAt={selectedOrderForDetails.deliveredAt}
                  deliveryUpdatedAt={selectedOrderForDetails.deliveryUpdatedAt || selectedOrderForDetails.updatedAt}
                  showDetailsCard={false}
                />
              </div>

              {/* Admin Delivery Controls: Available when order is approved or completed */}
              {selectedOrderForDetails.status === 'approved' || selectedOrderForDetails.status === 'completed' ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  backgroundColor: '#f8fafc',
                  padding: '1.15rem',
                  borderRadius: '0.75rem',
                  border: '1px solid #e2e8f0',
                }}>
                  {/* Delivery Stage Update Buttons (Preparing, Out for Delivery, Delivered) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#0a2540', marginBottom: '0.45rem' }}>
                      Update Delivery Status:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginBottom: '0.75rem' }}>
                      {[
                        { status: 'Preparing', icon: '📦', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', desc: 'Packing & preparing' },
                        { status: 'Out for Delivery', icon: '🚚', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', desc: 'On the way to member' },
                        { status: 'Delivered', icon: '🏠', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0', desc: 'Handed over to member' },
                      ].map((item) => {
                        const isSelected = deliveryStatusEdit === item.status;
                        return (
                          <button
                            key={item.status}
                            type="button"
                            onClick={() => setDeliveryStatusEdit(item.status)}
                            disabled={deliverySaving}
                            style={{
                              padding: '0.65rem 0.75rem',
                              borderRadius: '0.6rem',
                              border: isSelected ? `2.5px solid ${item.color}` : `1px solid ${item.border}`,
                              backgroundColor: isSelected ? item.bg : '#ffffff',
                              color: isSelected ? item.color : '#334155',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              gap: '0.2rem',
                              boxShadow: isSelected ? `0 2px 8px ${item.border}` : '0 1px 2px rgba(0,0,0,0.04)',
                              transition: 'all 0.15s ease',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                              {isSelected && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  fontWeight: '800',
                                  backgroundColor: item.color,
                                  color: '#ffffff',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '9999px',
                                }}>
                                  Selected
                                </span>
                              )}
                            </div>
                            <strong style={{ fontSize: '0.85rem', fontWeight: '800' }}>
                              {item.status}
                            </strong>
                            <span style={{ fontSize: '0.675rem', color: isSelected ? item.color : '#64748b' }}>
                              {item.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* All Stages Selector (Allows adjusting or reverting to Order Placed / Approved if needed) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>
                        Or select any stage:
                      </span>
                      <select
                        value={deliveryStatusEdit}
                        onChange={(e) => setDeliveryStatusEdit(e.target.value)}
                        disabled={deliverySaving}
                        style={{
                          padding: '0.4rem 0.7rem',
                          borderRadius: '0.4rem',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {DELIVERY_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row: Expected Delivery Date & Shortcuts */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#0a2540', marginBottom: '0.35rem' }}>
                      Expected Delivery Date
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <input
                        type="date"
                        value={expectedDeliveryDateEdit}
                        onChange={(e) => setExpectedDeliveryDateEdit(e.target.value)}
                        disabled={deliverySaving}
                        style={{
                          flex: '1 1 200px',
                          padding: '0.55rem 0.8rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          outline: 'none',
                        }}
                      />
                      {/* Date Preset Buttons */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {[
                          { label: 'Today', days: 0 },
                          { label: '+2 Days', days: 2 },
                          { label: '+5 Days', days: 5 },
                          { label: '+1 Week', days: 7 },
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + btn.days);
                              setExpectedDeliveryDateEdit(getLocalDateString(d));
                            }}
                            disabled={deliverySaving}
                            style={{
                              padding: '0.3rem 0.55rem',
                              borderRadius: '0.35rem',
                              border: '1px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              color: '#334155',
                              fontSize: '0.725rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                            }}
                          >
                            {btn.label}
                          </button>
                        ))}
                        {expectedDeliveryDateEdit && (
                          <button
                            type="button"
                            onClick={() => setExpectedDeliveryDateEdit('')}
                            disabled={deliverySaving}
                            style={{
                              padding: '0.3rem 0.55rem',
                              borderRadius: '0.35rem',
                              border: '1px solid #fca5a5',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              fontSize: '0.725rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                            }}
                          >
                            ✕ Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                      {expectedDeliveryDateEdit
                        ? `Customer will see: 📅 ${formatIndianDate(expectedDeliveryDateEdit)}`
                        : 'Leave blank to display: “Delivery date will be updated soon.”'}
                    </span>
                  </div>

                  {/* Delivery Note */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#0a2540', marginBottom: '0.35rem' }}>
                      Delivery Note
                    </label>
                    <textarea
                      rows={2}
                      value={deliveryNoteEdit}
                      onChange={(e) => setDeliveryNoteEdit(e.target.value)}
                      placeholder="e.g. Dispatched via parcel / Arriving with delivery agent / Arriving Thursday between 3-6 PM"
                      disabled={deliverySaving}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.85rem',
                        lineHeight: 1.4,
                        outline: 'none',
                        resize: 'vertical',
                      }}
                    />
                    <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem', display: 'block' }}>
                      This note will be shown to the customer in My Orders and Order Details.
                    </span>
                  </div>

                  {/* Save Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={handleSaveDeliveryDetails}
                      disabled={deliverySaving}
                      className="btn btn-primary"
                      style={{
                        padding: '0.6rem 1.4rem',
                        fontSize: '0.875rem',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        backgroundColor: '#1d4ed8',
                        boxShadow: '0 2px 6px rgba(29, 78, 216, 0.25)',
                      }}
                    >
                      {deliverySaving ? (
                        <>
                          <span className="spinner-sm" /> Saving Delivery Tracking...
                        </>
                      ) : (
                        <>
                          <span>💾</span> Save Delivery Tracking
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : selectedOrderForDetails.status === 'pending' ? (
                /* Pending Order Notice */
                <div style={{
                  backgroundColor: '#fff7ed',
                  border: '1px solid #fed7aa',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}>
                  <div>
                    <strong style={{ color: '#9a3412', fontSize: '0.875rem', display: 'block' }}>
                      Order is currently pending approval
                    </strong>
                    <span style={{ color: '#c2410c', fontSize: '0.8rem' }}>
                      Approve this order to set the expected delivery date and manage fulfillment stages.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedOrderForDetails, 'approved')}
                    disabled={actionLoading}
                    className="btn btn-orange btn-sm"
                    style={{
                      padding: '0.45rem 1rem',
                      fontSize: '0.825rem',
                      fontWeight: '800',
                    }}
                  >
                    ✓ Approve Order Now
                  </button>
                </div>
              ) : (
                /* Rejected Order Notice */
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.75rem',
                  padding: '0.85rem 1rem',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                }}>
                  This order was rejected. Delivery scheduling is unavailable.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              {selectedOrderForDetails.status === 'approved' && (
                <button
                  type="button"
                  onClick={() => {
                    const ord = selectedOrderForDetails;
                    setSelectedOrderForDetails(null);
                    setInstallmentOrder(ord);
                  }}
                  className="btn btn-orange"
                  style={{
                    padding: '0.65rem 1.25rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <span>💳</span> Create Installment Plan
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedOrderForDetails(null)}
                className="btn btn-secondary"
                style={{
                  padding: '0.65rem 1.35rem',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Installment Modal for Approved Orders */}
      <CreateInstallmentModal
        isOpen={Boolean(installmentOrder)}
        order={installmentOrder}
        onClose={() => setInstallmentOrder(null)}
        onPlanCreated={(newPlan) => {
          setInstallmentOrder(null);
          showNotification(
            `Installment plan created for Order #${newPlan.orderId.slice(0, 8)}! Check the Installments tab.`,
            'success'
          );
        }}
      />

      {/* Reject Confirmation Modal */}
      <RejectOrderModal
        isOpen={Boolean(orderToReject)}
        onClose={() => setOrderToReject(null)}
        onConfirm={handleConfirmReject}
        order={orderToReject}
        loading={actionLoading}
      />
    </section>
  );
};

export default OrderManagement;
