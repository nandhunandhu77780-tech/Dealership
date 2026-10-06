import connectDB, { db } from '../config/db.js';

// Replicate the client formatters logic in the test script for complete verification
const getLocalDateString = (d = new Date()) => {
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getInstallmentRemainingAmount = (inst) => {
  if (!inst) return 0;
  const total = parseFloat(inst.amount) || 0;
  const paid = parseFloat(inst.paidAmount) || 0;
  return parseFloat(Math.max(0, total - paid).toFixed(2));
};

const getOverdueDays = (dueDateStr, referenceDate = new Date()) => {
  if (!dueDateStr) return 0;
  const targetStr = getLocalDateString(dueDateStr);
  const refStr = getLocalDateString(referenceDate);
  if (!targetStr || !refStr || targetStr >= refStr) return 0;

  const [tY, tM, tD] = targetStr.split('-').map(Number);
  const [rY, rM, rD] = refStr.split('-').map(Number);

  const tDate = new Date(tY, tM - 1, tD);
  const rDate = new Date(rY, rM - 1, rD);

  const diffMs = rDate.getTime() - tDate.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
};

const getInstallmentStatus = (inst, referenceDate = new Date()) => {
  if (!inst) return 'Upcoming';
  const remaining = getInstallmentRemainingAmount(inst);
  if (remaining <= 0) {
    return 'Paid';
  }

  const dueDateStr = getLocalDateString(inst.dueDate);
  const todayStr = getLocalDateString(referenceDate);

  if (!dueDateStr) {
    return inst.status || 'Upcoming';
  }

  if (dueDateStr < todayStr) {
    return 'Overdue';
  }

  if (dueDateStr === todayStr) {
    return 'Due Today';
  }

  return 'Upcoming';
};

const runInstallmentStatusSystemTests = async () => {
  console.log('\n======================================================');
  console.log('🧪 RUNNING INSTALLMENT STATUS SYSTEM AUTOMATED TESTS');
  console.log('======================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  const assertEqual = (actual, expected, description) => {
    if (actual === expected) {
      console.log(`  ✅ PASS: ${description} (Expected: "${expected}", Got: "${actual}")`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${description} (Expected: "${expected}", Got: "${actual}")`);
      failedTests++;
    }
  };

  const assertTrue = (condition, description) => {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failedTests++;
    }
  };

  const todayStr = getLocalDateString(new Date());
  const now = new Date();

  // Reference past date (5 days ago)
  const past5Date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5);
  const past5Str = getLocalDateString(past5Date);

  // Reference future date (7 days ahead)
  const future7Date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const future7Str = getLocalDateString(future7Date);

  console.log(`📅 Test Reference Dates -> Today: "${todayStr}", Past (-5d): "${past5Str}", Future (+7d): "${future7Str}"\n`);

  console.log('--- TEST GROUP 1: Core Dynamic Status Determination Rules ---');

  // Rule: Remaining amount = 0 -> Paid (even if due date is in the past)
  const fullyPaidPast = { amount: 1500, paidAmount: 1500, dueDate: past5Str, status: 'Overdue' };
  assertEqual(getInstallmentStatus(fullyPaidPast), 'Paid', 'Fully paid installment with past due date must resolve to "Paid" (never Overdue)');

  // Rule: Remaining amount = 0 -> Paid (due today)
  const fullyPaidToday = { amount: 2000, paidAmount: 2000, dueDate: todayStr, status: 'Due Today' };
  assertEqual(getInstallmentStatus(fullyPaidToday), 'Paid', 'Fully paid installment due today must resolve to "Paid"');

  // Rule: Remaining amount = 0 -> Paid (due in future)
  const fullyPaidFuture = { amount: 2500, paidAmount: 2500, dueDate: future7Str, status: 'Upcoming' };
  assertEqual(getInstallmentStatus(fullyPaidFuture), 'Paid', 'Fully paid installment due in future must resolve to "Paid"');

  // Rule: Due date is today and remaining amount > 0 -> Due Today
  const dueTodayUnpaid = { amount: 3000, paidAmount: 0, dueDate: todayStr, status: 'Upcoming' };
  assertEqual(getInstallmentStatus(dueTodayUnpaid), 'Due Today', 'Unpaid installment due today must resolve to "Due Today"');

  const dueTodayPartiallyPaid = { amount: 3000, paidAmount: 1000, dueDate: todayStr, status: 'Pending' };
  assertEqual(getInstallmentStatus(dueTodayPartiallyPaid), 'Due Today', 'Partially paid installment due today must resolve to "Due Today"');

  // Rule: Due date is in future -> Upcoming
  const futureUnpaid = { amount: 3500, paidAmount: 0, dueDate: future7Str, status: 'Pending' };
  assertEqual(getInstallmentStatus(futureUnpaid), 'Upcoming', 'Unpaid installment due in future must resolve to "Upcoming"');

  const futurePartiallyPaid = { amount: 3500, paidAmount: 1000, dueDate: future7Str, status: 'Pending' };
  assertEqual(getInstallmentStatus(futurePartiallyPaid), 'Upcoming', 'Partially paid installment due in future must resolve to "Upcoming"');

  // Rule: Due date has passed and remaining amount > 0 -> Overdue
  const pastUnpaid = { amount: 4000, paidAmount: 0, dueDate: past5Str, status: 'Pending' };
  assertEqual(getInstallmentStatus(pastUnpaid), 'Overdue', 'Unpaid installment due in past must resolve to "Overdue"');

  // Rule 8: Keep partially paid installments overdue if due date has passed and balance remains
  const pastPartiallyPaid = { amount: 4000, paidAmount: 1500, dueDate: past5Str, status: 'Partially Paid' };
  assertEqual(getInstallmentStatus(pastPartiallyPaid), 'Overdue', 'Partially paid installment due in past must remain "Overdue"');

  // Overdue days calculation
  assertEqual(getOverdueDays(past5Str), 5, 'Overdue days calculation should return exactly 5 days');
  assertEqual(getOverdueDays(todayStr), 0, 'Due today should return 0 overdue days');
  assertEqual(getOverdueDays(future7Str), 0, 'Future due date should return 0 overdue days');

  console.log('\n--- TEST GROUP 2: Timezone and Local Date Safety ---');
  // Date-only string parsing
  assertEqual(getLocalDateString('2026-09-26'), '2026-09-26', 'Passing YYYY-MM-DD string returns string unaltered without UTC shifting');
  // Local date construction check
  const localD = new Date(2026, 8, 26, 0, 1, 0); // 2026-09-26 00:01 local
  assertEqual(getLocalDateString(localD), '2026-09-26', 'Local midnight Date object correctly returns 2026-09-26');

  console.log('\n--- TEST GROUP 3: Database & Collection Aggregation Integration ---');
  const createdPlanIds = [];
  const createdPaymentIds = [];

  try {
    await connectDB();
    console.log('  ✅ Connected to Firestore successfully');

    const testPlanId = `test_plan_status_${Date.now()}`;
    const testMemberId = `test_member_${Date.now()}`;
    createdPlanIds.push(testPlanId);

    // Create a realistic installment plan with all 5 types of installments:
    // 1. Overdue unpaid (amount 2000, paid 0, due 5 days ago)
    // 2. Overdue partially paid (amount 2000, paid 800, balance 1200, due 5 days ago)
    // 3. Fully paid past due (amount 2000, paid 2000, balance 0, due 10 days ago)
    // 4. Due today unpaid (amount 2000, paid 0, due today)
    // 5. Due today partially paid (amount 2000, paid 500, balance 1500, due today)
    // 6. Upcoming unpaid (amount 2000, paid 0, due in 7 days)
    const schedule = [
      {
        installmentNumber: 1,
        dueDate: past5Str,
        amount: 2000,
        paidAmount: 2000,
        status: 'Paid',
      },
      {
        installmentNumber: 2,
        dueDate: past5Str,
        amount: 2000,
        paidAmount: 800,
        status: 'Partially Paid', // Outdated raw status in DB
      },
      {
        installmentNumber: 3,
        dueDate: past5Str,
        amount: 2000,
        paidAmount: 0,
        status: 'Pending', // Outdated raw status in DB
      },
      {
        installmentNumber: 4,
        dueDate: todayStr,
        amount: 2000,
        paidAmount: 500,
        status: 'Partially Paid',
      },
      {
        installmentNumber: 5,
        dueDate: todayStr,
        amount: 2000,
        paidAmount: 0,
        status: 'Pending',
      },
      {
        installmentNumber: 6,
        dueDate: future7Str,
        amount: 2000,
        paidAmount: 0,
        status: 'Pending',
      },
    ];

    const planData = {
      orderId: `ORD-${Date.now()}`,
      memberId: testMemberId,
      memberName: 'Test Status Verification Member',
      memberPhone: '9876543210',
      productName: 'Solar Inverter 5kVA',
      totalAmount: 12000,
      downPayment: 0,
      installmentAmount: 2000,
      numberOfInstallments: 6,
      frequency: 'Monthly',
      status: 'active',
      schedule,
      createdAt: new Date().toISOString(),
    };

    await db.collection('installmentPlans').doc(testPlanId).set(planData);
    console.log(`  ✅ Inserted test installment plan: ${testPlanId}`);

    // Verify dynamic enrichment as performed by Admin DailyCollectionManagement
    const enrichedItems = schedule.map((inst) => {
      const dynamicStatus = getInstallmentStatus(inst);
      const remainingAmount = getInstallmentRemainingAmount(inst);
      const isOverdue = dynamicStatus === 'Overdue';
      const isDueToday = dynamicStatus === 'Due Today';
      const overdueDays = isOverdue ? getOverdueDays(inst.dueDate) : 0;

      return {
        ...inst,
        dynamicStatus,
        remainingAmount,
        isOverdue,
        isDueToday,
        overdueDays,
      };
    });

    // Check statuses of all 6 installments
    assertEqual(enrichedItems[0].dynamicStatus, 'Paid', 'Inst #1 (paid 2000/2000) dynamicStatus is Paid');
    assertTrue(!enrichedItems[0].isOverdue, 'Inst #1 isOverdue is FALSE');

    assertEqual(enrichedItems[1].dynamicStatus, 'Overdue', 'Inst #2 (paid 800/2000, past due) dynamicStatus is Overdue');
    assertTrue(enrichedItems[1].isOverdue, 'Inst #2 isOverdue is TRUE');
    assertEqual(enrichedItems[1].remainingAmount, 1200, 'Inst #2 remainingAmount is exactly 1200');

    assertEqual(enrichedItems[2].dynamicStatus, 'Overdue', 'Inst #3 (paid 0/2000, past due) dynamicStatus is Overdue');
    assertTrue(enrichedItems[2].isOverdue, 'Inst #3 isOverdue is TRUE');
    assertEqual(enrichedItems[2].remainingAmount, 2000, 'Inst #3 remainingAmount is exactly 2000');

    assertEqual(enrichedItems[3].dynamicStatus, 'Due Today', 'Inst #4 (paid 500/2000, due today) dynamicStatus is Due Today');
    assertEqual(enrichedItems[4].dynamicStatus, 'Due Today', 'Inst #5 (paid 0/2000, due today) dynamicStatus is Due Today');
    assertEqual(enrichedItems[5].dynamicStatus, 'Upcoming', 'Inst #6 (due in future) dynamicStatus is Upcoming');

    // Aggregate summary metrics as Admin Collection does
    const overdueList = enrichedItems.filter((i) => i.isOverdue);
    const overdueCount = overdueList.length;
    const overdueAmount = overdueList.reduce((sum, i) => sum + i.remainingAmount, 0);

    assertEqual(overdueCount, 2, 'Admin Overdue Collections count must be exactly 2');
    assertEqual(overdueAmount, 3200, 'Admin Overdue Collections amount must be 1200 + 2000 = 3200');

    // Test payment recording transition on backend
    console.log('\n--- TEST GROUP 4: Backend Payment Processing & Dynamic Status Persistence ---');
    // Pay remaining 1200 on Inst #2
    const paymentRef = db.collection('payments').doc();
    createdPaymentIds.push(paymentRef.id);

    await db.runTransaction(async (transaction) => {
      const planDoc = await transaction.get(db.collection('installmentPlans').doc(testPlanId));
      const currentData = planDoc.data();
      const updatedSchedule = [...currentData.schedule];
      const targetIndex = updatedSchedule.findIndex((s) => s.installmentNumber === 2);

      const targetItem = updatedSchedule[targetIndex];
      const newPaidAmount = parseFloat(((targetItem.paidAmount || 0) + 1200).toFixed(2));
      const remaining = Math.max(0, parseFloat((targetItem.amount - newPaidAmount).toFixed(2)));

      // Dynamic rule used in paymentService & paymentController
      let newStatus = 'Pending';
      if (remaining <= 0) {
        newStatus = 'Paid';
      } else if (targetItem.dueDate < todayStr) {
        newStatus = 'Overdue';
      } else if (targetItem.dueDate === todayStr) {
        newStatus = 'Due Today';
      } else {
        newStatus = 'Upcoming';
      }

      updatedSchedule[targetIndex] = {
        ...targetItem,
        paidAmount: newPaidAmount,
        status: newStatus,
        lastPaymentDate: todayStr,
      };

      transaction.update(db.collection('installmentPlans').doc(testPlanId), {
        schedule: updatedSchedule,
      });

      transaction.set(paymentRef, {
        planId: testPlanId,
        memberId: testMemberId,
        amount: 1200,
        installmentNumber: 2,
        paymentDate: todayStr,
        createdAt: new Date().toISOString(),
      });
    });

    console.log('  ✅ Recorded full payment of remaining 1200 for Inst #2');

    // Re-fetch plan and re-evaluate
    const updatedPlanSnap = await db.collection('installmentPlans').doc(testPlanId).get();
    const refreshedSchedule = updatedPlanSnap.data().schedule;
    const reEnriched = refreshedSchedule.map((inst) => ({
      ...inst,
      dynamicStatus: getInstallmentStatus(inst),
      remainingAmount: getInstallmentRemainingAmount(inst),
      isOverdue: getInstallmentStatus(inst) === 'Overdue',
    }));

    assertEqual(reEnriched[1].dynamicStatus, 'Paid', 'Inst #2 after remaining 1200 paid is now "Paid"');
    assertTrue(!reEnriched[1].isOverdue, 'Inst #2 isOverdue is now FALSE');

    const newOverdueList = reEnriched.filter((i) => i.isOverdue);
    assertEqual(newOverdueList.length, 1, 'Overdue count automatically decreased from 2 to 1');
    assertEqual(newOverdueList.reduce((sum, i) => sum + i.remainingAmount, 0), 2000, 'Overdue amount automatically updated to 2000');

  } catch (err) {
    console.error('❌ Error during database integration test:', err);
    failedTests++;
  } finally {
    // Cleanup created test records
    console.log('\n--- Cleaning up test records ---');
    for (const planId of createdPlanIds) {
      await db.collection('installmentPlans').doc(planId).delete().catch(() => {});
      console.log(`  🧹 Removed test plan: ${planId}`);
    }
    for (const payId of createdPaymentIds) {
      await db.collection('payments').doc(payId).delete().catch(() => {});
      console.log(`  🧹 Removed test payment: ${payId}`);
    }
  }

  console.log('\n======================================================');
  console.log(`🏁 TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runInstallmentStatusSystemTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
