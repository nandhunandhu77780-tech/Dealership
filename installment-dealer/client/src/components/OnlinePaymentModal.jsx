import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  createPaymentOrder,
  verifyPayment,
  sandboxAuthorize,
  loadRazorpayScript,
  getPaymentConfig,
} from '../services/onlinePaymentService.js';
import { formatINR, sanitizeErrorMessage } from '../utils/formatters.js';
import PaymentReceiptModal from './PaymentReceiptModal.jsx';

const UPI_OPTIONS = [
  { id: 'upi_gpay', name: 'Google Pay', icon: '🟢', method: 'UPI (Google Pay)', hint: 'Pay via Google Pay UPI' },
  { id: 'upi_phonepe', name: 'PhonePe', icon: '🟣', method: 'UPI (PhonePe)', hint: 'Pay via PhonePe UPI' },
  { id: 'upi_qr', name: 'UPI QR Code', icon: '📱', method: 'UPI (QR Code)', hint: 'Scan & Pay using any UPI app' },
  { id: 'upi_other', name: 'Other UPI Apps', icon: '⚡', method: 'UPI (Other Apps)', hint: 'Paytm, BHIM, or enter UPI ID' },
];

const OnlinePaymentModal = ({
  isOpen,
  onClose,
  plan = null,
  installmentNumber = null,
  onPaymentSuccess = null,
}) => {
  const { currentUser, userProfile } = useAuth();

  // Selected installment details
  const [selectedInstNumber, setSelectedInstNumber] = useState(1);
  const [amountToPay, setAmountToPay] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState('upi_gpay');
  const [customUpiId, setCustomUpiId] = useState('');

  // Payment Lifecycle State: 'ready' | 'processing' | 'success' | 'failed' | 'cancelled'
  const [paymentState, setPaymentState] = useState('ready');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [transactionResult, setTransactionResult] = useState(null);

  // Gateway Config
  const [gatewayConfig, setGatewayConfig] = useState({ keyId: '', isConfigured: false });

  // Receipt Modal trigger
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Extract schedule items
  const schedule = useMemo(() => {
    return Array.isArray(plan?.schedule) ? plan.schedule : [];
  }, [plan]);

  // Find target installment
  const targetItem = useMemo(() => {
    return schedule.find((s) => s.installmentNumber === Number(selectedInstNumber)) || null;
  }, [schedule, selectedInstNumber]);

  const installmentAmount = targetItem ? parseFloat(targetItem.amount) || 0 : 0;
  const alreadyPaid = targetItem ? parseFloat(targetItem.paidAmount) || 0 : 0;
  const remainingAmount = parseFloat(Math.max(0, installmentAmount - alreadyPaid).toFixed(2));

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen && plan) {
      setPaymentState('ready');
      setErrorMessage('');
      setStatusMessage('');
      setTransactionResult(null);
      setShowReceiptModal(false);

      if (installmentNumber && schedule.some((s) => s.installmentNumber === Number(installmentNumber))) {
        setSelectedInstNumber(Number(installmentNumber));
      } else {
        const firstUnpaid = schedule.find((s) => s.status !== 'Paid');
        if (firstUnpaid) {
          setSelectedInstNumber(firstUnpaid.installmentNumber);
        } else if (schedule.length > 0) {
          setSelectedInstNumber(schedule[0].installmentNumber);
        }
      }

      // Preload gateway config & Razorpay script
      getPaymentConfig().then((cfg) => setGatewayConfig(cfg));
      loadRazorpayScript();
    }
  }, [isOpen, plan, installmentNumber, schedule]);

  // Update default amount when installment changes
  useEffect(() => {
    if (remainingAmount > 0) {
      setAmountToPay(remainingAmount.toString());
    } else {
      setAmountToPay('0');
    }
  }, [remainingAmount, selectedInstNumber]);

  if (!isOpen || !plan) return null;

  const handlePayFullRemaining = () => {
    setAmountToPay(remainingAmount.toFixed(2));
    setErrorMessage('');
  };

  const handleStartPayment = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const payNum = parseFloat(amountToPay);

    // Strict validation
    if (isNaN(payNum) || payNum <= 0) {
      setErrorMessage('Please enter a valid positive payment amount.');
      return;
    }

    if (payNum > remainingAmount) {
      setErrorMessage(`The payment amount (₹${payNum}) cannot exceed the installment remaining amount (₹${remainingAmount}).`);
      return;
    }

    const selectedOption = UPI_OPTIONS.find((o) => o.id === selectedMethodId) || UPI_OPTIONS[0];

    // If using 'upi_other' and user provided custom UPI ID, validate simple format
    if (selectedMethodId === 'upi_other' && customUpiId.trim()) {
      if (!customUpiId.includes('@')) {
        setErrorMessage('Please enter a valid UPI ID (e.g. name@okhdfcbank, mobile@paytm).');
        return;
      }
    }

    setPaymentState('processing');
    setStatusMessage('Initiating secure payment order with NANDANAM Agencies...');

    try {
      // Step 1: Create Order on server
      const orderData = await createPaymentOrder({
        installmentPlanId: plan.id,
        installmentNumber: selectedInstNumber,
        amount: payNum,
        paymentMethod: selectedOption.method,
      });

      // Step 2: Handle Live Razorpay or Sandbox
      if (gatewayConfig.isConfigured && window.Razorpay) {
        setStatusMessage('Connecting to UPI / Payment Gateway...');

        const options = {
          key: gatewayConfig.keyId,
          amount: Math.round(payNum * 100),
          currency: 'INR',
          name: 'NANDANAM Agencies',
          description: `Installment #${selectedInstNumber} for ${plan.productName}`,
          image: '/logo.png',
          order_id: orderData.orderId,
          prefill: {
            name: plan.memberName || userProfile?.name || currentUser?.displayName || '',
            email: currentUser?.email || '',
            contact: userProfile?.phone || '',
          },
          theme: {
            color: '#0a2540',
          },
          handler: async (response) => {
            try {
              setStatusMessage('Verifying digital transaction signature...');
              const verifyRes = await verifyPayment({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                installmentPlanId: plan.id,
                installmentNumber: selectedInstNumber,
                amount: payNum,
                paymentMethod: selectedOption.method,
              });

              setTransactionResult(verifyRes);
              setPaymentState('success');

              if (onPaymentSuccess) {
                onPaymentSuccess(verifyRes.payment, verifyRes.updatedPlan);
              }
            } catch (vErr) {
              console.error('Signature verification failed:', vErr);
              setErrorMessage(sanitizeErrorMessage(vErr, 'Payment verification failed. Please contact support.'));
              setPaymentState('failed');
            }
          },
          modal: {
            ondismiss: () => {
              setPaymentState('cancelled');
              setStatusMessage('Payment cancelled by user.');
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp) => {
          console.error('Razorpay payment failed:', resp.error);
          setErrorMessage(resp.error?.description || 'Payment was declined by the bank.');
          setPaymentState('failed');
        });
        rzp.open();
        return;
      }

      // Step 3: Sandbox / Demo Gateway Simulator
      setStatusMessage(`Authenticating with ${selectedOption.name} UPI App...`);

      setTimeout(async () => {
        try {
          setStatusMessage('Processing instantaneous payment confirmation...');
          const verifyRes = await sandboxAuthorize({
            installmentPlanId: plan.id,
            installmentNumber: selectedInstNumber,
            amount: payNum,
            paymentMethod: selectedOption.method,
          });

          setTransactionResult(verifyRes);
          setPaymentState('success');

          if (onPaymentSuccess) {
            onPaymentSuccess(verifyRes.payment, verifyRes.updatedPlan);
          }
        } catch (err) {
          console.error('Payment processing failed:', err);
          setErrorMessage(sanitizeErrorMessage(err, 'Failed to complete payment.'));
          setPaymentState('failed');
        }
      }, 1400);
    } catch (err) {
      console.error('Failed to create payment order:', err);
      setErrorMessage(sanitizeErrorMessage(err, 'Could not initiate payment.'));
      setPaymentState('failed');
    }
  };

  const handleSimulateCancel = () => {
    setPaymentState('cancelled');
    setStatusMessage('You cancelled the payment request.');
  };

  const handleSimulateFailure = () => {
    setPaymentState('failed');
    setErrorMessage('Simulated failure: Bank server timeout or incorrect UPI PIN entered.');
  };

  const handleRetry = () => {
    setPaymentState('ready');
    setErrorMessage('');
    setStatusMessage('');
  };

  const selectedOption = UPI_OPTIONS.find((o) => o.id === selectedMethodId) || UPI_OPTIONS[0];

  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1250,
        padding: '1rem',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '1.25rem',
          padding: '2rem',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          maxHeight: '94vh',
          overflowY: 'auto',
          position: 'relative',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '1.4rem' }}>⚡</span>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Online Installment Payment
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Secure UPI & Instant Payment Gateway &bull; NANDANAM Agencies
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={paymentState === 'processing'}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1.6rem',
                cursor: paymentState === 'processing' ? 'not-allowed' : 'pointer',
                lineHeight: 1,
                padding: '0.25rem',
              }}
              title="Close"
            >
              &times;
            </button>
          </div>

          {/* STATE 1: SUCCESSFUL */}
          {paymentState === 'success' && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                backgroundColor: '#ecfdf5',
                border: '2px solid #10b981',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                margin: '0 auto 1.15rem',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
              }}>
                ✓
              </div>

              <h3 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#059669', margin: '0 0 0.4rem' }}>
                Payment Successful!
              </h3>
              <p style={{ color: '#475569', fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: '1.5' }}>
                Your installment payment has been securely confirmed and recorded in your account.
              </p>

              {/* Transaction Summary Card */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.85rem',
                padding: '1.25rem',
                textAlign: 'left',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>Transaction ID:</span>
                  <code style={{ color: '#0a2540', fontWeight: '800' }}>
                    {transactionResult?.transactionId || transactionResult?.payment?.transactionId || 'N/A'}
                  </code>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>Amount Paid:</span>
                  <strong style={{ color: '#059669', fontSize: '1.05rem' }}>{formatINR(amountToPay)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>Installment:</span>
                  <span style={{ color: '#0f172a', fontWeight: '700' }}>
                    #{selectedInstNumber} &bull; {plan.productName}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0' }}>
                  <span style={{ color: '#64748b' }}>Payment Method:</span>
                  <span style={{ color: '#1e40af', fontWeight: '700' }}>{selectedOption.method}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(true)}
                  className="btn btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.7rem 1.4rem',
                    fontWeight: '700',
                  }}
                >
                  <span>🧾</span>
                  <span>View Official Receipt</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ padding: '0.7rem 1.4rem', fontWeight: '700' }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* STATE 2: PROCESSING */}
          {paymentState === 'processing' && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 1.25rem', width: '48px', height: '48px' }} />
              <h4 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.5rem' }}>
                Processing UPI Payment...
              </h4>
              <p style={{ color: '#1e40af', fontSize: '0.925rem', fontWeight: '600', margin: '0 0 1.5rem' }}>
                {statusMessage}
              </p>

              <div style={{
                padding: '0.85rem 1rem',
                backgroundColor: '#eff6ff',
                borderRadius: '0.6rem',
                border: '1px solid #bfdbfe',
                fontSize: '0.825rem',
                color: '#1e40af',
                maxWidth: '420px',
                margin: '0 auto 1.5rem',
                lineHeight: '1.45',
              }}>
                Please do not refresh the page or click back while your payment authorization is being confirmed.
              </div>

              {/* Sandbox controls for testing */}
              {!gatewayConfig.isConfigured && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleSimulateCancel}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#fff7ed',
                      border: '1px solid #fed7aa',
                      color: '#c2410c',
                      borderRadius: '0.35rem',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Simulate Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleSimulateFailure}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      borderRadius: '0.35rem',
                      cursor: 'pointer',
                      fontWeight: '600',
                    }}
                  >
                    Simulate Failure
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STATE 3: FAILED */}
          {paymentState === 'failed' && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: '#fef2f2',
                border: '2px solid #ef4444',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                margin: '0 auto 1rem',
              }}>
                ✕
              </div>

              <h4 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#dc2626', margin: '0 0 0.5rem' }}>
                Payment Failed
              </h4>
              <p style={{ color: '#475569', fontSize: '0.9rem', margin: '0 auto 1.5rem', maxWidth: '420px', lineHeight: '1.5' }}>
                {errorMessage || 'Your transaction could not be processed. No money was deducted from your bank account.'}
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="btn btn-orange"
                  style={{ padding: '0.65rem 1.4rem' }}
                >
                  <span>🔄</span>
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ padding: '0.65rem 1.4rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* STATE 4: CANCELLED */}
          {paymentState === 'cancelled' && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: '#fff7ed',
                border: '2px solid #f59e0b',
                color: '#c2410c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                margin: '0 auto 1rem',
              }}>
                ⚠️
              </div>

              <h4 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#c2410c', margin: '0 0 0.5rem' }}>
                Payment Cancelled
              </h4>
              <p style={{ color: '#475569', fontSize: '0.9rem', margin: '0 auto 1.5rem', maxWidth: '420px', lineHeight: '1.5' }}>
                {statusMessage || 'The payment request was cancelled. You can retry at any time.'}
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="btn btn-orange"
                  style={{ padding: '0.65rem 1.4rem' }}
                >
                  Resume Payment
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ padding: '0.65rem 1.4rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* STATE 5: READY (FORM VIEW) */}
          {paymentState === 'ready' && (
            <form onSubmit={handleStartPayment}>
              {/* Error Banner */}
              {errorMessage && (
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.5rem',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}>
                  {errorMessage}
                </div>
              )}

              {/* Requirement 2: Context Details Card */}
              {/* Member name, Product name, Installment number, Installment amount, Already paid amount, Remaining amount */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.85rem',
                padding: '1.25rem',
                marginBottom: '1.25rem',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '0.85rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>
                      Member Name
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '0.95rem', fontWeight: '800' }}>
                      {plan.memberName || userProfile?.name || currentUser?.displayName || 'Member'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: '600' }}>
                      Product Name
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '0.95rem', fontWeight: '800' }}>
                      {plan.productName}
                    </strong>
                  </div>
                </div>

                {/* Installment Selector if multiple exist */}
                <div style={{ marginBottom: '0.85rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#475569', display: 'block', marginBottom: '0.35rem', fontWeight: '700' }}>
                    Installment Number & Due Date
                  </label>
                  <select
                    value={selectedInstNumber}
                    onChange={(e) => setSelectedInstNumber(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      fontSize: '0.85rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '0.5rem',
                      color: '#0f172a',
                    }}
                  >
                    {schedule.map((item) => {
                      const itemRem = parseFloat(Math.max(0, item.amount - (item.paidAmount || 0)).toFixed(2));
                      return (
                        <option key={item.installmentNumber} value={item.installmentNumber}>
                          Installment #{item.installmentNumber} — Due: {item.dueDate} | Bal: {formatINR(itemRem)} [{item.status}]
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Financial Breakdown (Installment Amount, Already Paid, Remaining) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.5rem',
                  padding: '0.85rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.6rem',
                  textAlign: 'center',
                }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', fontWeight: '600' }}>
                      Inst. Amount
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: '800' }}>
                      {formatINR(installmentAmount)}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#065f46', display: 'block', fontWeight: '600' }}>
                      Already Paid
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: '#059669', fontWeight: '800' }}>
                      {formatINR(alreadyPaid)}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.7rem', color: '#9a3412', display: 'block', fontWeight: '600' }}>
                      Remaining Balance
                    </span>
                    <strong style={{ fontSize: '0.95rem', color: remainingAmount > 0 ? '#ea580c' : '#059669', fontWeight: '800' }}>
                      {formatINR(remainingAmount)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Amount to Pay Input */}
              <div style={{ marginBottom: '1.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: '700' }}>
                    Amount to Pay (₹) <span className="required-star">*</span>
                  </label>
                  {remainingAmount > 0 && (
                    <button
                      type="button"
                      onClick={handlePayFullRemaining}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ea580c',
                        fontSize: '0.775rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      Pay Full Remaining ({formatINR(remainingAmount)})
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '1.25rem',
                    fontWeight: '800',
                    color: '#059669',
                  }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={remainingAmount}
                    value={amountToPay}
                    onChange={(e) => setAmountToPay(e.target.value)}
                    disabled={remainingAmount <= 0}
                    required
                    placeholder="Enter amount..."
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem 0.75rem 2.4rem',
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      color: '#0f172a',
                      letterSpacing: '0.02em',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '0.6rem',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem', display: 'block' }}>
                  Maximum payable for this installment: <strong style={{ color: '#0f172a' }}>{formatINR(remainingAmount)}</strong>
                </span>
              </div>

              {/* Requirement 3: Online Payment Options (UPI, Google Pay, PhonePe, Other UPI apps) */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: '700', display: 'block', marginBottom: '0.6rem' }}>
                  Select Payment Method <span className="required-star">*</span>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  {UPI_OPTIONS.map((opt) => {
                    const isSelected = selectedMethodId === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setSelectedMethodId(opt.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.85rem',
                          borderRadius: '0.65rem',
                          border: `2px solid ${isSelected ? '#0a2540' : '#e2e8f0'}`,
                          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected ? '0 2px 8px rgba(10, 37, 64, 0.08)' : 'var(--shadow-xs)',
                        }}
                      >
                        <span style={{ fontSize: '1.4rem' }}>{opt.icon}</span>
                        <div>
                          <span style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: '800',
                            color: isSelected ? '#0a2540' : '#0f172a',
                          }}>
                            {opt.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>
                            {opt.hint}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Optional Custom UPI ID Input */}
                {selectedMethodId === 'upi_other' && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <input
                      type="text"
                      value={customUpiId}
                      onChange={(e) => setCustomUpiId(e.target.value)}
                      placeholder="Enter UPI ID (e.g. mobile@paytm, user@ybl)..."
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.85rem',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0.5rem',
                        color: '#0f172a',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Gateway Badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.95rem',
                backgroundColor: '#f8fafc',
                borderRadius: '0.6rem',
                border: '1px solid #e2e8f0',
                marginBottom: '1.5rem',
                fontSize: '0.775rem',
                color: '#64748b',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span>🔒</span>
                  <span>256-bit Encrypted Payment Gateway</span>
                </div>
                <span style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  backgroundColor: gatewayConfig.isConfigured ? '#ecfdf5' : '#eff6ff',
                  color: gatewayConfig.isConfigured ? '#047857' : '#1e40af',
                  fontWeight: '700',
                  fontSize: '0.725rem',
                }}>
                  {gatewayConfig.isConfigured ? 'Razorpay Live' : 'Verified UPI Sandbox'}
                </span>
              </div>

              {/* Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.85rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  style={{ padding: '0.7rem 1.35rem', fontWeight: '700' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={remainingAmount <= 0}
                  className="btn btn-orange"
                  style={{
                    padding: '0.75rem 1.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: '800',
                    fontSize: '1rem',
                    cursor: remainingAmount <= 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span>⚡</span>
                  <span>Pay {formatINR(amountToPay || 0)} Now</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Embedded Official Receipt Modal */}
      {showReceiptModal && transactionResult?.payment && (
        <PaymentReceiptModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          payment={transactionResult.payment}
          currentUser={currentUser}
          isAdmin={false}
        />
      )}
    </>
  );
};

export default OnlinePaymentModal;
