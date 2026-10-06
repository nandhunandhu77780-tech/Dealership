import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getAllInstallmentPlans,
  calculateTotalPaid,
  calculateBalanceAmount,
} from '../services/installmentService.js';
import { getMembers } from '../services/memberService.js';
import {
  recordInstallmentPayment,
  formatDateToISO,
  PAYMENT_METHODS,
} from '../services/paymentService.js';
import { logAdminActivity, ACTION_TYPES } from '../services/activityLogService.js';
import PaymentReceiptModal from './PaymentReceiptModal.jsx';
import {
  formatINR,
  formatIndianDate,
  sanitizeErrorMessage,
  getLocalDateString,
  getOverdueDays,
  getInstallmentRemainingAmount,
  getInstallmentStatus,
  enrichInstallment,
} from '../utils/formatters.js';

const DailyCollectionManagement = () => {
  const { currentUser, userProfile } = useAuth();

  const [plans, setPlans] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'due_today' | 'overdue' | 'upcoming'

  // Collection Modal States
  const [selectedItemForCollection, setSelectedItemForCollection] = useState(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentDate, setPaymentDate] = useState(formatDateToISO(new Date()));
  const [collectionNote, setCollectionNote] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [recordedPaymentResult, setRecordedPaymentResult] = useState(null);

  // Receipt Modal State
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Global Notification Banner
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [plansRes, membersRes] = await Promise.all([
        getAllInstallmentPlans(),
        getMembers(),
      ]);
      setPlans(plansRes || []);
      setMembers(membersRes || []);
    } catch (err) {
      console.error('Failed to load collection data:', err);
      setError(sanitizeErrorMessage(err, 'Failed to load active installment collection data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Today's date string YYYY-MM-DD in the user's local timezone
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);

  // Process and link active installment plans with member profiles and dynamic installment status
  const collectionItems = useMemo(() => {
    const list = [];

    // Create lookup map for members by userId, email, and doc ID
    const memberMap = new Map();
    members.forEach((m) => {
      if (m.userId) memberMap.set(m.userId, m);
      if (m.id) memberMap.set(m.id, m);
      if (m.memberId) memberMap.set(m.memberId, m);
      if (m.email) memberMap.set(m.email.toLowerCase(), m);
    });

    plans.forEach((plan) => {
      const planStatus = (plan.status || '').toLowerCase();
      if (planStatus === 'completed') return;

      const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
      if (schedule.length === 0) return;

      // Dynamically enrich all installments on this plan with computed status based on current date & payment data
      const enrichedSchedule = schedule.map((s) => enrichInstallment(s, todayStr));

      // Filter unpaid installments (remaining amount > 0). Paid installments NEVER appear as overdue.
      const unpaidInstallments = enrichedSchedule.filter((s) => s.remainingAmount > 0);
      if (unpaidInstallments.length === 0) return;

      // Group unpaid installments by computed dynamic status
      const overdueInstallments = unpaidInstallments.filter((s) => s.status === 'Overdue');
      const dueTodayInstallments = unpaidInstallments.filter((s) => s.status === 'Due Today');
      const upcomingInstallments = unpaidInstallments.filter((s) => s.status === 'Upcoming');

      // Resolve member details
      const matchedMember =
        memberMap.get(plan.memberId) ||
        (plan.memberEmail ? memberMap.get(plan.memberEmail.toLowerCase()) : null) ||
        null;

      const memberName = plan.memberName || matchedMember?.name || 'Member';
      const memberId = matchedMember?.memberId || plan.memberId || 'N/A';
      const phone = matchedMember?.phone || plan.memberPhone || '';
      const address = matchedMember?.address || plan.address || '';

      // Determine which installments for this plan should appear in the collection list:
      // 1. If there are overdue or due today installments, include all overdue installments and due today installments
      // 2. Otherwise, include the next upcoming installment
      const targetInstallments =
        overdueInstallments.length > 0 || dueTodayInstallments.length > 0
          ? [...overdueInstallments, ...dueTodayInstallments]
          : upcomingInstallments.length > 0
          ? [upcomingInstallments[0]]
          : [];

      targetInstallments.forEach((inst) => {
        list.push({
          plan,
          planId: plan.id,
          orderId: plan.orderId,
          productName: plan.productName || 'Product',
          frequency: plan.frequency || 'Monthly',
          memberName,
          memberId,
          phone,
          address,
          nextInstallmentNumber: inst.installmentNumber,
          totalInstallments: plan.numberOfInstallments || schedule.length,
          dueDate: inst.dueDate,
          installmentAmount: parseFloat(inst.amount) || 0,
          paidAmount: parseFloat(inst.paidAmount) || 0,
          remainingAmount: inst.remainingAmount,
          planTotalRemaining: calculateBalanceAmount(plan),
          planTotalPaid: calculateTotalPaid(plan),
          status: inst.status, // 'Paid' | 'Due Today' | 'Upcoming' | 'Overdue'
          overdueDays: inst.overdueDays,
          isOverdue: inst.isOverdue,
          isDueToday: inst.isDueToday,
        });
      });
    });

    // Sort priority: Overdue first (descending by overdue days: longest overdue first), then Due Today, then Upcoming (ascending by date)
    return list.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isOverdue && b.isOverdue) return b.overdueDays - a.overdueDays;
      if (a.isDueToday && !b.isDueToday) return -1;
      if (!a.isDueToday && b.isDueToday) return 1;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
  }, [plans, members, todayStr]);

  // Counts for tabs & summary
  const counts = useMemo(() => {
    let dueTodayCount = 0;
    let dueTodayAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let totalActiveCount = collectionItems.length;
    let totalPendingAmount = 0;

    collectionItems.forEach((item) => {
      totalPendingAmount += item.remainingAmount;
      if (item.isDueToday) {
        dueTodayCount++;
        dueTodayAmount += item.remainingAmount;
      } else if (item.isOverdue) {
        overdueCount++;
        overdueAmount += item.remainingAmount;
      }
    });

    const upcomingCount = totalActiveCount - dueTodayCount - overdueCount;

    return {
      all: totalActiveCount,
      due_today: dueTodayCount,
      dueTodayAmount,
      overdue: overdueCount,
      overdueAmount,
      upcoming: Math.max(0, upcomingCount),
      totalPendingAmount,
    };
  }, [collectionItems]);

  // Filtered and Searched items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return collectionItems.filter((item) => {
      // 1. Status Filter
      if (statusFilter === 'due_today' && !item.isDueToday) return false;
      if (statusFilter === 'overdue' && !item.isOverdue) return false;
      if (statusFilter === 'upcoming' && (item.isOverdue || item.isDueToday)) return false;

      // 2. Search Query (Name, Member ID, Mobile Number, Product)
      if (q) {
        const cleanPhone = q.replace(/\D/g, '');
        const itemCleanPhone = (item.phone || '').replace(/\D/g, '');
        const matchesName = item.memberName && item.memberName.toLowerCase().includes(q);
        const matchesMemberId = item.memberId && item.memberId.toLowerCase().includes(q);
        const matchesPhone =
          (item.phone && item.phone.toLowerCase().includes(q)) ||
          (cleanPhone && itemCleanPhone.includes(cleanPhone));
        const matchesProduct = item.productName && item.productName.toLowerCase().includes(q);
        return matchesName || matchesMemberId || matchesPhone || matchesProduct;
      }

      return true;
    });
  }, [collectionItems, statusFilter, searchQuery]);

  // Open Collection Modal
  const handleOpenCollectionModal = (item) => {
    setSelectedItemForCollection(item);
    setCollectAmount(item.remainingAmount.toString());
    setPaymentMethod('Cash');
    setPaymentDate(formatDateToISO(new Date()));
    setCollectionNote('');
    setModalError('');
    setRecordedPaymentResult(null);
  };

  // Close Collection Modal
  const handleCloseCollectionModal = () => {
    setSelectedItemForCollection(null);
    setRecordedPaymentResult(null);
    setModalError('');
  };

  // Submit Payment Collection
  const handleRecordCollection = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!selectedItemForCollection) return;

    const amountNum = parseFloat(collectAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setModalError('Please enter a valid payment amount greater than 0.');
      return;
    }

    if (amountNum > selectedItemForCollection.remainingAmount + 0.001) {
      setModalError(
        `Payment amount (${formatINR(amountNum)}) cannot exceed the remaining balance for Installment #${selectedItemForCollection.nextInstallmentNumber} (${formatINR(selectedItemForCollection.remainingAmount)}).`
      );
      return;
    }

    if (!paymentDate) {
      setModalError('Please specify the collection date.');
      return;
    }

    setCollecting(true);
    try {
      const adminName =
        userProfile?.name || currentUser?.displayName || currentUser?.email || 'Admin Collector';

      const result = await recordInstallmentPayment({
        installmentPlanId: selectedItemForCollection.planId,
        installmentNumber: selectedItemForCollection.nextInstallmentNumber,
        amount: amountNum,
        paymentDate,
        paymentMethod,
        note: collectionNote.trim() || `Daily field collection by ${adminName}`,
        recordedBy: adminName,
      });

      // Update local plans state immediately
      setPlans((prev) =>
        prev.map((p) => (p.id === result.updatedPlan.id ? result.updatedPlan : p))
      );

      // Save recorded payment for instant receipt viewing
      setRecordedPaymentResult({
        payment: result.payment,
        updatedPlan: result.updatedPlan,
        amount: amountNum,
        item: selectedItemForCollection,
      });

      showNotification(
        `Collected ${formatINR(amountNum)} from ${selectedItemForCollection.memberName} for Installment #${selectedItemForCollection.nextInstallmentNumber} successfully!`
      );

      // Safe activity log
      logAdminActivity({
        action: `Collected Daily Payment of ${formatINR(amountNum)}`,
        actionType: ACTION_TYPES.PAYMENT_RECORDED,
        adminId: currentUser?.uid || '',
        adminName,
        adminEmail: userProfile?.email || currentUser?.email || '',
        targetType: 'payment',
        targetId: result.paymentId,
        paymentId: result.paymentId,
        planId: selectedItemForCollection.planId,
        orderId: selectedItemForCollection.orderId || '',
        memberId: selectedItemForCollection.memberId || '',
        memberName: selectedItemForCollection.memberName || '',
        productName: selectedItemForCollection.productName || '',
        amount: amountNum,
        status: result.updatedPlan?.status || 'Active',
        details: `Collected ${paymentMethod} payment of ${formatINR(amountNum)} from ${selectedItemForCollection.memberName} (${selectedItemForCollection.productName}, Installment #${selectedItemForCollection.nextInstallmentNumber})`,
      });
    } catch (err) {
      console.error('Failed to record collection payment:', err);
      setModalError(sanitizeErrorMessage(err, 'Payment collection failed. Please try again.'));
    } finally {
      setCollecting(false);
    }
  };

  // Launch existing receipt modal
  const handleOpenReceipt = (payment) => {
    setReceiptPayment(payment);
    setShowReceiptModal(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.6rem' }}>💰</span>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
              Daily Payment Collection
            </h1>
            <span style={{
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: '700',
            }}>
              {counts.all} Active {counts.all === 1 ? 'Borrower' : 'Borrowers'}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
            Field collection tracker for due, overdue, and active installment repayments
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={loading || refreshing}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          title="Reload active installment data"
        >
          <span>{refreshing ? '⏳' : '🔄'}</span>
          <span>{refreshing ? 'Refreshing...' : 'Refresh List'}</span>
        </button>
      </div>

      {/* Global Notification Banner */}
      {notification && (
        <div style={{
          backgroundColor: notification.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
          color: notification.type === 'error' ? '#f87171' : '#34d399',
          padding: '0.85rem 1.15rem',
          borderRadius: '0.5rem',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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

      {/* Top Metrics Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
      }}>
        {/* Card 1: Overdue Alerts */}
        <div
          onClick={() => setStatusFilter('overdue')}
          style={{
            backgroundColor: statusFilter === 'overdue' ? '#fef2f2' : '#ffffff',
            border: `1px solid ${statusFilter === 'overdue' ? '#b91c1c' : counts.overdue > 0 ? '#fecaca' : '#e2e8f0'}`,
            borderRadius: '0.875rem',
            padding: '1.15rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(185, 28, 28, 0.12)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.05)';
          }}
        >
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '0.65rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.35rem',
            color: '#b91c1c',
            flexShrink: 0,
          }}>
            ⚠️
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Overdue Collections
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <strong style={{ fontSize: '1.35rem', color: '#b91c1c', fontWeight: '800' }}>
                {counts.overdue}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                ({formatINR(counts.overdueAmount)})
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Due Today */}
        <div
          onClick={() => setStatusFilter('due_today')}
          style={{
            backgroundColor: statusFilter === 'due_today' ? '#fff7ed' : '#ffffff',
            border: `1px solid ${statusFilter === 'due_today' ? '#c2410c' : counts.due_today > 0 ? '#fed7aa' : '#e2e8f0'}`,
            borderRadius: '0.875rem',
            padding: '1.15rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(194, 65, 12, 0.12)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.05)';
          }}
        >
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '0.65rem',
            backgroundColor: '#fff7ed',
            border: '1px solid #fed7aa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.35rem',
            color: '#c2410c',
            flexShrink: 0,
          }}>
            🔔
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#c2410c', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Due Today
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <strong style={{ fontSize: '1.35rem', color: '#c2410c', fontWeight: '800' }}>
                {counts.due_today}
              </strong>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                ({formatINR(counts.dueTodayAmount)})
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Upcoming */}
        <div
          onClick={() => setStatusFilter('upcoming')}
          style={{
            backgroundColor: statusFilter === 'upcoming' ? '#eff6ff' : '#ffffff',
            border: `1px solid ${statusFilter === 'upcoming' ? '#1d4ed8' : '#e2e8f0'}`,
            borderRadius: '0.875rem',
            padding: '1.15rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(29, 78, 216, 0.12)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.05)';
          }}
        >
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '0.65rem',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.35rem',
            color: '#1d4ed8',
            flexShrink: 0,
          }}>
            📅
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Upcoming Dues
            </span>
            <strong style={{ fontSize: '1.35rem', color: '#0a2540', fontWeight: '800' }}>
              {counts.upcoming}
            </strong>
          </div>
        </div>

        {/* Card 4: Total Pending Collections */}
        <div
          onClick={() => setStatusFilter('all')}
          style={{
            backgroundColor: statusFilter === 'all' ? '#f5f3ff' : '#ffffff',
            border: `1px solid ${statusFilter === 'all' ? '#6d28d9' : '#e2e8f0'}`,
            borderRadius: '0.875rem',
            padding: '1.15rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
            transition: 'all 0.18s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(109, 40, 217, 0.12)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.05)';
          }}
        >
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '0.65rem',
            backgroundColor: '#f5f3ff',
            border: '1px solid #ddd6fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.35rem',
            color: '#6d28d9',
            flexShrink: 0,
          }}>
            💵
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
              Total Active Dues
            </span>
            <strong style={{ fontSize: '1.25rem', color: '#6d28d9', fontWeight: '800' }}>
              {formatINR(counts.totalPendingAmount)}
            </strong>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Status Filter Buttons */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.85rem 1.15rem',
        backgroundColor: '#ffffff',
        borderRadius: '0.75rem',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
      }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <span style={{
            position: 'absolute',
            left: '0.85rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#64748b',
            fontSize: '0.95rem',
          }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name, Mobile Number, or Member ID..."
            style={{
              width: '100%',
              padding: '0.65rem 2rem 0.65rem 2.5rem',
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
                right: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '1.1rem',
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Filter Buttons */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          maxWidth: '100%',
          paddingBottom: '2px',
        }}>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: statusFilter === 'all' ? '#0a2540' : '#e2e8f0',
              backgroundColor: statusFilter === 'all' ? '#0a2540' : '#f8fafc',
              color: statusFilter === 'all' ? '#ffffff' : '#475569',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>All Active</span>
            <span style={{
              backgroundColor: statusFilter === 'all' ? 'rgba(255, 255, 255, 0.2)' : '#e2e8f0',
              color: statusFilter === 'all' ? '#ffffff' : '#0f172a',
              padding: '0.1rem 0.45rem',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              fontWeight: '800',
            }}>
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('due_today')}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: statusFilter === 'due_today' ? '#c2410c' : '#fed7aa',
              backgroundColor: statusFilter === 'due_today' ? '#c2410c' : '#fff7ed',
              color: statusFilter === 'due_today' ? '#ffffff' : '#c2410c',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>🔔 Due Today</span>
            <span style={{
              backgroundColor: statusFilter === 'due_today' ? 'rgba(255, 255, 255, 0.25)' : '#fed7aa',
              color: statusFilter === 'due_today' ? '#ffffff' : '#9a3412',
              padding: '0.1rem 0.45rem',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              fontWeight: '800',
            }}>
              {counts.due_today}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('overdue')}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: statusFilter === 'overdue' ? '#b91c1c' : '#fecaca',
              backgroundColor: statusFilter === 'overdue' ? '#b91c1c' : '#fef2f2',
              color: statusFilter === 'overdue' ? '#ffffff' : '#b91c1c',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⚠️ Overdue</span>
            <span style={{
              backgroundColor: statusFilter === 'overdue' ? 'rgba(255, 255, 255, 0.25)' : '#fecaca',
              color: statusFilter === 'overdue' ? '#ffffff' : '#991b1b',
              padding: '0.1rem 0.45rem',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              fontWeight: '800',
            }}>
              {counts.overdue}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('upcoming')}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: statusFilter === 'upcoming' ? '#1d4ed8' : '#bfdbfe',
              backgroundColor: statusFilter === 'upcoming' ? '#1d4ed8' : '#eff6ff',
              color: statusFilter === 'upcoming' ? '#ffffff' : '#1d4ed8',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📅 Upcoming</span>
            <span style={{
              backgroundColor: statusFilter === 'upcoming' ? 'rgba(255, 255, 255, 0.25)' : '#bfdbfe',
              color: statusFilter === 'upcoming' ? '#ffffff' : '#1e40af',
              padding: '0.1rem 0.45rem',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              fontWeight: '800',
            }}>
              {counts.upcoming}
            </span>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="loading-container" style={{ padding: '4rem 1rem' }}>
          <div className="loading-spinner" />
          <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Loading active collection schedules from Firestore...
          </p>
        </div>
      ) : error ? (
        /* Error Banner */
        <div className="form-error-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button
            onClick={() => loadData()}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.25rem 0.65rem' }}
          >
            Retry
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        /* Empty State */
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          backgroundColor: 'var(--card-bg)',
          borderRadius: '0.75rem',
          border: '1px dashed var(--card-border)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✨</div>
          <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
            {searchQuery
              ? 'No matching collection records found'
              : statusFilter === 'overdue'
              ? 'No overdue installments!'
              : statusFilter === 'due_today'
              ? 'No installments due today!'
              : 'No active installments for collection'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            {searchQuery
              ? `No active members or products matched "${searchQuery}". Check spelling or clear filters.`
              : 'All active agreements are up to date or completed.'}
          </p>
          {(searchQuery || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              className="btn btn-secondary btn-sm"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        /* Collection Directory: Responsive Table & Mobile Cards */
        <div style={{
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '0.75rem',
          overflow: 'hidden',
        }}>
          {/* Desktop Table */}
          <div className="collection-table-desktop" style={{ overflowX: 'auto' }}>
            <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid var(--card-border)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Member Details</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Product</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Next Inst #</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Due Date</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Inst Amount</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Paid</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Remaining</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isOverdue = item.isOverdue;
                  const isDueToday = item.isDueToday;

                  return (
                    <tr
                      key={`${item.planId}-${item.nextInstallmentNumber}`}
                      style={{
                        borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
                        backgroundColor: isOverdue
                          ? 'rgba(239, 68, 68, 0.05)'
                          : isDueToday
                          ? 'rgba(245, 158, 11, 0.04)'
                          : 'transparent',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = isOverdue
                          ? 'rgba(239, 68, 68, 0.09)'
                          : 'rgba(255, 255, 255, 0.03)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = isOverdue
                          ? 'rgba(239, 68, 68, 0.05)'
                          : isDueToday
                          ? 'rgba(245, 158, 11, 0.04)'
                          : 'transparent';
                      }}
                    >
                      {/* Member Name, Mobile Number, and ID */}
                      <td style={{ padding: '0.95rem 1rem' }}>
                        <div style={{ fontWeight: '800', color: '#0a2540', fontSize: '0.975rem' }}>
                          {item.memberName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                          {item.phone && (
                            <a
                              href={`tel:${item.phone}`}
                              title="Call customer directly"
                              style={{
                                color: '#065f46',
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #86efac',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '0.35rem',
                                textDecoration: 'none',
                                fontSize: '0.8rem',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              <span>📞</span>
                              <span>{item.phone}</span>
                            </a>
                          )}
                          <code style={{
                            padding: '0.15rem 0.45rem',
                            backgroundColor: '#fff7ed',
                            color: '#ea580c',
                            border: '1px solid #fed7aa',
                            borderRadius: '0.35rem',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                          }}>
                            {item.memberId}
                          </code>
                        </div>
                      </td>

                      {/* Product */}
                      <td style={{ padding: '0.95rem 1rem' }}>
                        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.875rem' }}>
                          {item.productName}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {item.frequency} Plan
                        </span>
                      </td>

                      {/* Next Installment # */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '0.4rem',
                          backgroundColor: '#f1f5f9',
                          color: '#0a2540',
                          fontWeight: '700',
                          fontSize: '0.825rem',
                          border: '1px solid #e2e8f0',
                        }}>
                          #{item.nextInstallmentNumber} of {item.totalInstallments}
                        </span>
                      </td>

                      {/* Due Date with relative tags */}
                      <td style={{ padding: '0.95rem 1rem', whiteSpace: 'nowrap' }}>
                        <div style={{
                          fontWeight: isOverdue ? '800' : isDueToday ? '700' : '600',
                          color: isOverdue ? '#b91c1c' : isDueToday ? '#c2410c' : '#0f172a',
                          fontSize: '0.875rem',
                        }}>
                          {formatIndianDate(item.dueDate)}
                        </div>
                        {isOverdue && (
                          <div style={{ fontSize: '0.725rem', color: '#b91c1c', fontWeight: '700', marginTop: '0.15rem' }}>
                            ⚠️ {item.overdueDays} {item.overdueDays === 1 ? 'day' : 'days'} overdue
                          </div>
                        )}
                        {isDueToday && (
                          <div style={{ fontSize: '0.725rem', color: '#c2410c', fontWeight: '700', marginTop: '0.15rem' }}>
                            🔔 Due Today
                          </div>
                        )}
                      </td>

                      {/* Installment Amount */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'right', fontWeight: '600', color: '#64748b' }}>
                        {formatINR(item.installmentAmount)}
                      </td>

                      {/* Paid Amount */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'right', color: item.paidAmount > 0 ? '#047857' : '#64748b', fontWeight: item.paidAmount > 0 ? '700' : '500' }}>
                        {formatINR(item.paidAmount)}
                      </td>

                      {/* Remaining Amount */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'right' }}>
                        <strong style={{
                          fontSize: '1rem',
                          color: isOverdue ? '#b91c1c' : '#0a2540',
                          fontWeight: '800',
                          display: 'block',
                        }}>
                          {formatINR(item.remainingAmount)}
                        </strong>
                        {item.paidAmount > 0 ? (
                          <span style={{ fontSize: '0.725rem', color: '#047857', fontWeight: '600' }}>
                            ({formatINR(item.paidAmount)} paid)
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.725rem', color: '#64748b' }}>
                            Balance
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          backgroundColor: isOverdue
                            ? '#fef2f2'
                            : isDueToday
                            ? '#fff7ed'
                            : item.paidAmount > 0
                            ? '#ecfdf5'
                            : '#eff6ff',
                          color: isOverdue
                            ? '#b91c1c'
                            : isDueToday
                            ? '#c2410c'
                            : item.paidAmount > 0
                            ? '#047857'
                            : '#1d4ed8',
                          border: `1px solid ${
                            isOverdue
                              ? '#fecaca'
                              : isDueToday
                              ? '#fed7aa'
                              : item.paidAmount > 0
                              ? '#a7f3d0'
                              : '#bfdbfe'
                          }`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}>
                          {isOverdue && <span>⚠️</span>}
                          {isDueToday && <span>🔔</span>}
                          <span>{isOverdue ? 'OVERDUE' : item.status}</span>
                        </span>
                      </td>

                      {/* Action Button: Collect Payment */}
                      <td style={{ padding: '0.95rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenCollectionModal(item)}
                          className="btn btn-orange btn-sm"
                          style={{
                            padding: '0.45rem 0.85rem',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <span>💵</span>
                          <span>Collect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="collection-cards-mobile" style={{ display: 'none', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
            {filteredItems.map((item) => {
              const isOverdue = item.isOverdue;
              const isDueToday = item.isDueToday;

              return (
                <div
                  key={`m-${item.planId}-${item.nextInstallmentNumber}`}
                  style={{
                    backgroundColor: '#ffffff',
                    border: `1px solid ${isOverdue ? '#fecaca' : isDueToday ? '#fed7aa' : '#e2e8f0'}`,
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    position: 'relative',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
                  }}
                >
                  {/* Card Header: Member Name & Status */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: '800', color: '#0a2540', fontSize: '1.05rem' }}>
                        {item.memberName}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                        {item.phone && (
                          <a
                            href={`tel:${item.phone}`}
                            style={{
                              color: '#065f46',
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #86efac',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '0.35rem',
                              fontSize: '0.8rem',
                              fontWeight: '800',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <span>📞</span> {item.phone}
                          </a>
                        )}
                        <code style={{ fontSize: '0.75rem', color: '#ea580c', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', fontWeight: '700' }}>
                          {item.memberId}
                        </code>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>&bull; {item.productName}</span>
                      </div>
                    </div>

                    <span style={{
                      padding: '0.25rem 0.6rem',
                      borderRadius: '9999px',
                      fontSize: '0.7rem',
                      fontWeight: '800',
                      backgroundColor: isOverdue ? '#fef2f2' : isDueToday ? '#fff7ed' : '#eff6ff',
                      color: isOverdue ? '#b91c1c' : isDueToday ? '#c2410c' : '#1d4ed8',
                      border: `1px solid ${isOverdue ? '#fecaca' : isDueToday ? '#fed7aa' : '#bfdbfe'}`,
                      textTransform: 'uppercase',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}>
                      {isOverdue && <span>⚠️</span>}
                      {isDueToday && <span>🔔</span>}
                      <span>{isOverdue ? 'OVERDUE' : item.status}</span>
                    </span>
                  </div>

                  {/* Amounts & Due Date Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.825rem',
                  }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem', fontWeight: '600' }}>Next Installment</span>
                      <strong style={{ color: '#0f172a' }}>
                        #{item.nextInstallmentNumber} of {item.totalInstallments}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem', fontWeight: '600' }}>Due Date</span>
                      <strong style={{ color: isOverdue ? '#b91c1c' : isDueToday ? '#c2410c' : '#0f172a' }}>
                        {formatIndianDate(item.dueDate)}
                      </strong>
                      {isOverdue && (
                        <div style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: '700', marginTop: '0.1rem' }}>
                          ⚠️ {item.overdueDays} {item.overdueDays === 1 ? 'day' : 'days'} overdue
                        </div>
                      )}
                    </div>

                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem', fontWeight: '600' }}>Paid So Far</span>
                      <span style={{ color: item.paidAmount > 0 ? '#047857' : '#64748b', fontWeight: item.paidAmount > 0 ? '700' : 'normal' }}>
                        {formatINR(item.paidAmount)}
                      </span>
                    </div>

                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem', fontWeight: '600' }}>Remaining Balance</span>
                      <strong style={{ color: isOverdue ? '#b91c1c' : '#0a2540', fontSize: '0.95rem' }}>
                        {formatINR(item.remainingAmount)}
                      </strong>
                    </div>
                  </div>

                  {/* Quick Action Buttons: Call & Collect */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {item.phone && (
                      <a
                        href={`tel:${item.phone}`}
                        className="btn btn-secondary btn-sm"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                          textDecoration: 'none',
                          color: '#047857',
                          padding: '0.6rem',
                          fontWeight: '700',
                        }}
                      >
                        <span>📞</span>
                        <span>Call</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenCollectionModal(item)}
                      className="btn btn-orange btn-sm"
                      style={{
                        flex: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        fontWeight: '700',
                        padding: '0.6rem',
                      }}
                    >
                      <span>💵</span>
                      <span>Collect Payment</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Collect Payment Modal (Requirements 5, 6, 7, 8, 9) */}
      {selectedItemForCollection && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1rem',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15)',
            maxHeight: '92vh',
            overflowY: 'auto',
          }}>
            {/* If payment was just recorded successfully, show receipt launch option */}
            {recordedPaymentResult ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0a2540', marginBottom: '0.4rem' }}>
                  Payment Collected Successfully!
                </h3>
                <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Recorded <strong style={{ color: '#047857' }}>{formatINR(recordedPaymentResult.amount)}</strong> from{' '}
                  <strong style={{ color: '#0f172a' }}>{recordedPaymentResult.item.memberName}</strong> for Installment #
                  {recordedPaymentResult.item.nextInstallmentNumber}. Balances and schedules have been updated.
                </p>

                <div style={{
                  padding: '1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '0.75rem',
                  border: '1px solid #e2e8f0',
                  marginBottom: '1.75rem',
                  textAlign: 'left',
                  fontSize: '0.85rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ color: '#64748b' }}>Payment ID:</span>
                    <code style={{ color: '#0a2540', backgroundColor: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '0.25rem', fontWeight: '700' }}>{recordedPaymentResult.payment.id}</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ color: '#64748b' }}>Payment Method:</span>
                    <strong style={{ color: '#0f172a' }}>{recordedPaymentResult.payment.paymentMethod}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Remaining Plan Balance:</span>
                    <strong style={{ color: '#b91c1c' }}>
                      {formatINR(calculateBalanceAmount(recordedPaymentResult.updatedPlan))}
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenReceipt(recordedPaymentResult.payment)}
                    className="btn btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.25rem' }}
                  >
                    <span>📄</span>
                    <span>View / Print Receipt</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCloseCollectionModal}
                    className="btn btn-secondary"
                    style={{ padding: '0.65rem 1.25rem' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Collection Payment Form */
              <div>
                {/* Modal Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1.25rem',
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: '0.75rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>💵</span>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0a2540', margin: 0 }}>
                      Collect Installment Payment
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseCollectionModal}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.4rem' }}
                  >
                    &times;
                  </button>
                </div>

                {/* Member & Installment Summary Card */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: '0.75rem',
                  border: '1px solid #e2e8f0',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '800', color: '#0a2540', fontSize: '1.05rem' }}>
                        {selectedItemForCollection.memberName}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                        {selectedItemForCollection.memberId} &bull; {selectedItemForCollection.productName}
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '800',
                      backgroundColor: selectedItemForCollection.isOverdue ? '#fef2f2' : '#fff7ed',
                      color: selectedItemForCollection.isOverdue ? '#b91c1c' : '#c2410c',
                      border: `1px solid ${selectedItemForCollection.isOverdue ? '#fecaca' : '#fed7aa'}`,
                    }}>
                      Inst #{selectedItemForCollection.nextInstallmentNumber} &bull; Due {formatIndianDate(selectedItemForCollection.dueDate)}
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.5rem',
                    marginTop: '0.85rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #e2e8f0',
                    fontSize: '0.825rem',
                  }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>Inst Amount</span>
                      <strong style={{ color: '#0f172a' }}>{formatINR(selectedItemForCollection.installmentAmount)}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>Already Paid</span>
                      <span style={{ color: '#047857', fontWeight: '700' }}>{formatINR(selectedItemForCollection.paidAmount)}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', fontWeight: '600' }}>Net Due</span>
                      <strong style={{ color: '#b91c1c', fontSize: '0.95rem' }}>
                        {formatINR(selectedItemForCollection.remainingAmount)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {modalError && (
                  <div style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem',
                    fontSize: '0.85rem',
                  }}>
                    {modalError}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleRecordCollection}>
                  {/* Amount Input with Quick Preset Chips */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ fontSize: '0.875rem', fontWeight: '700', color: '#0a2540' }}>
                        Collection Amount (₹) <span style={{ color: '#b91c1c' }}>*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setCollectAmount(selectedItemForCollection.remainingAmount.toString())}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ea580c',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Full Remaining ({formatINR(selectedItemForCollection.remainingAmount)})
                      </button>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute',
                        left: '0.85rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
                        fontSize: '1rem',
                        fontWeight: '700',
                      }}>
                        ₹
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        max={selectedItemForCollection.remainingAmount}
                        value={collectAmount}
                        onChange={(e) => setCollectAmount(e.target.value)}
                        placeholder="Enter collection amount"
                        style={{
                          width: '100%',
                          padding: '0.7rem 0.85rem 0.7rem 2.2rem',
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.5rem',
                          color: '#0f172a',
                          fontSize: '1.1rem',
                          fontWeight: '700',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <span style={{ display: 'block', fontSize: '0.725rem', color: '#64748b', marginTop: '0.35rem' }}>
                      Cannot exceed maximum remaining installment balance of {formatINR(selectedItemForCollection.remainingAmount)}.
                    </span>
                  </div>

                  {/* Payment Method Selector */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: '#0a2540', marginBottom: '0.45rem' }}>
                      Payment Method <span style={{ color: '#b91c1c' }}>*</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                      {PAYMENT_METHODS.map((method) => {
                        const isSelected = paymentMethod === method;
                        const icon = method === 'Cash' ? '💵' : method === 'UPI' ? '📱' : method === 'Bank Transfer' ? '🏦' : '💳';
                        return (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPaymentMethod(method)}
                            style={{
                              padding: '0.6rem 0.35rem',
                              borderRadius: '0.5rem',
                              border: `1px solid ${isSelected ? '#0a2540' : '#e2e8f0'}`,
                              backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                              color: isSelected ? '#0a2540' : '#475569',
                              fontSize: '0.8rem',
                              fontWeight: isSelected ? '800' : '600',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '0.2rem',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? '0 1px 3px rgba(10, 37, 64, 0.1)' : 'var(--shadow-xs)',
                            }}
                          >
                            <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                            <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{method}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Payment Date */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: '#0a2540', marginBottom: '0.4rem' }}>
                      Collection Date <span style={{ color: '#b91c1c' }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0.5rem',
                        color: '#0f172a',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Collection Note */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: '#0a2540', marginBottom: '0.4rem' }}>
                      Note / Reference (Optional)
                    </label>
                    <input
                      type="text"
                      value={collectionNote}
                      onChange={(e) => setCollectionNote(e.target.value)}
                      placeholder="e.g. Field cash collected by Karthi, receipt #482"
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0.5rem',
                        color: '#0f172a',
                        fontSize: '0.875rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Modal Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={handleCloseCollectionModal}
                      disabled={collecting}
                      className="btn btn-secondary"
                      style={{ padding: '0.65rem 1.25rem' }}
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={collecting}
                      className="btn btn-orange"
                      style={{
                        padding: '0.65rem 1.5rem',
                        fontWeight: '700',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      {collecting && <span className="loading-spinner-sm" />}
                      <span>{collecting ? 'Processing...' : 'Confirm & Save Payment'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Existing Payment Receipt Modal (Requirement 9) */}
      {showReceiptModal && receiptPayment && (
        <PaymentReceiptModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          payment={receiptPayment}
          currentUser={currentUser}
          isAdmin={true}
        />
      )}

      {/* Responsive Media Query Helper */}
      <style>{`
        @media (max-width: 840px) {
          .collection-table-desktop {
            display: none !important;
          }
          .collection-cards-mobile {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
};

export default DailyCollectionManagement;
