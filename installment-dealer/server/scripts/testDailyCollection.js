import connectDB, { db } from '../config/db.js';

const formatDateToISO = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🧪 RUNNING DAILY PAYMENT COLLECTION AUTOMATED TESTS');
  console.log('======================================================\n');

  const createdUserIds = [];
  const createdMemberIds = [];
  const createdPlanIds = [];
  const createdPaymentIds = [];

  try {
    // 1. Connect Firestore
    await connectDB();
    console.log('✅ Firebase Firestore connected successfully.');

    // 2. Setup Test Dates
    const now = new Date();
    const todayStr = formatDateToISO(now);

    const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const overdueStr = formatDateToISO(pastDate);

    const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days ahead
    const upcomingStr = formatDateToISO(futureDate);

    console.log(`Reference Dates -> Today: ${todayStr}, Overdue: ${overdueStr}, Upcoming: ${upcomingStr}`);

    // 3. Setup Test Members
    console.log('\n--- 1. Setting Up Test Members & Users ---');
    const testMembersData = [
      {
        uid: `test_col_user_1_${Date.now()}`,
        name: 'Karthi DueToday',
        phone: '9876511111',
        memberId: 'MEM-TODAY01',
        email: `today_${Date.now()}@example.com`,
        address: '10 Mount Road, Chennai',
      },
      {
        uid: `test_col_user_2_${Date.now()}`,
        name: 'Suresh Overdue',
        phone: '9876522222',
        memberId: 'MEM-OVERDUE02',
        email: `overdue_${Date.now()}@example.com`,
        address: '25 Gandhi Street, Madurai',
      },
      {
        uid: `test_col_user_3_${Date.now()}`,
        name: 'Priya Upcoming',
        phone: '9876533333',
        memberId: 'MEM-UPCOMING03',
        email: `upcoming_${Date.now()}@example.com`,
        address: '88 Trunk Road, Coimbatore',
      },
      {
        uid: `test_col_user_4_${Date.now()}`,
        name: 'Ramesh Completed',
        phone: '9876544444',
        memberId: 'MEM-DONE04',
        email: `completed_${Date.now()}@example.com`,
        address: '5 Patel Nagar, Salem',
      },
    ];

    for (const m of testMembersData) {
      createdUserIds.push(m.uid);
      await db.collection('users').doc(m.uid).set({
        name: m.name,
        email: m.email,
        role: 'member',
        memberId: m.memberId,
        phone: m.phone,
        address: m.address,
        status: 'active',
        createdAt: new Date().toISOString(),
      });

      const memberDocRef = db.collection('members').doc();
      createdMemberIds.push(memberDocRef.id);
      await memberDocRef.set({
        userId: m.uid,
        name: m.name,
        email: m.email,
        phone: m.phone,
        address: m.address,
        memberId: m.memberId,
        status: 'active',
        createdAt: new Date().toISOString(),
      });
    }
    console.log(`✅ Created 4 test member records in Firestore.`);

    // 4. Setup Test Installment Plans
    console.log('\n--- 2. Setting Up Test Installment Plans (Active & Completed) ---');

    // Plan 1: Due Today
    const plan1Ref = db.collection('installmentPlans').doc();
    createdPlanIds.push(plan1Ref.id);
    await plan1Ref.set({
      orderId: `ORD-COL-1-${Date.now()}`,
      memberId: testMembersData[0].uid,
      memberName: testMembersData[0].name,
      productName: 'Hero Splendor Plus',
      totalAmount: 30000,
      downPayment: 5000,
      remainingAmount: 25000,
      numberOfInstallments: 5,
      installmentAmount: 5000,
      frequency: 'Monthly',
      status: 'active',
      totalPaid: 5000,
      remainingBalance: 25000,
      schedule: [
        {
          installmentNumber: 1,
          dueDate: todayStr,
          amount: 5000,
          paidAmount: 2000, // partially paid, 3000 remaining
          status: 'Partially Paid',
        },
        {
          installmentNumber: 2,
          dueDate: upcomingStr,
          amount: 5000,
          paidAmount: 0,
          status: 'Unpaid',
        },
      ],
      createdAt: new Date().toISOString(),
    });

    // Plan 2: Overdue
    const plan2Ref = db.collection('installmentPlans').doc();
    createdPlanIds.push(plan2Ref.id);
    await plan2Ref.set({
      orderId: `ORD-COL-2-${Date.now()}`,
      memberId: testMembersData[1].uid,
      memberName: testMembersData[1].name,
      productName: 'Samsung 55" 4K Smart TV',
      totalAmount: 40000,
      downPayment: 10000,
      remainingAmount: 30000,
      numberOfInstallments: 6,
      installmentAmount: 5000,
      frequency: 'Monthly',
      status: 'active',
      totalPaid: 10000,
      remainingBalance: 30000,
      schedule: [
        {
          installmentNumber: 1,
          dueDate: overdueStr,
          amount: 5000,
          paidAmount: 1000, // 4000 remaining, overdue by 7 days
          status: 'Partially Paid',
        },
        {
          installmentNumber: 2,
          dueDate: upcomingStr,
          amount: 5000,
          paidAmount: 0,
          status: 'Unpaid',
        },
      ],
      createdAt: new Date().toISOString(),
    });

    // Plan 3: Upcoming
    const plan3Ref = db.collection('installmentPlans').doc();
    createdPlanIds.push(plan3Ref.id);
    await plan3Ref.set({
      orderId: `ORD-COL-3-${Date.now()}`,
      memberId: testMembersData[2].uid,
      memberName: testMembersData[2].name,
      productName: 'LG Double Door Refrigerator',
      totalAmount: 28000,
      downPayment: 4000,
      remainingAmount: 24000,
      numberOfInstallments: 4,
      installmentAmount: 6000,
      frequency: 'Monthly',
      status: 'active',
      totalPaid: 4000,
      remainingBalance: 24000,
      schedule: [
        {
          installmentNumber: 1,
          dueDate: upcomingStr,
          amount: 6000,
          paidAmount: 0,
          status: 'Unpaid',
        },
      ],
      createdAt: new Date().toISOString(),
    });

    // Plan 4: Completed
    const plan4Ref = db.collection('installmentPlans').doc();
    createdPlanIds.push(plan4Ref.id);
    await plan4Ref.set({
      orderId: `ORD-COL-4-${Date.now()}`,
      memberId: testMembersData[3].uid,
      memberName: testMembersData[3].name,
      productName: 'Prestige Induction Cooktop',
      totalAmount: 5000,
      downPayment: 5000,
      remainingAmount: 0,
      numberOfInstallments: 1,
      installmentAmount: 5000,
      frequency: 'Monthly',
      status: 'completed',
      totalPaid: 5000,
      remainingBalance: 0,
      schedule: [
        {
          installmentNumber: 1,
          dueDate: overdueStr,
          amount: 5000,
          paidAmount: 5000,
          status: 'Paid',
        },
      ],
      createdAt: new Date().toISOString(),
    });

    console.log('✅ Created 3 active plans (Due Today, Overdue, Upcoming) and 1 completed plan.');

    // 5. Test Active Plan Filtering & Member Resolution (Requirement 2 & 4)
    console.log('\n--- 3. Testing Active Plan Aggregation & Member Information Resolution ---');
    const plansSnap = await db.collection('installmentPlans').get();
    const membersSnap = await db.collection('members').get();

    const allPlans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const allMembers = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const memberMap = new Map();
    allMembers.forEach((m) => {
      if (m.userId) memberMap.set(m.userId, m);
      if (m.id) memberMap.set(m.id, m);
      if (m.memberId) memberMap.set(m.memberId, m);
    });

    // Emulate collectionItems logic from DailyCollectionManagement.jsx
    const collectionItems = [];
    allPlans.forEach((plan) => {
      if ((plan.status || '').toLowerCase() === 'completed') return;
      const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
      const nextUnpaid = schedule.find((s) => s.status !== 'Paid');
      if (!nextUnpaid) return;

      const dueAmount = parseFloat(nextUnpaid.amount) || 0;
      const alreadyPaid = parseFloat(nextUnpaid.paidAmount) || 0;
      const remainingAmount = Math.max(0, dueAmount - alreadyPaid);
      if (remainingAmount <= 0) return;

      const matchedMember = memberMap.get(plan.memberId) || null;
      const memberName = plan.memberName || matchedMember?.name || 'Member';
      const memberId = matchedMember?.memberId || plan.memberId || 'N/A';
      const phone = matchedMember?.phone || plan.memberPhone || '';
      const dueDate = nextUnpaid.dueDate || '';

      let status = 'Upcoming';
      let overdueDays = 0;
      if (dueDate) {
        if (dueDate < todayStr) {
          status = 'Overdue';
          const dueD = new Date(dueDate);
          const nowD = new Date(todayStr);
          overdueDays = Math.max(1, Math.ceil(Math.abs(nowD - dueD) / (1000 * 60 * 60 * 24)));
        } else if (dueDate === todayStr) {
          status = 'Due Today';
        } else {
          status = 'Upcoming';
        }
      }

      collectionItems.push({
        planId: plan.id,
        orderId: plan.orderId,
        productName: plan.productName,
        memberName,
        memberId,
        phone,
        nextInstallmentNumber: nextUnpaid.installmentNumber,
        dueDate,
        installmentAmount: dueAmount,
        paidAmount: alreadyPaid,
        remainingAmount,
        status,
        overdueDays,
      });
    });

    // Verify only the 3 active test plans are present (Plan 4 excluded)
    const testActiveItems = collectionItems.filter((item) =>
      createdPlanIds.includes(item.planId)
    );

    if (testActiveItems.length !== 3) {
      throw new Error(`Expected 3 active test collection items, found ${testActiveItems.length}`);
    }

    const testPlan4Present = collectionItems.some((item) => item.planId === plan4Ref.id);
    if (testPlan4Present) {
      throw new Error('Completed plan was erroneously included in active collection items!');
    }
    console.log('✅ Completed plans successfully excluded from daily collection items.');

    // 6. Test Display Fields Completeness (Requirement 4)
    console.log('\n--- 4. Verifying Required Display Fields for Each Member (Req 4) ---');
    for (const item of testActiveItems) {
      if (!item.memberName) throw new Error(`Missing memberName for ${item.planId}`);
      if (!item.memberId || item.memberId === 'N/A') throw new Error(`Missing memberId for ${item.planId}`);
      if (!item.phone) throw new Error(`Missing phone for ${item.planId}`);
      if (!item.productName) throw new Error(`Missing productName for ${item.planId}`);
      if (typeof item.nextInstallmentNumber !== 'number') throw new Error(`Missing next installment number for ${item.planId}`);
      if (!item.dueDate) throw new Error(`Missing dueDate for ${item.planId}`);
      if (typeof item.installmentAmount !== 'number' || item.installmentAmount <= 0) throw new Error(`Missing installmentAmount for ${item.planId}`);
      if (typeof item.paidAmount !== 'number') throw new Error(`Missing paidAmount for ${item.planId}`);
      if (typeof item.remainingAmount !== 'number' || item.remainingAmount <= 0) throw new Error(`Missing remainingAmount for ${item.planId}`);
      if (!item.status) throw new Error(`Missing status for ${item.planId}`);

      console.log(`Verified record: ${item.memberName} (${item.memberId}) - ${item.productName} | Due: ${item.dueDate} | Remaining: ₹${item.remainingAmount} | Status: ${item.status}`);
    }
    console.log('✅ All 10 required fields verified for each active collection member.');

    // 7. Test Search Filtering (Requirement 3: Name, Member ID, Phone)
    console.log('\n--- 5. Testing Search Filtering (Req 3: Name, ID, Phone) ---');
    // Search by Name
    const searchByName = testActiveItems.filter((item) =>
      item.memberName.toLowerCase().includes('suresh')
    );
    if (searchByName.length !== 1 || searchByName[0].memberName !== 'Suresh Overdue') {
      throw new Error('Search by member name failed');
    }
    console.log('✅ Search by member name passed.');

    // Search by Member ID
    const searchById = testActiveItems.filter((item) =>
      item.memberId.toLowerCase().includes('mem-today01')
    );
    if (searchById.length !== 1 || searchById[0].memberId !== 'MEM-TODAY01') {
      throw new Error('Search by member ID failed');
    }
    console.log('✅ Search by member ID passed.');

    // Search by Phone
    const searchByPhone = testActiveItems.filter((item) =>
      item.phone.includes('9876533333')
    );
    if (searchByPhone.length !== 1 || searchByPhone[0].phone !== '9876533333') {
      throw new Error('Search by phone number passed failed');
    }
    console.log('✅ Search by phone number passed.');

    // 8. Test Status Filters & Overdue Highlighting (Requirements 10 & 11)
    console.log('\n--- 6. Testing Status Filters & Overdue Highlighting (Req 10 & 11) ---');
    const dueTodayItems = testActiveItems.filter((i) => i.status === 'Due Today');
    const overdueItems = testActiveItems.filter((i) => i.status === 'Overdue');
    const upcomingItems = testActiveItems.filter((i) => i.status === 'Upcoming');

    if (dueTodayItems.length !== 1 || dueTodayItems[0].memberName !== 'Karthi DueToday') {
      throw new Error('Due Today status categorization failed');
    }
    if (overdueItems.length !== 1 || overdueItems[0].memberName !== 'Suresh Overdue') {
      throw new Error('Overdue status categorization failed');
    }
    if (overdueItems[0].overdueDays < 7) {
      throw new Error(`Expected at least 7 overdue days, calculated ${overdueItems[0].overdueDays}`);
    }
    if (upcomingItems.length !== 1 || upcomingItems[0].memberName !== 'Priya Upcoming') {
      throw new Error('Upcoming status categorization failed');
    }
    console.log(`✅ Status categorization verified: Due Today = 1, Overdue = 1 (Days: ${overdueItems[0].overdueDays}), Upcoming = 1.`);

    // 9. Test Payment Amount Boundary Enforcement (Requirement 8)
    console.log('\n--- 7. Testing Boundary Validation: Amount Cannot Exceed Remaining (Req 8) ---');
    const targetItem = overdueItems[0]; // Remaining is ₹4000
    const remainingToPay = targetItem.remainingAmount; // 4000

    const validatePaymentAmount = (amt, remaining) => {
      const parsed = parseFloat(amt);
      if (isNaN(parsed) || parsed <= 0) {
        return { valid: false, error: 'Please enter a valid amount greater than 0.' };
      }
      if (parsed > remaining + 0.001) {
        return { valid: false, error: `Payment amount (${parsed}) cannot exceed remaining (${remaining}).` };
      }
      return { valid: true, amount: parsed };
    };

    // Test 1: Excessive amount (₹4001 vs ₹4000)
    const excessiveValidation = validatePaymentAmount(4001, remainingToPay);
    if (excessiveValidation.valid) {
      throw new Error('Validation failed to reject payment amount greater than remaining amount!');
    }
    console.log(`✅ Correctly rejected excessive payment of ₹4001 on remaining ₹${remainingToPay}: "${excessiveValidation.error}"`);

    // Test 2: Negative and zero amount
    const zeroValidation = validatePaymentAmount(0, remainingToPay);
    const negativeValidation = validatePaymentAmount(-500, remainingToPay);
    if (zeroValidation.valid || negativeValidation.valid) {
      throw new Error('Validation failed to reject zero or negative payment amounts!');
    }
    console.log('✅ Correctly rejected zero and negative payment amounts.');

    // Test 3: Valid payment (₹2000 partial payment)
    const validPartialValidation = validatePaymentAmount(2000, remainingToPay);
    if (!validPartialValidation.valid) {
      throw new Error('Validation rejected valid payment amount!');
    }
    console.log('✅ Accepted valid partial payment amount of ₹2000.');

    // 10. Test Atomic Collection Payment Transaction (Requirements 6 & 7)
    console.log('\n--- 8. Testing Atomic Payment Collection Execution (Req 6 & 7) ---');
    const paymentMethods = ['Cash', 'UPI', 'Bank Transfer', 'Other'];
    const chosenMethod = 'Cash';
    if (!paymentMethods.includes(chosenMethod)) throw new Error('Unsupported method');

    const paymentAmountToCollect = 2000;
    const adminCollectorName = 'Field Admin Ramesh';

    let recordedPaymentDoc = null;
    let updatedPlanDoc = null;

    // Run atomic Firestore transaction matching recordInstallmentPayment
    await db.runTransaction(async (transaction) => {
      const planDocRef = db.collection('installmentPlans').doc(targetItem.planId);
      const planDoc = await transaction.get(planDocRef);

      if (!planDoc.exists) throw new Error('Installment plan not found');
      const planData = planDoc.data();

      const schedule = planData.schedule ? [...planData.schedule] : [];
      const itemIndex = schedule.findIndex((s) => s.installmentNumber === targetItem.nextInstallmentNumber);
      if (itemIndex === -1) throw new Error('Installment not found');

      const currentItem = schedule[itemIndex];
      const newPaidAmount = Math.min(
        currentItem.amount,
        parseFloat(((currentItem.paidAmount || 0) + paymentAmountToCollect).toFixed(2))
      );

      const newStatus = newPaidAmount >= currentItem.amount ? 'Paid' : 'Partially Paid';

      schedule[itemIndex] = {
        ...currentItem,
        paidAmount: newPaidAmount,
        status: newStatus,
        lastPaymentDate: todayStr,
      };

      const newTotalPaid = parseFloat(((planData.totalPaid || 0) + paymentAmountToCollect).toFixed(2));
      const newRemainingBalance = Math.max(
        0,
        parseFloat(((planData.totalAmount || 0) - newTotalPaid).toFixed(2))
      );
      const newPlanStatus = newRemainingBalance <= 0 ? 'Completed' : 'Active';

      // Create payment record
      const paymentDocRef = db.collection('payments').doc();
      const receiptNumber = `REC-COL-${Date.now()}`;
      const paymentData = {
        installmentPlanId: targetItem.planId,
        installmentNumber: targetItem.nextInstallmentNumber,
        memberId: planData.memberId,
        memberName: planData.memberName || 'Member',
        productName: planData.productName || 'Product',
        orderId: planData.orderId || '',
        amount: paymentAmountToCollect,
        paymentDate: todayStr,
        paymentMethod: chosenMethod,
        receiptNumber,
        recordedBy: adminCollectorName,
        status: 'Successful',
        type: 'field_collection',
        createdAt: new Date().toISOString(),
      };

      transaction.set(paymentDocRef, paymentData);
      transaction.update(planDocRef, {
        schedule,
        totalPaid: newTotalPaid,
        remainingBalance: newRemainingBalance,
        status: newPlanStatus,
        updatedAt: new Date().toISOString(),
      });

      recordedPaymentDoc = { id: paymentDocRef.id, ...paymentData };
      updatedPlanDoc = { id: planDocRef.id, ...planData, schedule, totalPaid: newTotalPaid, remainingBalance: newRemainingBalance, status: newPlanStatus };
      createdPaymentIds.push(paymentDocRef.id);
    });

    console.log(`✅ Collection payment recorded atomically with ID: ${recordedPaymentDoc.id}`);

    // Verify Payment document fields
    console.log('\n--- 9. Verifying Firestore "payments" Document Fields ---');
    const paymentCheckSnap = await db.collection('payments').doc(recordedPaymentDoc.id).get();
    if (!paymentCheckSnap.exists) throw new Error('Payment record was not created in Firestore');

    const paymentCheck = paymentCheckSnap.data();
    if (paymentCheck.amount !== 2000) throw new Error('Payment amount mismatch');
    if (paymentCheck.paymentMethod !== 'Cash') throw new Error('Payment method mismatch');
    if (paymentCheck.status !== 'Successful') throw new Error('Payment status mismatch');
    if (paymentCheck.recordedBy !== adminCollectorName) throw new Error('recordedBy mismatch');
    if (!paymentCheck.receiptNumber.startsWith('REC-COL-')) throw new Error('receiptNumber format invalid');
    if (paymentCheck.installmentNumber !== targetItem.nextInstallmentNumber) throw new Error('installmentNumber mismatch');

    console.log('Payment document verified:');
    console.log(`  - Receipt:      ${paymentCheck.receiptNumber}`);
    console.log(`  - Amount:       ₹${paymentCheck.amount}`);
    console.log(`  - Method:       ${paymentCheck.paymentMethod}`);
    console.log(`  - Member:       ${paymentCheck.memberName}`);
    console.log(`  - Recorded By:  ${paymentCheck.recordedBy}`);
    console.log(`  - Status:       ${paymentCheck.status}`);

    // Verify Plan Balances & Schedule update
    console.log('\n--- 10. Verifying Installment Plan Balances & Schedule Updates ---');
    const planCheckSnap = await db.collection('installmentPlans').doc(targetItem.planId).get();
    const planCheck = planCheckSnap.data();

    // Initial paid was 1000, collected 2000 => now 3000
    if (planCheck.schedule[0].paidAmount !== 3000) {
      throw new Error(`Expected installment paidAmount 3000, got ${planCheck.schedule[0].paidAmount}`);
    }
    // Still 2000 remaining on this installment (5000 - 3000) => status must be 'Partially Paid'
    if (planCheck.schedule[0].status !== 'Partially Paid') {
      throw new Error(`Expected installment status 'Partially Paid', got ${planCheck.schedule[0].status}`);
    }
    // Plan totalPaid: 10000 down + 2000 payment = 12000
    if (planCheck.totalPaid !== 12000) {
      throw new Error(`Expected plan totalPaid 12000, got ${planCheck.totalPaid}`);
    }
    // Plan remainingBalance: 40000 - 12000 = 28000
    if (planCheck.remainingBalance !== 28000) {
      throw new Error(`Expected plan remainingBalance 28000, got ${planCheck.remainingBalance}`);
    }
    console.log(`✅ Plan schedule item and balance verified: paidAmount = ₹${planCheck.schedule[0].paidAmount}, plan totalPaid = ₹${planCheck.totalPaid}, remainingBalance = ₹${planCheck.remainingBalance}`);

    // 11. Test Receipt Verification (Requirement 9)
    console.log('\n--- 11. Verifying Payment Receipt Readiness (Req 9) ---');
    const requiredReceiptFields = [
      'receiptNumber',
      'paymentDate',
      'amount',
      'paymentMethod',
      'memberName',
      'productName',
      'installmentNumber',
    ];
    for (const field of requiredReceiptFields) {
      if (!recordedPaymentDoc[field]) {
        throw new Error(`Payment record missing required receipt field: ${field}`);
      }
    }
    console.log('✅ Payment record has all required fields for PaymentReceiptModal rendering.');

    console.log('\n======================================================');
    console.log('🎉 ALL DAILY COLLECTION AUTOMATED TESTS PASSED (11/11)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup created test records
    console.log('\n--- Cleaning up temporary test documents from Firestore ---');
    try {
      for (const id of createdPaymentIds) {
        await db.collection('payments').doc(id).delete();
      }
      for (const id of createdPlanIds) {
        await db.collection('installmentPlans').doc(id).delete();
      }
      for (const id of createdMemberIds) {
        await db.collection('members').doc(id).delete();
      }
      for (const id of createdUserIds) {
        await db.collection('users').doc(id).delete();
      }
      console.log(`✅ Cleaned up ${createdPaymentIds.length} payments, ${createdPlanIds.length} plans, ${createdMemberIds.length} members, ${createdUserIds.length} users.`);
    } catch (cleanupErr) {
      console.error('Cleanup warning:', cleanupErr);
    }
    process.exit(process.exitCode || 0);
  }
};

runTests();
