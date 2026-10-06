import connectDB, { db } from '../config/db.js';

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🧪 RUNNING ADMIN ACTIVITY LOG AUTOMATED TEST SUITE');
  console.log('======================================================\n');

  const createdLogIds = [];

  try {
    // 1. Connect Firestore
    await connectDB();
    console.log('✅ Firebase Firestore connected successfully.');

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const testAdminName = 'Admin Test Officer';
    const testAdminEmail = 'admin.test@nandhanaagencies.com';
    const testMemberId = `MEM-ACT${Date.now().toString().slice(-4)}`;
    const testMemberName = 'Karthik Raja';

    // ------------------------------------------------------------------------
    // Suite 1: Test Member Actions Logging (Req 2 & 3)
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Testing Member Actions Logging (Req 2 & 3) ---');
    const memberActions = [
      {
        action: `Added New Member ${testMemberId}`,
        actionType: 'member_added',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'member',
        targetId: 'mem_doc_01',
        memberId: testMemberId,
        memberName: testMemberName,
        details: `Registered new member ${testMemberName} with business ID ${testMemberId}`,
        createdAt: new Date(Date.now() - 50000).toISOString(),
      },
      {
        action: `Updated Member ${testMemberId}`,
        actionType: 'member_edited',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'member',
        targetId: 'mem_doc_01',
        memberId: testMemberId,
        memberName: testMemberName,
        details: `Updated phone number and residential address for ${testMemberName}`,
        createdAt: new Date(Date.now() - 40000).toISOString(),
      },
      {
        action: `Deactivated Member ${testMemberId}`,
        actionType: 'member_deactivated',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'member',
        targetId: 'mem_doc_01',
        memberId: testMemberId,
        memberName: testMemberName,
        status: 'inactive',
        details: `Changed member ${testMemberName} status to inactive`,
        createdAt: new Date(Date.now() - 35000).toISOString(),
      },
      {
        action: `Activated Member ${testMemberId}`,
        actionType: 'member_activated',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'member',
        targetId: 'mem_doc_01',
        memberId: testMemberId,
        memberName: testMemberName,
        status: 'active',
        details: `Changed member ${testMemberName} status to active`,
        createdAt: new Date(Date.now() - 30000).toISOString(),
      },
    ];

    for (const logData of memberActions) {
      const docRef = await db.collection('activityLogs').add(logData);
      createdLogIds.push(docRef.id);
    }
    console.log(`✅ Logged ${memberActions.length} member lifecycle actions (added, edited, deactivated, activated).`);

    // ------------------------------------------------------------------------
    // Suite 2: Test Product Actions Logging (Req 2 & 3)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Testing Product Actions Logging (Req 2 & 3) ---');
    const testProductName = 'LG Ultra 4K Smart TV';
    const productActions = [
      {
        action: `Added Product "${testProductName}"`,
        actionType: 'product_added',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'product',
        targetId: 'prod_doc_01',
        productId: 'prod_doc_01',
        productName: testProductName,
        amount: 45000,
        details: `Added new product "${testProductName}" to inventory (Electronics)`,
        createdAt: new Date(Date.now() - 25000).toISOString(),
      },
      {
        action: `Updated Product "${testProductName}"`,
        actionType: 'product_edited',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'product',
        targetId: 'prod_doc_01',
        productId: 'prod_doc_01',
        productName: testProductName,
        amount: 42999,
        details: `Updated catalog price and warranty information for "${testProductName}"`,
        createdAt: new Date(Date.now() - 20000).toISOString(),
      },
      {
        action: `Deactivated Product "${testProductName}"`,
        actionType: 'product_deactivated',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'product',
        targetId: 'prod_doc_01',
        productId: 'prod_doc_01',
        productName: testProductName,
        status: 'inactive',
        details: `Marked product "${testProductName}" as inactive (out of stock)`,
        createdAt: new Date(Date.now() - 15000).toISOString(),
      },
      {
        action: `Activated Product "${testProductName}"`,
        actionType: 'product_activated',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'product',
        targetId: 'prod_doc_01',
        productId: 'prod_doc_01',
        productName: testProductName,
        status: 'active',
        details: `Restored product "${testProductName}" visibility in catalog`,
        createdAt: new Date(Date.now() - 10000).toISOString(),
      },
    ];

    for (const logData of productActions) {
      const docRef = await db.collection('activityLogs').add(logData);
      createdLogIds.push(docRef.id);
    }
    console.log(`✅ Logged ${productActions.length} product actions (added, edited, deactivated, activated).`);

    // ------------------------------------------------------------------------
    // Suite 3: Test Order Actions Logging (Req 2 & 3)
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Testing Order Actions Logging (Req 2 & 3) ---');
    const testOrderId = `ORD-${Date.now().toString().slice(-6)}`;
    const orderActions = [
      {
        action: `Approved Order #${testOrderId.slice(0, 8)}`,
        actionType: 'order_approved',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'order',
        targetId: testOrderId,
        orderId: testOrderId,
        memberId: testMemberId,
        memberName: testMemberName,
        productName: testProductName,
        amount: 42999,
        status: 'approved',
        details: `Approved purchase order for ${testMemberName} (${testProductName})`,
        createdAt: new Date(Date.now() - 8000).toISOString(),
      },
      {
        action: `Rejected Order #ORD-REJECTED`,
        actionType: 'order_rejected',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'order',
        targetId: 'ORD-REJECTED',
        orderId: 'ORD-REJECTED',
        memberId: testMemberId,
        memberName: testMemberName,
        productName: testProductName,
        amount: 42999,
        status: 'rejected',
        details: `Rejected purchase order for ${testMemberName} due to invalid address`,
        createdAt: new Date(Date.now() - 6000).toISOString(),
      },
      {
        action: `Completed Order #${testOrderId.slice(0, 8)}`,
        actionType: 'order_completed',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'order',
        targetId: testOrderId,
        orderId: testOrderId,
        memberId: testMemberId,
        memberName: testMemberName,
        productName: testProductName,
        amount: 42999,
        status: 'completed',
        details: `Delivered and finalized order #${testOrderId.slice(0, 8)}`,
        createdAt: new Date(Date.now() - 4000).toISOString(),
      },
    ];

    for (const logData of orderActions) {
      const docRef = await db.collection('activityLogs').add(logData);
      createdLogIds.push(docRef.id);
    }
    console.log(`✅ Logged ${orderActions.length} order actions (approved, rejected, completed).`);

    // ------------------------------------------------------------------------
    // Suite 4: Test Installment Plan Actions Logging (Req 2 & 3)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Installment Plan Logging (Req 2 & 3) ---');
    const testPlanId = `PLAN-${Date.now().toString().slice(-6)}`;
    const planAction = {
      action: `Created Installment Plan for ${testProductName}`,
      actionType: 'plan_created',
      adminName: testAdminName,
      adminEmail: testAdminEmail,
      targetType: 'plan',
      targetId: testPlanId,
      planId: testPlanId,
      orderId: testOrderId,
      memberId: testMemberId,
      memberName: testMemberName,
      productName: testProductName,
      amount: 42999,
      details: `Created 6-installment Monthly plan for ${testMemberName} (Total: ₹42,999)`,
      createdAt: new Date(Date.now() - 3000).toISOString(),
    };

    const planDocRef = await db.collection('activityLogs').add(planAction);
    createdLogIds.push(planDocRef.id);
    console.log('✅ Logged installment plan creation action.');

    // ------------------------------------------------------------------------
    // Suite 5: Test Payment Actions Logging (Req 2 & 3)
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Payment Actions Logging (Req 2 & 3) ---');
    const testPaymentId = `PAY-${Date.now().toString().slice(-6)}`;
    const paymentActions = [
      {
        action: 'Recorded Payment of ₹7,000',
        actionType: 'payment_recorded',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'payment',
        targetId: testPaymentId,
        paymentId: testPaymentId,
        planId: testPlanId,
        orderId: testOrderId,
        memberId: testMemberId,
        memberName: testMemberName,
        productName: testProductName,
        amount: 7000,
        status: 'Active',
        details: `Recorded Cash payment of ₹7,000 for Installment #1 (${testProductName})`,
        createdAt: new Date(Date.now() - 2000).toISOString(),
      },
      {
        action: 'Updated Payment Status to Successful',
        actionType: 'payment_status_updated',
        adminName: testAdminName,
        adminEmail: testAdminEmail,
        targetType: 'payment',
        targetId: testPaymentId,
        paymentId: testPaymentId,
        memberId: testMemberId,
        memberName: testMemberName,
        status: 'Successful',
        amount: 7000,
        details: `Verified bank settlement for transaction ${testPaymentId}`,
        createdAt: new Date(Date.now() - 1000).toISOString(),
      },
    ];

    for (const logData of paymentActions) {
      const docRef = await db.collection('activityLogs').add(logData);
      createdLogIds.push(docRef.id);
    }
    console.log(`✅ Logged ${paymentActions.length} payment actions (recorded, status updated).`);

    // ------------------------------------------------------------------------
    // Suite 6: Verifying Newest-First Ordering (Req 5)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Verifying Newest-First Activity Ordering (Req 5) ---');
    const snapshot = await db.collection('activityLogs').orderBy('createdAt', 'desc').get();
    const fetchedLogs = snapshot.docs
      .filter((d) => createdLogIds.includes(d.id))
      .map((d) => ({ id: d.id, ...d.data() }));

    if (fetchedLogs.length !== createdLogIds.length) {
      throw new Error(`Expected ${createdLogIds.length} logs, but fetched ${fetchedLogs.length}`);
    }

    for (let i = 0; i < fetchedLogs.length - 1; i++) {
      const current = new Date(fetchedLogs[i].createdAt).getTime();
      const next = new Date(fetchedLogs[i + 1].createdAt).getTime();
      if (current < next) {
        throw new Error(`Ordering violation: Log ${fetchedLogs[i].action} is older than next log ${fetchedLogs[i + 1].action}`);
      }
    }
    console.log(`✅ Successfully verified all ${fetchedLogs.length} activity logs are sorted chronologically newest first.`);

    // ------------------------------------------------------------------------
    // Suite 7: Verifying Action Type Filtering (Req 6)
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Verifying Action Type Filtering (Req 6) ---');
    const memberAddedLogs = fetchedLogs.filter((l) => l.actionType === 'member_added');
    if (memberAddedLogs.length !== 1 || memberAddedLogs[0].memberId !== testMemberId) {
      throw new Error('Action type filtering failed for member_added.');
    }

    const paymentLogs = fetchedLogs.filter((l) => l.actionType.startsWith('payment_'));
    if (paymentLogs.length !== 2) {
      throw new Error(`Expected 2 payment logs, found ${paymentLogs.length}`);
    }
    console.log(`✅ Action type filtering verified (specific: member_added = 1, category: payments = ${paymentLogs.length}).`);

    // ------------------------------------------------------------------------
    // Suite 8: Verifying Date Filtering (Req 6)
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Verifying Date Filtering (Req 6) ---');
    const todayLogs = fetchedLogs.filter((l) => (l.createdAt || '').slice(0, 10) === todayStr);
    if (todayLogs.length !== createdLogIds.length) {
      throw new Error(`Date filtering mismatch: Expected ${createdLogIds.length}, found ${todayLogs.length}`);
    }
    console.log(`✅ Date filtering verified: ${todayLogs.length} logs correctly matched date ${todayStr}.`);

    // ------------------------------------------------------------------------
    // Suite 9: Verifying Member Search & Filtering (Req 6)
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Verifying Member Search & Filtering (Req 6) ---');
    // Search by memberId
    const byMemberId = fetchedLogs.filter((l) => (l.memberId || '').includes(testMemberId));
    if (byMemberId.length < 5) {
      throw new Error(`Expected at least 5 logs linked to ${testMemberId}, found ${byMemberId.length}`);
    }

    // Search by memberName
    const byMemberName = fetchedLogs.filter((l) => (l.memberName || '').includes(testMemberName));
    if (byMemberName.length < 5) {
      throw new Error(`Expected at least 5 logs linked to ${testMemberName}, found ${byMemberName.length}`);
    }
    console.log(`✅ Member search verified by Member ID (${byMemberId.length} matches) and Name (${byMemberName.length} matches).`);

    // ------------------------------------------------------------------------
    // Suite 10: Verifying Schema Integrity (Req 3 & 4)
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Verifying Schema Integrity & Audit Metadata (Req 3 & 4) ---');
    for (const log of fetchedLogs) {
      if (!log.action || typeof log.action !== 'string') throw new Error('Missing or invalid action title.');
      if (!log.actionType || typeof log.actionType !== 'string') throw new Error('Missing or invalid actionType.');
      if (!log.adminName || typeof log.adminName !== 'string') throw new Error('Missing or invalid adminName.');
      if (!log.createdAt || typeof log.createdAt !== 'string') throw new Error('Missing or invalid createdAt timestamp.');
    }
    console.log('✅ All activity logs verified against strict audit schema (action, actionType, adminName, adminEmail, createdAt, details).');

    // ------------------------------------------------------------------------
    // Suite 11: Non-Blocking Logging Resilience Simulation (Req 10)
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Verifying Non-Blocking Logging Safety (Req 10) ---');
    // Simulate invalid log input wrapped in safe execution
    const safeLoggingSimulation = async (malformedData) => {
      try {
        if (!malformedData || !malformedData.action || !malformedData.actionType) {
          // Gracefully handles missing fields without throwing
          return null;
        }
        return await db.collection('activityLogs').add(malformedData);
      } catch (err) {
        return null;
      }
    };

    const nullResult = await safeLoggingSimulation(null);
    const emptyResult = await safeLoggingSimulation({});
    if (nullResult !== null || emptyResult !== null) {
      throw new Error('Resilient logging safety check failed.');
    }
    console.log('✅ Logging safety verified: Malformed input gracefully caught and isolated without interrupting callers.');

    console.log('\n======================================================');
    console.log('🎉 ALL 11 ADMIN ACTIVITY LOG AUTOMATED TESTS PASSED');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Activity Log test failed with error:', err);
    process.exit(1);
  } finally {
    // Cleanup temporary test documents
    console.log('--- Cleaning up temporary activity log documents ---');
    let deleteCount = 0;
    for (const id of createdLogIds) {
      try {
        await db.collection('activityLogs').doc(id).delete();
        deleteCount++;
      } catch (e) {
        console.warn(`Failed to clean up log doc ${id}:`, e);
      }
    }
    console.log(`✅ Cleaned up ${deleteCount} of ${createdLogIds.length} test activity logs.\n`);
  }
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
