import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getMemberById, updateMember } from '../services/memberService.js';
import { getOrdersByMember, getAllOrders, getNormalizedDeliveryStatus } from '../services/orderService.js';
import {
  getInstallmentPlansByMember,
  getAllInstallmentPlans,
  calculateBalanceAmount,
  calculateTotalPaid,
  getNextDueDate,
} from '../services/installmentService.js';
import { getPaymentsByMember, getAllPayments } from '../services/paymentService.js';
import RecordPaymentModal from './RecordPaymentModal.jsx';
import PaymentReceiptModal from './PaymentReceiptModal.jsx';
import MemberModal from './MemberModal.jsx';
import {
  formatINR,
  formatIndianDate,
  sanitizeErrorMessage,
  getInstallmentStatus,
  getInstallmentRemainingAmount,
  getOverdueDays
} from '../utils/formatters.js';

const MemberDetailsView = ({ member: initialMember = null, memberId = null, onBack = null }) => {
  const { currentUser } = useAuth();

  // If initialMember is provided, initialize state directly so UI can render immediately
  const [member, setMember] = useState(() => {
    if (!initialMember) return null;
    return {
      ...initialMember,
      name: initialMember.name || initialMember.displayName || (initialMember.email ? initialMember.email.split('@')[0] : 'Member'),
      phone: initialMember.phone || '',
      email: initialMember.email || '',
      address: initialMember.address || '',
      memberId: initialMember.memberId || initialMember.id || 'N/A',
      status: initialMember.status || 'active',
      createdAt: initialMember.createdAt || '',
    };
  });
  const [orders, setOrders] = useState([]);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  // Start loading as true only if we don't even have initial member info
  const [loading, setLoading] = useState(!initialMember);
  const [error, setError] = useState(null);

  // Active tab: 'installments' | 'orders' | 'payments'
  const [activeTab, setActiveTab] = useState('installments');

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [selectedPlanForCollect, setSelectedPlanForCollect] = useState(null);
  const [selectedInstNumForCollect, setSelectedInstNumForCollect] = useState(null);

  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Notification Toast
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Today's date string YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Compute stable target identifier string
  const targetMemberId = useMemo(() => {
    return memberId || initialMember?.id || initialMember?.memberId || initialMember?.userId || '';
  }, [memberId, initialMember?.id, initialMember?.memberId, initialMember?.userId]);

  // Keep member in sync if initialMember prop changes from outside
  useEffect(() => {
    if (initialMember) {
      setMember({
        ...initialMember,
        name: initialMember.name || initialMember.displayName || (initialMember.email ? initialMember.email.split('@')[0] : 'Member'),
        phone: initialMember.phone || '',
        email: initialMember.email || '',
        address: initialMember.address || '',
        memberId: initialMember.memberId || initialMember.id || 'N/A',
        status: initialMember.status || 'active',
        createdAt: initialMember.createdAt || '',
      });
      setError(null);
    }
  }, [initialMember?.id, initialMember?.memberId, initialMember?.userId]);

  // Fetch all member records
  const loadMemberAccountData = useCallback(async () => {
    // Only show full-screen loading spinner if we don't have member data yet
    if (!initialMember && !member) {
      setLoading(true);
    }
    setError(null);

    // Timeout helper to ensure no stalled Firestore query hangs the page
    const withTimeout = (promise, ms = 8000, fallback = null) =>
      Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);

    try {
      // 1. Resolve Member Profile
      let currentMember = initialMember || member || null;
      const targetId = targetMemberId || currentMember?.id || currentMember?.memberId || currentMember?.userId;

      if (!currentMember && targetId) {
        try {
          currentMember = await withTimeout(getMemberById(targetId), 7000, null);
        } catch (fetchErr) {
          console.warn('Error fetching member profile by ID:', fetchErr);
        }
      } else if (targetId) {
        // Refresh in background without blowing away current data if network fails
        try {
          const refreshed = await withTimeout(getMemberById(targetId), 4000, null);
          if (refreshed) {
            currentMember = { ...currentMember, ...refreshed };
          }
        } catch (refreshErr) {
          console.warn('Could not refresh member profile data:', refreshErr);
        }
      }

      if (!currentMember) {
        setError('Member profile not found in database.');
        setLoading(false);
        return;
      }

      // Sanitize fields with safe defaults for existing members created before Name/Mobile updates
      const sanitizedMember = {
        ...currentMember,
        name: currentMember.name || currentMember.displayName || (currentMember.email ? currentMember.email.split('@')[0] : 'Member'),
        phone: currentMember.phone || '',
        email: currentMember.email || '',
        address: currentMember.address || '',
        memberId: currentMember.memberId || currentMember.id || 'N/A',
        status: currentMember.status || 'active',
        createdAt: currentMember.createdAt || '',
      };

      setMember(sanitizedMember);

      // Collect all identifiers for this member
      const memberIdentifiers = new Set([
        sanitizedMember.id,
        sanitizedMember.userId,
        sanitizedMember.memberId,
      ].filter(Boolean));

      const memberEmailLower = (sanitizedMember.email || '').toLowerCase().trim();
      const memberCleanPhone = (sanitizedMember.phone || '').replace(/\D/g, '');

      // 2. Fetch Orders, Plans, Payments in parallel with Promise.allSettled and timeouts
      const [ordersResult, plansResult, paymentsResult] = await Promise.allSettled([
        withTimeout(getAllOrders().catch(() => []), 8000, []),
        withTimeout(getAllInstallmentPlans().catch(() => []), 8000, []),
        withTimeout(getAllPayments().catch(() => []), 8000, []),
      ]);

      const allOrdersRes = ordersResult.status === 'fulfilled' && Array.isArray(ordersResult.value)
        ? ordersResult.value
        : [];
      const allPlansRes = plansResult.status === 'fulfilled' && Array.isArray(plansResult.value)
        ? plansResult.value
        : [];
      const allPaymentsRes = paymentsResult.status === 'fulfilled' && Array.isArray(paymentsResult.value)
        ? paymentsResult.value
        : [];

      // Filter orders matching member ID, userId, email, or phone
      const memberOrders = allOrdersRes.filter((o) => {
        const matchesId = o.memberId && memberIdentifiers.has(o.memberId);
        const matchesEmail = memberEmailLower && (o.memberEmail || '').toLowerCase().trim() === memberEmailLower;
        const oPhone = (o.memberPhone || '').replace(/\D/g, '');
        const matchesPhone = memberCleanPhone && oPhone && oPhone === memberCleanPhone;
        return Boolean(matchesId || matchesEmail || matchesPhone);
      });

      // Filter plans matching member
      const memberPlans = allPlansRes.filter((p) => {
        const matchesId = p.memberId && memberIdentifiers.has(p.memberId);
        const matchesEmail = memberEmailLower && (p.memberEmail || '').toLowerCase().trim() === memberEmailLower;
        const pPhone = (p.memberPhone || '').replace(/\D/g, '');
        const matchesPhone = memberCleanPhone && pPhone && pPhone === memberCleanPhone;
        return Boolean(matchesId || matchesEmail || matchesPhone);
      });

      const memberPlanIds = new Set(memberPlans.map((p) => p.id));

      // Filter payments matching member or any of member's plans
      const memberPayments = allPaymentsRes.filter((pay) => {
        const matchesPlan = pay.installmentPlanId && memberPlanIds.has(pay.installmentPlanId);
        const matchesMemberId = pay.memberId && memberIdentifiers.has(pay.memberId);
        return Boolean(matchesPlan || matchesMemberId);
      });

      setOrders(memberOrders);
      setPlans(memberPlans);
      setPayments(memberPayments);
    } catch (err) {
      console.error('Failed to load member account view data:', err);
      // Only set fatal error if we do not even have a member profile to show
      if (!initialMember && !member) {
        setError(sanitizeErrorMessage(err, 'Failed to retrieve member account records.'));
      }
    } finally {
      setLoading(false);
    }
  }, [targetMemberId, initialMember]); // NOTE: Never include `member` state in dependency array!

  useEffect(() => {
    loadMemberAccountData();
  }, [loadMemberAccountData]);

  // Summary Metrics (Total Purchase Amount, Total Paid, Total Outstanding, Active Plans, Overdue Amount)
  const summary = useMemo(() => {
    const totalOrders = orders.length;

    // Active Installment Plans: status !== 'completed' and remainingBalance > 0
    const activePlansList = plans.filter((p) => {
      const status = (p.status || '').toLowerCase();
      const balance = calculateBalanceAmount(p);
      return status !== 'completed' && balance > 0;
    });

    const activePlansCount = activePlansList.length;

    // Total Purchase Amount: sum of totalAmount of all plans (or orders if no plans)
    const totalPurchaseAmount = plans.length > 0
      ? plans.reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0)
      : orders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);

    // Total Paid: sum of paid amounts across plans
    const totalPaid = plans.reduce((sum, p) => sum + calculateTotalPaid(p), 0);

    // Total Outstanding: sum of remaining balances across plans
    const totalOutstanding = plans.reduce((sum, p) => sum + calculateBalanceAmount(p), 0);

    // Overdue Amount: sum of remaining balance on all installments that are past due date
    let overdueAmount = 0;
    let overdueInstallmentsCount = 0;

    plans.forEach((plan) => {
      const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
      schedule.forEach((inst) => {
        const rem = getInstallmentRemainingAmount(inst);
        const dynamicStatus = getInstallmentStatus(inst);
        if (rem > 0 && dynamicStatus === 'Overdue') {
          overdueAmount += rem;
          overdueInstallmentsCount += 1;
        }
      });
    });

    return {
      totalOrders,
      activePlansCount,
      totalPurchaseAmount: parseFloat(totalPurchaseAmount.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
      overdueAmount: parseFloat(overdueAmount.toFixed(2)),
      overdueInstallmentsCount,
    };
  }, [orders, plans, todayStr]);

  // Enriched Plans for the Installment Plans section
  // Showing: Product, Total Amount, Down Payment, Installment Amount, Frequency,
  // Number of Installments, Paid Amount, Remaining Amount, Next Due Date, Current Status
  const enrichedPlans = useMemo(() => {
    return plans.map((plan) => {
      const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
      const planTotalPaid = calculateTotalPaid(plan);
      const planRemaining = calculateBalanceAmount(plan);
      const totalAmount = parseFloat(plan.totalAmount) || 0;
      const downPayment = parseFloat(plan.downPayment) || 0;
      const installmentAmount = parseFloat(plan.installmentAmount) || (schedule[0]?.amount ? parseFloat(schedule[0].amount) : 0);
      const frequency = plan.frequency || 'Monthly';
      const numberOfInstallments = parseInt(plan.numberOfInstallments, 10) || schedule.length;
      const percentPaid = totalAmount > 0 ? Math.min(100, Math.round((planTotalPaid / totalAmount) * 100)) : 0;

      // Find next unpaid installment
      const nextUnpaid = schedule.find((item) => getInstallmentRemainingAmount(item) > 0);
      const nextDueDateRaw = nextUnpaid ? nextUnpaid.dueDate : null;
      const nextDueDynamicStatus = nextUnpaid ? getInstallmentStatus(nextUnpaid) : null;
      const isOverdueNext = nextDueDynamicStatus === 'Overdue';
      const isDueTodayNext = nextDueDynamicStatus === 'Due Today';
      const overdueDaysNext = isOverdueNext && nextDueDateRaw ? getOverdueDays(nextDueDateRaw) : 0;

      let nextDueDateText = 'All Paid';
      if (nextDueDateRaw) {
        nextDueDateText = formatIndianDate(nextDueDateRaw);
      }

      // Determine current status
      let planStatus = {
        status: 'Active',
        label: 'Active',
        color: '#1d4ed8',
        bg: '#eff6ff',
        border: '#bfdbfe',
        icon: '💳',
      };

      const statusStr = (plan.status || '').toLowerCase();
      if (planRemaining <= 0 || statusStr === 'completed') {
        planStatus = {
          status: 'Completed',
          label: 'Completed',
          color: '#047857',
          bg: '#ecfdf5',
          border: '#a7f3d0',
          icon: '✅',
        };
      } else if (schedule.some((s) => getInstallmentRemainingAmount(s) > 0 && getInstallmentStatus(s) === 'Overdue')) {
        planStatus = {
          status: 'Overdue',
          label: 'Overdue',
          color: '#b91c1c',
          bg: '#fef2f2',
          border: '#fecaca',
          icon: '🚨',
        };
      } else if (schedule.some((s) => getInstallmentRemainingAmount(s) > 0 && getInstallmentStatus(s) === 'Due Today')) {
        planStatus = {
          status: 'Due Today',
          label: 'Due Today',
          color: '#c2410c',
          bg: '#fff7ed',
          border: '#fed7aa',
          icon: '⏳',
        };
      }

      const canCollect = planRemaining > 0 && statusStr !== 'completed';

      // Enriched schedule items for this plan
      const enrichedSchedule = schedule.map((inst) => {
        const dueAmt = parseFloat(inst.amount) || 0;
        const paidAmt = parseFloat(inst.paidAmount) || 0;
        const remAmt = getInstallmentRemainingAmount(inst);
        const dynamicStatus = getInstallmentStatus(inst);
        const dueDate = inst.dueDate || '';
        const isOverdue = dynamicStatus === 'Overdue';
        const overdueDays = isOverdue ? getOverdueDays(dueDate) : 0;

        return {
          ...inst,
          dueAmt,
          paidAmt,
          remAmt,
          dynamicStatus,
          isOverdue,
          overdueDays,
          canCollect: remAmt > 0 && canCollect,
        };
      });

      return {
        ...plan,
        schedule: enrichedSchedule,
        productName: plan.productName || 'Merchandise',
        totalAmount,
        downPayment,
        installmentAmount,
        frequency,
        numberOfInstallments,
        planTotalPaid,
        planRemaining,
        percentPaid,
        nextUnpaid,
        nextDueDateRaw,
        nextDueDateText,
        nextDueDynamicStatus,
        isOverdueNext,
        isDueTodayNext,
        overdueDaysNext,
        planStatus,
        canCollect,
      };
    });
  }, [plans, todayStr]);

  // Detailed Installment Items across all plans (sorted by urgency)
  const installmentItems = useMemo(() => {
    const items = [];

    enrichedPlans.forEach((plan) => {
      plan.schedule.forEach((inst) => {
        items.push({
          plan,
          planId: plan.id,
          orderId: plan.orderId,
          productName: plan.productName,
          installmentNumber: inst.installmentNumber,
          totalInstallments: plan.numberOfInstallments,
          dueDate: inst.dueDate,
          amount: inst.dueAmt,
          paidAmount: inst.paidAmt,
          remainingAmount: inst.remAmt,
          status: inst.dynamicStatus,
          isOverdue: inst.isOverdue,
          overdueDays: inst.overdueDays,
          canCollect: inst.canCollect,
        });
      });
    });

    // Sort: Overdue first, then by due date ascending
    return items.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isOverdue && b.isOverdue) return b.overdueDays - a.overdueDays;
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });
  }, [enrichedPlans]);

  // Handle Edit Member Save (Requirement 10)
  const handleSaveMember = async (formData) => {
    if (!member?.id) return;
    try {
      await updateMember(member.id, formData);
      setMember((prev) => ({
        ...prev,
        ...formData,
        updatedAt: new Date().toISOString(),
      }));
      setIsEditModalOpen(false);
      showNotification(`Member ${formData.memberId || member.memberId} updated successfully.`);
    } catch (err) {
      console.error('Failed to update member:', err);
      showNotification(sanitizeErrorMessage(err, 'Failed to update member information.'), 'error');
    }
  };

  // Open Collect Payment Modal (Requirement 8)
  const handleOpenCollect = (plan, installmentNumber) => {
    setSelectedPlanForCollect(plan);
    setSelectedInstNumForCollect(installmentNumber);
    setIsCollectModalOpen(true);
  };

  // Payment Recorded Callback
  const handlePaymentRecorded = (result) => {
    loadMemberAccountData();
    showNotification(`Payment recorded successfully! Receipt: ${result.payment?.receiptNumber || 'Generated'}`);

    if (result.payment) {
      setSelectedPaymentForReceipt(result.payment);
      setIsReceiptModalOpen(true);
    }
  };

  // Open Receipt Modal (Requirement 9)
  const handleOpenReceipt = (payment) => {
    setSelectedPaymentForReceipt(payment);
    setIsReceiptModalOpen(true);
  };

  if (loading) {
    return (
      <div style={{
        padding: '5rem 2rem',
        textAlign: 'center',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1.25rem',
        boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #fed7aa',
          borderTopColor: '#ea580c',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 1.25rem',
        }} />
        <h3 style={{ color: '#0f172a', fontWeight: '800', marginBottom: '0.35rem' }}>Loading Member Account View...</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
          Retrieving complete profile, order book, installment schedules, and payment history.
        </p>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div style={{
        padding: '3rem 2rem',
        textAlign: 'center',
        backgroundColor: '#ffffff',
        border: '1px solid #fee2e2',
        borderRadius: '1.25rem',
        boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚠️</div>
        <h3 style={{ color: '#dc2626', fontWeight: '800', marginBottom: '0.5rem' }}>Unable to Display Member Account</h3>
        <p style={{ color: '#64748b', maxWidth: '500px', margin: '0 auto 1.5rem', lineHeight: '1.5' }}>
          {error || 'The requested member could not be loaded.'}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          {onBack && (
            <button type="button" onClick={onBack} className="btn btn-secondary">
              ← Back to Members
            </button>
          )}
          <button type="button" onClick={loadMemberAccountData} className="btn btn-orange">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isActiveMember = (member?.status || 'active').toLowerCase() === 'active';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            zIndex: 9999,
            backgroundColor: notification.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: notification.type === 'error' ? '#b91c1c' : '#047857',
            border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
            padding: '0.85rem 1.25rem',
            borderRadius: '0.75rem',
            boxShadow: '0 10px 25px -5px rgba(10, 37, 64, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.9rem',
            fontWeight: '700',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <span>{notification.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Header & Navigation Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.85rem',
                fontWeight: '700',
              }}
              title="Return to Members list"
            >
              <span>←</span>
              <span>Back to Members</span>
            </button>
          )}
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Member Account View
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0, marginTop: '0.2rem' }}>
              Comprehensive account profile, installment health, orders, and payment records
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={loadMemberAccountData}
            className="btn btn-secondary btn-sm"
            title="Refresh latest member data from Firestore"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>

          {/* Edit Member Action (Requirement 10: Safe edit via modal) */}
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="btn btn-orange btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
            title="Edit member contact details securely"
          >
            <span>✏️</span>
            <span>Edit Member</span>
          </button>
        </div>
      </div>

      {/* 1. Member Profile Details Card (Clear Customer Profile Header) */}
      <div
        style={{
          padding: '1.75rem',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1.25rem',
          boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0a2540 0%, #1e3a8a 100%)',
                color: '#ffffff',
                fontSize: '1.75rem',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(10, 37, 64, 0.25)',
              }}
            >
              {member.name ? member.name.charAt(0).toUpperCase() : (member.displayName ? member.displayName.charAt(0).toUpperCase() : (member.email ? member.email.charAt(0).toUpperCase() : 'M'))}
            </div>
            <div>
              {/* Customer Name — Largest / Most Prominent */}
              <h2 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.01em' }}>
                {member.name || member.displayName || member.email || 'Unnamed Member'}
              </h2>

              {/* Identification Badges: Mobile, Member ID, Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                {/* Mobile Number */}
                {member.phone ? (
                  <a
                    href={`tel:${member.phone}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.3rem 0.85rem',
                      backgroundColor: '#f0fdf4',
                      border: '1.5px solid #86efac',
                      borderRadius: '0.5rem',
                      color: '#065f46',
                      fontSize: '1.05rem',
                      fontWeight: '800',
                      textDecoration: 'none',
                      boxShadow: '0 1px 3px rgba(16, 185, 129, 0.15)',
                    }}
                    title="Primary customer contact (Click to call)"
                  >
                    <span>📞</span>
                    <span>{member.phone}</span>
                  </a>
                ) : (
                  <span style={{
                    padding: '0.25rem 0.65rem',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    borderRadius: '0.4rem',
                    fontSize: '0.825rem',
                    fontWeight: '700',
                  }}>
                    ⚠️ No Mobile Registered
                  </span>
                )}

                {/* Member ID */}
                <code
                  style={{
                    backgroundColor: '#fff7ed',
                    color: '#ea580c',
                    border: '1px solid #fed7aa',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '0.4rem',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                  }}
                  title="Secondary identifier"
                >
                  Member ID: {member.memberId || 'N/A'}
                </code>

                {/* Account Status Badge */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    backgroundColor: isActiveMember ? '#ecfdf5' : '#f1f5f9',
                    color: isActiveMember ? '#047857' : '#64748b',
                    border: `1px solid ${isActiveMember ? '#a7f3d0' : '#e2e8f0'}`,
                  }}
                >
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: isActiveMember ? '#10b981' : '#94a3b8',
                    }}
                  />
                  {isActiveMember ? 'Active Account' : 'Inactive Account'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Grid: Mobile, Member ID, Email, Address, Registration Date */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          {/* Mobile Number (Primary) */}
          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
              📞 Primary Mobile Number
            </span>
            {member.phone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <a
                  href={`tel:${member.phone}`}
                  style={{
                    fontSize: '1.05rem',
                    color: '#065f46',
                    fontWeight: '800',
                    textDecoration: 'none',
                  }}
                  title="Click to call customer"
                >
                  {member.phone}
                </a>
                <a
                  href={`tel:${member.phone}`}
                  style={{
                    fontSize: '0.725rem',
                    fontWeight: '700',
                    color: '#ffffff',
                    backgroundColor: '#059669',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '0.35rem',
                    textDecoration: 'none',
                  }}
                >
                  Call Now
                </a>
              </div>
            ) : (
              <span style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: '700' }}>⚠️ Not Provided</span>
            )}
          </div>

          {/* Member ID (Secondary) */}
          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: '800', color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
              🆔 Member ID (Secondary)
            </span>
            <span style={{ fontSize: '1.05rem', color: '#0a2540', fontWeight: '800', fontFamily: 'monospace' }}>
              {member.memberId || 'N/A'}
            </span>
          </div>

          {/* Email Address */}
          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
              📧 Email Address
            </span>
            <span style={{ fontSize: '0.9rem', color: '#0f172a', wordBreak: 'break-all', fontWeight: '600' }}>
              {member.email || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No email registered</span>}
            </span>
          </div>

          {/* Delivery / Residence Address */}
          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
              📍 Delivery / Residence Address
            </span>
            <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '500', lineHeight: 1.4 }}>
              {member.address || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No address registered</span>}
            </span>
          </div>

          {/* Join Date & Status */}
          <div style={{ backgroundColor: '#f8fafc', padding: '0.85rem 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.725rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
              📅 Registration Date &amp; Status
            </span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: '600' }}>
                {member.createdAt ? formatIndianDate(member.createdAt) : 'N/A'}
              </span>
              <span style={{
                fontSize: '0.725rem',
                fontWeight: '700',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                backgroundColor: isActiveMember ? '#ecfdf5' : '#f1f5f9',
                color: isActiveMember ? '#047857' : '#64748b',
                border: `1px solid ${isActiveMember ? '#a7f3d0' : '#cbd5e1'}`,
              }}>
                {isActiveMember ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Summary Cards Grid (Requirement 3: Total Orders, Active Plans, Total Amount, Total Paid, Outstanding) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Card 1: Total Orders */}
        <div
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '1.25rem',
            backgroundColor: '#ffffff',
            border: `1px solid ${activeTab === 'orders' ? '#ea580c' : '#e2e8f0'}`,
            borderRadius: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '0.75rem',
              backgroundColor: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              color: '#1d4ed8',
              flexShrink: 0,
              border: '1px solid #bfdbfe',
            }}
          >
            📋
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Total Orders</span>
            <strong style={{ fontSize: '1.4rem', color: '#0f172a', fontWeight: '800' }}>
              {summary.totalOrders}
            </strong>
          </div>
        </div>

        {/* Card 2: Active Installment Plans */}
        <div
          onClick={() => setActiveTab('installments')}
          style={{
            padding: '1.25rem',
            backgroundColor: '#ffffff',
            border: `1px solid ${activeTab === 'installments' ? '#ea580c' : '#e2e8f0'}`,
            borderRadius: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '0.75rem',
              backgroundColor: '#f5f3ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              color: '#6d28d9',
              flexShrink: 0,
              border: '1px solid #ddd6fe',
            }}
          >
            💳
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Active Plans</span>
            <strong style={{ fontSize: '1.4rem', color: '#6d28d9', fontWeight: '800' }}>
              {summary.activePlansCount}
            </strong>
          </div>
        </div>

        {/* Card 3: Total Amount */}
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '0.75rem',
              backgroundColor: '#fff7ed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              color: '#ea580c',
              flexShrink: 0,
              border: '1px solid #fed7aa',
            }}
          >
            🏷️
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Total Value</span>
            <strong style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: '800' }}>
              {formatINR(summary.totalAmount)}
            </strong>
          </div>
        </div>

        {/* Card 4: Total Paid */}
        <div
          onClick={() => setActiveTab('payments')}
          style={{
            padding: '1.25rem',
            backgroundColor: '#ffffff',
            border: `1px solid ${activeTab === 'payments' ? '#ea580c' : '#e2e8f0'}`,
            borderRadius: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '0.75rem',
              backgroundColor: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              color: '#047857',
              flexShrink: 0,
              border: '1px solid #a7f3d0',
            }}
          >
            💰
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Total Paid</span>
            <strong style={{ fontSize: '1.25rem', color: '#047857', fontWeight: '800' }}>
              {formatINR(summary.totalPaid)}
            </strong>
          </div>
        </div>

        {/* Card 5: Outstanding Amount */}
        <div
          style={{
            padding: '1.25rem',
            backgroundColor: summary.outstandingAmount > 0 ? '#fff5f5' : '#ffffff',
            border: `1px solid ${summary.outstandingAmount > 0 ? '#fecaca' : '#e2e8f0'}`,
            borderRadius: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 8px rgba(10, 37, 64, 0.04)',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '0.75rem',
              backgroundColor: summary.outstandingAmount > 0 ? '#fef2f2' : '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
              color: summary.outstandingAmount > 0 ? '#dc2626' : '#64748b',
              flexShrink: 0,
              border: `1px solid ${summary.outstandingAmount > 0 ? '#fecaca' : '#e2e8f0'}`,
            }}
          >
            📉
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>Outstanding</span>
            <strong style={{ fontSize: '1.25rem', color: summary.outstandingAmount > 0 ? '#dc2626' : '#047857', fontWeight: '800' }}>
              {formatINR(summary.outstandingAmount)}
            </strong>
          </div>
        </div>
      </div>

      {/* 3. Section Tabs Header (Requirement 4: Orders, Installments, Payment History) */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '0.5rem',
        }}
      >
        {/* Installments Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('installments')}
          style={{
            padding: '0.7rem 1.35rem',
            borderRadius: '0.6rem',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: '700',
            cursor: 'pointer',
            backgroundColor: activeTab === 'installments' ? '#0a2540' : 'transparent',
            color: activeTab === 'installments' ? '#ffffff' : '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>💳</span>
          <span>Installments</span>
          <span
            style={{
              backgroundColor: activeTab === 'installments' ? '#ea580c' : '#e2e8f0',
              color: activeTab === 'installments' ? '#ffffff' : '#475569',
              padding: '0.15rem 0.55rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '800',
            }}
          >
            {installmentItems.length}
          </span>
        </button>

        {/* Orders Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          style={{
            padding: '0.7rem 1.35rem',
            borderRadius: '0.6rem',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: '700',
            cursor: 'pointer',
            backgroundColor: activeTab === 'orders' ? '#0a2540' : 'transparent',
            color: activeTab === 'orders' ? '#ffffff' : '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>📋</span>
          <span>Orders</span>
          <span
            style={{
              backgroundColor: activeTab === 'orders' ? '#ea580c' : '#e2e8f0',
              color: activeTab === 'orders' ? '#ffffff' : '#475569',
              padding: '0.15rem 0.55rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '800',
            }}
          >
            {orders.length}
          </span>
        </button>

        {/* Payment History Tab */}
        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          style={{
            padding: '0.7rem 1.35rem',
            borderRadius: '0.6rem',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: '700',
            cursor: 'pointer',
            backgroundColor: activeTab === 'payments' ? '#0a2540' : 'transparent',
            color: activeTab === 'payments' ? '#ffffff' : '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.15s ease',
          }}
        >
          <span>💵</span>
          <span>Payment History</span>
          <span
            style={{
              backgroundColor: activeTab === 'payments' ? '#ea580c' : '#e2e8f0',
              color: activeTab === 'payments' ? '#ffffff' : '#475569',
              padding: '0.15rem 0.55rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '800',
            }}
          >
            {payments.length}
          </span>
        </button>
      </div>

      {/* 4. Tab Contents */}

      {/* TAB: INSTALLMENTS (Requirement 6, 7, 8) */}
      {activeTab === 'installments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {installmentItems.length === 0 ? (
            <div style={{
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              backgroundColor: '#ffffff',
              borderRadius: '1.25rem',
              border: '1px dashed #cbd5e1',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💳</div>
              <h3 style={{ color: '#0f172a', fontWeight: '700', marginBottom: '0.25rem' }}>No Installments on File</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                This member does not have any active or recorded installment plans.
              </p>
            </div>
          ) : (
            <div className="table-container" style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1.25rem',
              overflow: 'hidden',
              boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
            }}>
              <div style={{ overflowX: 'auto' }}>
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
                    <tr
                      style={{
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: '0.775rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: '700',
                      }}
                    >
                      <th style={{ padding: '0.9rem 1rem' }}>Product</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Installment #</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Due Date</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Amount</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Paid</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Remaining</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installmentItems.map((item, index) => {
                      const isPaid = item.status === 'Paid';
                      const isOverdue = item.isOverdue;
                      const isDueToday = item.status === 'Due Today';

                      return (
                        <tr
                          key={`${item.planId}_inst_${item.installmentNumber}_${index}`}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            backgroundColor: isOverdue ? '#fff5f5' : '#ffffff',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseOver={(e) => { if (!isOverdue) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                          onMouseOut={(e) => { if (!isOverdue) e.currentTarget.style.backgroundColor = '#ffffff'; }}
                        >
                          {/* Product */}
                          <td data-label="Product" style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>
                              {item.productName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Plan #{item.planId.slice(0, 8)}
                            </div>
                          </td>

                          {/* Installment # */}
                          <td data-label="Installment #" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                padding: '0.25rem 0.55rem',
                                borderRadius: '0.35rem',
                                backgroundColor: '#f1f5f9',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                color: '#0f172a',
                              }}
                            >
                              #{item.installmentNumber} of {item.totalInstallments}
                            </span>
                          </td>

                          {/* Due Date */}
                          <td data-label="Due Date" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: '600', color: isOverdue ? '#dc2626' : '#0f172a' }}>
                              {item.dueDate ? formatIndianDate(item.dueDate) : '—'}
                            </div>
                            {isOverdue && (
                              <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '700' }}>
                                ⚠️ {item.overdueDays} days overdue
                              </div>
                            )}
                            {isDueToday && (
                              <div style={{ fontSize: '0.75rem', color: '#c2410c', fontWeight: '700' }}>
                                🔔 Due Today
                              </div>
                            )}
                          </td>

                          {/* Amount */}
                          <td data-label="Amount" style={{ padding: '1rem', fontWeight: '600', color: '#0f172a' }}>
                            {formatINR(item.amount)}
                          </td>

                          {/* Paid Amount */}
                          <td data-label="Paid" style={{ padding: '1rem', color: '#047857', fontWeight: '700' }}>
                            {formatINR(item.paidAmount)}
                          </td>

                          {/* Remaining Amount */}
                          <td data-label="Remaining" style={{ padding: '1rem', fontWeight: '800', color: item.remainingAmount > 0 ? (isOverdue ? '#dc2626' : '#ea580c') : '#64748b' }}>
                            {formatINR(item.remainingAmount)}
                          </td>

                          {/* Status Badge (Requirement: Paid=green, Due Today=orange, Overdue=red, Upcoming=blue) */}
                          <td data-label="Status" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '9999px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                backgroundColor: isOverdue
                                  ? '#fef2f2'
                                  : isPaid
                                  ? '#ecfdf5'
                                  : isDueToday
                                  ? '#fff7ed'
                                  : '#eff6ff',
                                color: isOverdue
                                  ? '#b91c1c'
                                  : isPaid
                                  ? '#047857'
                                  : isDueToday
                                  ? '#c2410c'
                                  : '#1d4ed8',
                                border: `1px solid ${
                                  isOverdue
                                    ? '#fecaca'
                                    : isPaid
                                    ? '#a7f3d0'
                                    : isDueToday
                                    ? '#fed7aa'
                                    : '#bfdbfe'
                                }`,
                              }}
                            >
                              <span>{isOverdue ? '🚨' : isPaid ? '✅' : isDueToday ? '⏳' : '📅'}</span>
                              <span>{item.status}</span>
                            </span>
                          </td>

                          {/* Actions: Collect Payment (Requirement 8) */}
                          <td data-label="Action" style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {item.canCollect ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCollect(item.plan, item.installmentNumber)}
                                className="btn btn-orange btn-sm"
                                style={{
                                  padding: '0.4rem 0.85rem',
                                  fontSize: '0.8rem',
                                  fontWeight: '700',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                                title={`Collect ₹${item.remainingAmount} for Installment #${item.installmentNumber}`}
                              >
                                <span>💰</span>
                                <span>Collect Payment</span>
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: '#047857', fontWeight: '700' }}>
                                ✓ Paid in Full
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: ORDERS (Requirement 4) */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orders.length === 0 ? (
            <div style={{
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              backgroundColor: '#ffffff',
              borderRadius: '1.25rem',
              border: '1px dashed #cbd5e1',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📦</div>
              <h3 style={{ color: '#0f172a', fontWeight: '700', marginBottom: '0.25rem' }}>No Orders Found</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                This member has not placed any merchandise orders yet.
              </p>
            </div>
          ) : (
            <div className="table-container" style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1.25rem',
              overflow: 'hidden',
              boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
            }}>
              <div style={{ overflowX: 'auto' }}>
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
                    <tr
                      style={{
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: '0.775rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: '700',
                      }}
                    >
                      <th style={{ padding: '0.9rem 1rem' }}>Order ID</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Product</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Qty</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Unit Price</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Total Amount</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Order Status</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Delivery Status</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Expected Delivery</th>
                      <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>Order Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const status = (order.status || 'pending').toLowerCase();
                      let statusBadge = { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'Pending' };
                      if (status === 'approved') statusBadge = { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'Approved' };
                      if (status === 'completed') statusBadge = { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'Completed' };
                      if (status === 'rejected') statusBadge = { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'Rejected' };

                      const deliveryStatus = getNormalizedDeliveryStatus(order);
                      let dBadge = { bg: '#f8fafc', color: '#334155', border: '#cbd5e1', icon: '📝', label: 'Order Placed' };
                      if (deliveryStatus === 'Approved') dBadge = { bg: '#eff6ff', color: '#0284c7', border: '#bae6fd', icon: '✓', label: 'Approved' };
                      if (deliveryStatus === 'Preparing') dBadge = { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa', icon: '📦', label: 'Preparing' };
                      if (deliveryStatus === 'Out for Delivery') dBadge = { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', icon: '🚚', label: 'Out for Delivery' };
                      if (deliveryStatus === 'Delivered') dBadge = { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: '🏠', label: 'Delivered' };
                      const isDelivered = deliveryStatus === 'Delivered';

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
                          <td data-label="Order ID" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <code
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.35rem',
                                backgroundColor: '#fff7ed',
                                color: '#ea580c',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                border: '1px solid #fed7aa',
                              }}
                            >
                              #{order.id.slice(0, 8)}
                            </code>
                          </td>

                          <td data-label="Product" style={{ padding: '1rem', fontWeight: '700', color: '#0f172a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '0.45rem',
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
                              <span>{order.productName || 'Product'}</span>
                            </div>
                          </td>

                          <td data-label="Qty" style={{ padding: '1rem', color: '#0f172a', fontWeight: '600' }}>
                            {order.quantity || 1}
                          </td>

                          <td data-label="Unit Price" style={{ padding: '1rem', color: '#64748b' }}>
                            {formatINR(order.unitPrice || 0)}
                          </td>

                          <td data-label="Total Amount" style={{ padding: '1rem', fontWeight: '800', color: '#047857' }}>
                            {formatINR(order.totalAmount || 0)}
                          </td>

                          <td data-label="Order Status" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.65rem',
                                borderRadius: '9999px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                backgroundColor: statusBadge.bg,
                                color: statusBadge.color,
                                border: `1px solid ${statusBadge.border}`,
                              }}
                            >
                              {statusBadge.label}
                            </span>
                          </td>

                          <td data-label="Delivery Status" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.65rem',
                                borderRadius: '9999px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                backgroundColor: dBadge.bg,
                                color: dBadge.color,
                                border: `1px solid ${dBadge.border}`,
                              }}
                            >
                              <span>{dBadge.icon}</span>
                              <span>{dBadge.label}</span>
                            </span>
                          </td>

                          <td data-label="Expected Delivery" style={{ padding: '1rem', fontSize: '0.85rem' }}>
                            {isDelivered ? (
                              <span style={{ color: '#047857', fontWeight: '700' }}>✓ Delivered</span>
                            ) : order.expectedDeliveryDate ? (
                              <span style={{ color: '#0a2540', fontWeight: '700' }}>📅 {formatIndianDate(order.expectedDeliveryDate)}</span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.75rem' }}>Delivery date will be updated soon.</span>
                            )}
                          </td>

                          <td data-label="Order Date" style={{ padding: '1rem', textAlign: 'right', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.825rem' }}>
                            {order.createdAt ? formatIndianDate(order.createdAt) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: PAYMENT HISTORY (Requirement 5 & 9: Date, Amount, Method, Txn ID, Status, Receipt button) */}
      {activeTab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {payments.length === 0 ? (
            <div style={{
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              backgroundColor: '#ffffff',
              borderRadius: '1.25rem',
              border: '1px dashed #cbd5e1',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💵</div>
              <h3 style={{ color: '#0f172a', fontWeight: '700', marginBottom: '0.25rem' }}>No Payment History</h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                No completed or manual payments have been recorded for this member yet.
              </p>
            </div>
          ) : (
            <div className="table-container" style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '1.25rem',
              overflow: 'hidden',
              boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
            }}>
              <div style={{ overflowX: 'auto' }}>
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
                    <tr
                      style={{
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: '0.775rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: '700',
                      }}
                    >
                      <th style={{ padding: '0.9rem 1rem' }}>Date</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Receipt / Txn ID</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Product & Installment</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Method</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Amount</th>
                      <th style={{ padding: '0.9rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => {
                      const displayDate = payment.paymentDate || payment.createdAt || '';
                      const txnId = payment.transactionId || payment.gatewayOrderId || 'N/A';
                      const receiptNum = payment.receiptNumber || `REC-${payment.id.slice(0, 6).toUpperCase()}`;

                      return (
                        <tr
                          key={payment.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                        >
                          {/* Date */}
                          <td data-label="Date" style={{ padding: '1rem', whiteSpace: 'nowrap', fontWeight: '600', color: '#0f172a', fontSize: '0.85rem' }}>
                            {displayDate ? formatIndianDate(displayDate) : '—'}
                          </td>

                          {/* Receipt / Txn ID */}
                          <td data-label="Receipt / Txn ID" style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: '700', color: '#ea580c', fontSize: '0.85rem' }}>
                              {receiptNum}
                            </div>
                            {txnId !== 'N/A' && (
                              <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                                Txn: {txnId}
                              </div>
                            )}
                          </td>

                          {/* Product & Installment */}
                          <td data-label="Product & Inst" style={{ padding: '1rem' }}>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>
                              {payment.productName || 'Merchandise'}
                            </div>
                            {payment.installmentNumber && (
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Installment #{payment.installmentNumber}
                              </div>
                            )}
                          </td>

                          {/* Method */}
                          <td data-label="Method" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '0.45rem',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                fontSize: '0.825rem',
                                color: '#0f172a',
                                fontWeight: '600',
                              }}
                            >
                              <span>{payment.paymentMethod === 'Cash' ? '💵' : payment.paymentMethod?.includes('UPI') ? '📱' : '🏦'}</span>
                              <span>{payment.paymentMethod || 'Cash'}</span>
                            </span>
                          </td>

                          {/* Amount */}
                          <td data-label="Amount" style={{ padding: '1rem', fontWeight: '800', color: '#047857', whiteSpace: 'nowrap' }}>
                            {formatINR(payment.amount || 0)}
                          </td>

                          {/* Payment Status */}
                          <td data-label="Status" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.2rem 0.65rem',
                                borderRadius: '9999px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                backgroundColor: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                              }}
                            >
                              <span>●</span>
                              <span>{payment.status || 'Successful'}</span>
                            </span>
                          </td>

                          {/* Receipt Button (Requirement 5 & 9) */}
                          <td data-label="Receipt" style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenReceipt(payment)}
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                              }}
                              title="Print or view official payment receipt"
                            >
                              <span>🖨️</span>
                              <span>Print Receipt</span>
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
        </div>
      )}

      {/* 5. Modals Integration */}

      {/* Existing Edit Member Modal (Requirement 10) */}
      <MemberModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveMember}
        initialData={member}
      />

      {/* Existing Collect Payment Modal (Requirement 8) */}
      <RecordPaymentModal
        isOpen={isCollectModalOpen}
        onClose={() => {
          setIsCollectModalOpen(false);
          setSelectedPlanForCollect(null);
          setSelectedInstNumForCollect(null);
        }}
        plan={selectedPlanForCollect}
        defaultInstallmentNumber={selectedInstNumForCollect}
        onPaymentRecorded={handlePaymentRecorded}
      />

      {/* Existing Payment Receipt Modal (Requirement 9) */}
      <PaymentReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setSelectedPaymentForReceipt(null);
        }}
        payment={selectedPaymentForReceipt}
        currentUser={currentUser}
        isAdmin={true}
      />
    </div>
  );
};

export default MemberDetailsView;
