import connectDB, { db } from '../config/db.js';
import http from 'http';
import express from 'express';
import cors from 'cors';
import paymentRoutes from '../routes/paymentRoutes.js';
import healthRoutes from '../routes/healthRoutes.js';
import { generateSandboxSignature } from '../config/razorpay.js';

const PORT = 5099;
const BASE_URL = `http://localhost:${PORT}/api`;

const runTests = async () => {
  console.log('\n========================================');
  console.log('🧪 RUNNING ONLINE PAYMENT AUTOMATED TESTS');
  console.log('========================================\n');

  let serverInstance = null;
  let testPlanId = null;
  let testPaymentId = null;

  try {
    // 1. Connect Firestore
    await connectDB();

    // 2. Start dedicated Express test server
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api', healthRoutes);
    app.use('/api/payments', paymentRoutes);

    await new Promise((resolve) => {
      serverInstance = app.listen(PORT, () => {
        console.log(`[Test Server] Running on port ${PORT}`);
        resolve();
      });
    });

    // 3. Test GET /api/health
    console.log('\n--- 1. Testing GET /api/health ---');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthJson = await healthRes.json();
    console.log('Health Response:', healthJson);
    if (!healthJson.success) throw new Error('Health check failed');
    console.log('✅ Health check passed.');

    // 4. Test GET /api/payments/config
    console.log('\n--- 2. Testing GET /api/payments/config ---');
    const configRes = await fetch(`${BASE_URL}/payments/config`);
    const configJson = await configRes.json();
    console.log('Config Response:', configJson);
    if (!configJson.success || !configJson.keyId) throw new Error('Config check failed');
    console.log('✅ Payment config passed.');

    // 5. Create a test member and test installment plan in Firestore
    console.log('\n--- 3. Setting up Test Installment Plan in Firestore ---');
    const testMemberId = `test_member_${Date.now()}`;
    const testMemberName = 'Test Member Auto';

    const testPlanRef = db.collection('installmentPlans').doc();
    testPlanId = testPlanRef.id;

    const initialPlanData = {
      orderId: `test_order_${Date.now()}`,
      memberId: testMemberId,
      memberName: testMemberName,
      productName: 'Test Smart Watch',
      totalAmount: 10000,
      downPayment: 1000,
      remainingAmount: 9000,
      numberOfInstallments: 3,
      installmentAmount: 3000,
      frequency: 'Monthly',
      firstDueDate: '2026-10-15',
      status: 'active',
      schedule: [
        {
          installmentNumber: 1,
          dueDate: '2026-10-15',
          amount: 3000,
          paidAmount: 0,
          status: 'Pending',
        },
        {
          installmentNumber: 2,
          dueDate: '2026-11-15',
          amount: 3000,
          paidAmount: 0,
          status: 'Pending',
        },
        {
          installmentNumber: 3,
          dueDate: '2026-12-15',
          amount: 3000,
          paidAmount: 0,
          status: 'Pending',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await testPlanRef.set(initialPlanData);
    console.log(`✅ Created test installment plan ID: ${testPlanId}`);

    // Auth Token for test member
    const memberAuthHeader = `Bearer test_member_token_${testMemberId}`;
    const otherMemberAuthHeader = `Bearer test_member_token_different_user_${Date.now()}`;

    // 6. Test Authentication Required (no token)
    console.log('\n--- 4. Testing Unauthenticated Request Rejection ---');
    const unauthRes = await fetch(`${BASE_URL}/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installmentPlanId: testPlanId,
        installmentNumber: 1,
        amount: 3000,
      }),
    });
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got: ${unauthRes.status}`);
    }
    console.log('✅ Unauthenticated request successfully rejected with 401.');

    // 7. Test Ownership Enforcement (Requirement 12: Member can only pay for their own plan)
    console.log('\n--- 5. Testing Member Ownership Enforcement (Requirement 12) ---');
    const wrongUserRes = await fetch(`${BASE_URL}/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: otherMemberAuthHeader,
      },
      body: JSON.stringify({
        installmentPlanId: testPlanId,
        installmentNumber: 1,
        amount: 3000,
      }),
    });
    const wrongUserJson = await wrongUserRes.json();
    console.log('Wrong user response status:', wrongUserRes.status, wrongUserJson.message);
    if (wrongUserRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for wrong user, got: ${wrongUserRes.status}`);
    }
    console.log('✅ Other member cannot pay for another member\'s installment (403 Forbidden).');

    // 8. Test Amount Exceeding Remaining Balance (Requirement 5)
    console.log('\n--- 6. Testing Amount Exceeding Remaining Balance Rejection (Requirement 5) ---');
    const excessRes = await fetch(`${BASE_URL}/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: memberAuthHeader,
      },
      body: JSON.stringify({
        installmentPlanId: testPlanId,
        installmentNumber: 1,
        amount: 5000, // Installment is 3000, 5000 exceeds it
      }),
    });
    const excessJson = await excessRes.json();
    console.log('Excess amount response status:', excessRes.status, excessJson.message);
    if (excessRes.status !== 400) {
      throw new Error(`Expected 400 for amount exceeding balance, got: ${excessRes.status}`);
    }
    console.log('✅ Excess payment amount correctly rejected with 400.');

    // 9. Test Valid Gateway Order Creation (Requirement 2 & 4)
    console.log('\n--- 7. Testing Valid Gateway Order Creation ---');
    const orderRes = await fetch(`${BASE_URL}/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: memberAuthHeader,
      },
      body: JSON.stringify({
        installmentPlanId: testPlanId,
        installmentNumber: 1,
        amount: 3000,
      }),
    });
    const orderJson = await orderRes.json();
    console.log('Order creation response:', orderJson);
    if (!orderJson.success || !orderJson.order?.orderId) {
      throw new Error(`Order creation failed: ${JSON.stringify(orderJson)}`);
    }
    const createdOrderId = orderJson.order.orderId;
    console.log(`✅ Order created successfully: ${createdOrderId}`);

    // 10. Test Invalid Signature Rejection
    console.log('\n--- 8. Testing Invalid Signature Rejection ---');
    const fakePaymentId = `pay_fake_${Date.now()}`;
    const invalidVerifyRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: memberAuthHeader,
      },
      body: JSON.stringify({
        orderId: createdOrderId,
        paymentId: fakePaymentId,
        signature: 'invalid_tampered_signature_hex_12345',
        installmentPlanId: testPlanId,
        installmentNumber: 1,
        amount: 3000,
        paymentMethod: 'UPI (Google Pay)',
      }),
    });
    if (invalidVerifyRes.status !== 400) {
      throw new Error(`Expected 400 for invalid signature, got: ${invalidVerifyRes.status}`);
    }
    console.log('✅ Tampered / invalid cryptographic signature rejected with 400.');

    // 11. Test Successful Payment Verification & Atomic Firestore Updates (Requirements 6, 7, 8, 10)
    console.log('\n--- 9. Testing Successful Payment Verification & Firestore Updates ---');
    const realPaymentId = `pay_upi_${Date.now()}_9988`;
    testPaymentId = realPaymentId;
    const validSignature = generateSandboxSignature(createdOrderId, realPaymentId);

    const validVerifyRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: memberAuthHeader,
      },
      body: JSON.stringify({
        orderId: createdOrderId,
        paymentId: realPaymentId,
        signature: validSignature,
        installmentPlanId: testPlanId,
        installmentNumber: 1,
        amount: 3000,
        paymentMethod: 'UPI (Google Pay)',
      }),
    });
    const validVerifyJson = await validVerifyRes.json();
    console.log('Verify response:', validVerifyJson);
    if (!validVerifyJson.success || !validVerifyJson.paymentId) {
      throw new Error(`Payment verification failed: ${JSON.stringify(validVerifyJson)}`);
    }
    console.log(`✅ Payment verified! Recorded payment ID: ${validVerifyJson.paymentId}`);

    // 12. Verify Firestore 'payments' document (Requirement 6)
    console.log('\n--- 10. Verifying Document in Firestore "payments" Collection ---');
    const paymentDoc = await db.collection('payments').doc(validVerifyJson.paymentId).get();
    if (!paymentDoc.exists) throw new Error('Payment doc not found in Firestore!');
    const paymentData = paymentDoc.data();
    console.log('Firestore payment doc:', JSON.stringify(paymentData, null, 2));

    if (paymentData.memberId !== testMemberId) throw new Error('memberId mismatch');
    if (paymentData.installmentPlanId !== testPlanId) throw new Error('installmentPlanId mismatch');
    if (paymentData.installmentNumber !== 1) throw new Error('installmentNumber mismatch');
    if (paymentData.amount !== 3000) throw new Error('amount mismatch');
    if (paymentData.paymentMethod !== 'UPI (Google Pay)') throw new Error('paymentMethod mismatch');
    if (paymentData.transactionId !== realPaymentId) throw new Error('transactionId mismatch');
    if (paymentData.status !== 'Successful') throw new Error('status mismatch');
    console.log('✅ All Firestore "payments" fields verified according to Requirement 6.');

    // 13. Verify Installment Plan Balance and Schedule (Requirements 7 & 8)
    console.log('\n--- 11. Verifying Installment Plan Balance & Schedule Updates ---');
    const updatedPlanSnap = await db.collection('installmentPlans').doc(testPlanId).get();
    const updatedPlan = updatedPlanSnap.data();
    console.log('Updated plan totals:', {
      totalAmount: updatedPlan.totalAmount,
      totalPaid: updatedPlan.totalPaid,
      remainingBalance: updatedPlan.remainingBalance,
      status: updatedPlan.status,
    });
    console.log('Updated installment #1:', updatedPlan.schedule[0]);

    if (updatedPlan.schedule[0].paidAmount !== 3000) throw new Error('Schedule item paidAmount not 3000');
    if (updatedPlan.schedule[0].status !== 'Paid') throw new Error('Schedule item status not "Paid"');
    if (updatedPlan.totalPaid !== 4000) throw new Error(`Expected totalPaid 4000 (1000 downPayment + 3000), got ${updatedPlan.totalPaid}`);
    if (updatedPlan.remainingBalance !== 6000) throw new Error(`Expected remainingBalance 6000, got ${updatedPlan.remainingBalance}`);
    if (updatedPlan.status !== 'Active') throw new Error(`Expected plan status "Active", got ${updatedPlan.status}`);
    console.log('✅ Installment schedule and plan balance verified according to Requirements 7 & 8.');

    // 14. Test Duplicate Payment Recording Prevention (Requirement 9)
    console.log('\n--- 12. Testing Duplicate Payment Prevention (Requirement 9) ---');
    const dupRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: memberAuthHeader,
      },
      body: JSON.stringify({
        orderId: createdOrderId,
        paymentId: realPaymentId, // EXACT SAME transactionId
        signature: validSignature,
        installmentPlanId: testPlanId,
        installmentNumber: 1,
        amount: 3000,
        paymentMethod: 'UPI (Google Pay)',
      }),
    });
    const dupJson = await dupRes.json();
    console.log('Duplicate submission response:', dupJson);

    if (!dupJson.duplicate) {
      throw new Error('Duplicate payment was not flagged as duplicate!');
    }

    // Check that balance did not get deducted again
    const planAfterDupSnap = await db.collection('installmentPlans').doc(testPlanId).get();
    const planAfterDup = planAfterDupSnap.data();
    if (planAfterDup.totalPaid !== 4000 || planAfterDup.remainingBalance !== 6000) {
      throw new Error('Duplicate payment erroneously modified balances!');
    }
    console.log('✅ Duplicate payment successfully prevented without double-charging or altering balances.');

    // 15. Clean up test documents
    console.log('\n--- 13. Cleaning up test documents ---');
    await db.collection('installmentPlans').doc(testPlanId).delete();
    await db.collection('payments').doc(validVerifyJson.paymentId).delete();
    console.log('✅ Cleaned up temporary test documents.');

    console.log('\n========================================');
    console.log('🎉 ALL 12 AUTOMATED TEST SUITES PASSED!');
    console.log('========================================\n');

  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    process.exitCode = 1;
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    process.exit(process.exitCode || 0);
  }
};

runTests();
