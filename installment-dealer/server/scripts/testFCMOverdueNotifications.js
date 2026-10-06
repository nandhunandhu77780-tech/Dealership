import connectDB, { db } from '../config/db.js';
import {
  registerMemberToken,
  unregisterMemberToken,
  getActiveTokensForMember,
  deleteInvalidToken,
  sendOverdueNotificationForInstallment,
  detectAndSendAllOverdueNotifications,
  hasOverduePushBeenSent,
  getLocalDateString,
  getInstallmentRemainingAmount,
  getInstallmentStatus,
} from '../services/fcmService.js';

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🧪 RUNNING FCM REAL-TIME PUSH NOTIFICATIONS TEST SUITE');
  console.log('======================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  const assertEqual = (actual, expected, desc) => {
    if (actual === expected) {
      console.log(`  ✅ PASS: ${desc} (Expected: "${expected}", Got: "${actual}")`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${desc} (Expected: "${expected}", Got: "${actual}")`);
      failedTests++;
    }
  };

  const assertTrue = (condition, desc) => {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failedTests++;
    }
  };

  const cleanupIds = {
    plans: [],
    tokens: [],
    logs: [],
    notifications: [],
  };

  try {
    await connectDB();
    console.log('✅ Connected to Firestore database.\n');

    const testMemberId = `test_fcm_member_${Date.now()}`;
    const testTokenDesktop = `fake_fcm_token_desktop_${Date.now()}_xyz123abc456`;
    const testTokenMobile = `fake_fcm_token_mobile_${Date.now()}_def789ghi012`;

    // -------------------------------------------------------------------------
    // TEST 1: Multiple Device Token Registration & Association with Member
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: FCM Device Token Storage & Multiple Device Support ---');

    // Register Desktop Token
    const resDesktop = await registerMemberToken({
      memberId: testMemberId,
      token: testTokenDesktop,
      deviceInfo: 'Chrome on Windows 11',
    });
    cleanupIds.tokens.push(resDesktop.tokenId);
    assertTrue(resDesktop && resDesktop.tokenId, 'Successfully registered desktop FCM token in Firestore');

    // Register Mobile Token (Multiple Devices for same member)
    const resMobile = await registerMemberToken({
      memberId: testMemberId,
      token: testTokenMobile,
      deviceInfo: 'Safari on iPhone 15',
    });
    cleanupIds.tokens.push(resMobile.tokenId);
    assertTrue(resMobile && resMobile.tokenId, 'Successfully registered second device token (mobile) for same member');

    // Verify token retrieval for member
    const activeTokens = await getActiveTokensForMember(testMemberId);
    assertEqual(activeTokens.length, 2, 'Member has exactly 2 active device tokens retrieved');
    assertTrue(activeTokens.includes(testTokenDesktop), 'Active tokens list contains desktop token');
    assertTrue(activeTokens.includes(testTokenMobile), 'Active tokens list contains mobile token');

    // Verify document fields in Firestore fcmTokens
    const desktopDoc = await db.collection('fcmTokens').doc(resDesktop.tokenId).get();
    assertTrue(desktopDoc.exists, 'Desktop token document exists in fcmTokens collection');
    assertEqual(desktopDoc.data().memberId, testMemberId, 'Token document correctly associated with memberId');
    assertEqual(desktopDoc.data().deviceInfo, 'Chrome on Windows 11', 'Token document preserves device info');
    assertEqual(desktopDoc.data().enabled, true, 'Token document has enabled: true');

    // -------------------------------------------------------------------------
    // TEST 2: Upcoming to Overdue Transition Detection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Upcoming → Overdue Transition & Status Evaluation ---');
    const todayStr = getLocalDateString(new Date());
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const pastStr = getLocalDateString(pastDate);
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const futureStr = getLocalDateString(futureDate);

    const upcomingInst = {
      installmentNumber: 1,
      dueDate: futureStr,
      amount: 4000,
      paidAmount: 0,
      status: 'Pending',
    };

    // State 1: Due date is in future
    assertEqual(getInstallmentStatus(upcomingInst), 'Upcoming', 'Installment due in future correctly evaluates to "Upcoming"');

    // Transition to Overdue: Due date passes while balance remains > 0
    const transitionedOverdueInst = {
      ...upcomingInst,
      dueDate: pastStr,
    };

    assertEqual(
      getInstallmentStatus(transitionedOverdueInst),
      'Overdue',
      'When due date passes and balance remains, status transitions to "Overdue"'
    );
    assertEqual(
      getInstallmentRemainingAmount(transitionedOverdueInst),
      4000,
      'Remaining amount correctly computed as 4000'
    );

    // -------------------------------------------------------------------------
    // TEST 3: Overdue Notification Dispatch & Required Content Fields
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Overdue Notification Content & Field Requirements ---');
    const testPlanId = `test_fcm_plan_${Date.now()}`;
    cleanupIds.plans.push(testPlanId);

    const testPlan = {
      id: testPlanId,
      orderId: `ORD-${Date.now()}`,
      memberId: testMemberId,
      memberName: 'Suresh Kumar',
      productName: 'Voltas 1.5 Ton Split AC',
      totalAmount: 24000,
      downPayment: 4000,
      installmentAmount: 4000,
      numberOfInstallments: 5,
      frequency: 'Monthly',
      status: 'active',
      schedule: [
        {
          installmentNumber: 1,
          dueDate: pastStr,
          amount: 4000,
          paidAmount: 1500, // partially paid overdue (balance 2500)
          status: 'Partially Paid',
        },
      ],
    };

    await db.collection('installmentPlans').doc(testPlanId).set(testPlan);
    console.log(`  ✅ Inserted test plan ${testPlanId} with partially paid overdue installment`);

    const overdueInst = testPlan.schedule[0];
    const remainingAmt = getInstallmentRemainingAmount(overdueInst);
    assertEqual(remainingAmt, 2500, 'Overdue installment remaining balance is 2500');

    // Send overdue notification
    const dispatchRes = await sendOverdueNotificationForInstallment({
      plan: testPlan,
      installment: overdueInst,
      memberId: testMemberId,
    });

    assertTrue(dispatchRes && dispatchRes.success, 'sendOverdueNotificationForInstallment executed successfully');
    cleanupIds.logs.push(`overdue_log_${testPlanId}_inst_${overdueInst.installmentNumber}`);
    cleanupIds.notifications.push(`notif_${testPlanId}_inst_${overdueInst.installmentNumber}_overdue`);

    // Verify overdue log created in Firestore
    const logDoc = await db.collection('overduePushLogs').doc(`overdue_log_${testPlanId}_inst_1`).get();
    assertTrue(logDoc.exists, 'Overdue push log saved in Firestore overduePushLogs');
    assertEqual(logDoc.data().productName, 'Voltas 1.5 Ton Split AC', 'Log contains exact product name');
    assertEqual(logDoc.data().installmentNumber, 1, 'Log contains installment number');
    assertEqual(logDoc.data().remainingAmount, 2500, 'Log contains remaining balance');
    assertEqual(logDoc.data().dueDate, pastStr, 'Log contains due date');

    // Verify in-app notifications collection was synchronized (Requirement 10)
    const inAppNotifDoc = await db.collection('notifications').doc(`notif_${testPlanId}_inst_1_overdue`).get();
    assertTrue(inAppNotifDoc.exists, 'In-app notification was synchronized alongside push notification');
    assertEqual(inAppNotifDoc.data().title, 'Payment Overdue', 'In-app notification title is "Payment Overdue"');
    assertEqual(inAppNotifDoc.data().pushSent, true, 'In-app notification records pushSent: true');
    assertEqual(inAppNotifDoc.data().link, '/member/installments', 'In-app notification links to /member/installments');

    // -------------------------------------------------------------------------
    // TEST 4: Duplicate Notification Prevention (Requirement 7)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Duplicate Overdue Notification Prevention ---');
    const duplicateCheck = await hasOverduePushBeenSent(testPlanId, overdueInst.installmentNumber);
    assertTrue(duplicateCheck, 'hasOverduePushBeenSent returns true for already notified installment');

    // Attempt second dispatch for same installment
    const secondDispatch = await sendOverdueNotificationForInstallment({
      plan: testPlan,
      installment: overdueInst,
      memberId: testMemberId,
    });

    assertTrue(secondDispatch.skipped, 'Second dispatch was SKIPPED');
    assertEqual(secondDispatch.reason, 'duplicate', 'Second dispatch returned reason: "duplicate"');

    // -------------------------------------------------------------------------
    // TEST 5: Automatic Plan Scanner & Overdue Processing
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: detectAndSendAllOverdueNotifications Scanner ---');
    const scanSummary = await detectAndSendAllOverdueNotifications();
    assertTrue(scanSummary.totalActivePlans >= 1, 'Scanner scanned active installment plans');
    assertTrue(scanSummary.duplicatesSkipped >= 1, 'Scanner successfully skipped already-notified overdue installments');

    // -------------------------------------------------------------------------
    // TEST 6: Dead / Invalid Token Cleanup (Requirement 9)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Invalid / Expired Token Cleanup ---');
    const deadToken = `dead_expired_fcm_token_${Date.now()}`;
    const deadReg = await registerMemberToken({
      memberId: testMemberId,
      token: deadToken,
      deviceInfo: 'Old Android Tablet',
    });
    cleanupIds.tokens.push(deadReg.tokenId);

    // Verify it exists first
    const deadDocBefore = await db.collection('fcmTokens').doc(deadReg.tokenId).get();
    assertTrue(deadDocBefore.exists, 'Dead token was registered');

    // Trigger cleanup
    await deleteInvalidToken(deadToken);

    // Verify it was deleted
    const deadDocAfter = await db.collection('fcmTokens').doc(deadReg.tokenId).get();
    assertTrue(!deadDocAfter.exists, 'Dead token was successfully deleted from Firestore');

    // -------------------------------------------------------------------------
    // TEST 7: Token Unregistration upon Logout / Device Opt-Out
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Token Unregistration (Logout / Opt-Out) ---');
    const tokenDeviceA = `device_a_token_${Date.now()}`;
    const tokenDeviceB = `device_b_token_${Date.now()}`;

    const regA = await registerMemberToken({
      memberId: testMemberId,
      token: tokenDeviceA,
      deviceInfo: 'Laptop Chrome',
    });
    const regB = await registerMemberToken({
      memberId: testMemberId,
      token: tokenDeviceB,
      deviceInfo: 'Work Phone Safari',
    });
    cleanupIds.tokens.push(regA.tokenId, regB.tokenId);

    const unregResult = await unregisterMemberToken({
      memberId: testMemberId,
      token: tokenDeviceA,
    });
    assertTrue(unregResult, 'unregisterMemberToken returned success for device A token');

    const remainingTokens = await getActiveTokensForMember(testMemberId);
    assertTrue(!remainingTokens.includes(tokenDeviceA), 'Device A token no longer present');
    assertTrue(remainingTokens.includes(tokenDeviceB), 'Device B token remains active on other device');

  } catch (error) {
    console.error('❌ Unexpected error during FCM notification tests:', error);
    failedTests++;
  } finally {
    console.log('\n--- Cleaning up temporary test documents ---');
    for (const planId of cleanupIds.plans) {
      await db.collection('installmentPlans').doc(planId).delete().catch(() => {});
      console.log(`  🧹 Deleted test plan: ${planId}`);
    }
    for (const tokenId of cleanupIds.tokens) {
      await db.collection('fcmTokens').doc(tokenId).delete().catch(() => {});
      console.log(`  🧹 Deleted test token: ${tokenId}`);
    }
    for (const logId of cleanupIds.logs) {
      await db.collection('overduePushLogs').doc(logId).delete().catch(() => {});
      console.log(`  🧹 Deleted test log: ${logId}`);
    }
    for (const notifId of cleanupIds.notifications) {
      await db.collection('notifications').doc(notifId).delete().catch(() => {});
      console.log(`  🧹 Deleted test notification: ${notifId}`);
    }
  }

  console.log('\n======================================================');
  console.log(`🏁 FCM TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
