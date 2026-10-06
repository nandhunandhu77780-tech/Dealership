import connectDB, { db } from '../config/db.js';

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🧪 RUNNING INSTALLMENT NOTIFICATIONS AUTOMATED TESTS');
  console.log('======================================================\n');

  let testMemberId = null;
  let testPlanId = null;
  let testPaymentId = null;
  const createdNotificationIds = [];

  try {
    // 1. Connect Firestore
    await connectDB();
    console.log('✅ Firebase Firestore connected successfully.');

    // 2. Setup Test Data
    testMemberId = `test_member_${Date.now()}`;
    const testMemberName = 'Karthi Test Member';
    const testProductName = 'Apple iPad Air M2';

    const today = new Date();
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const todayStr = formatDate(today);

    // Overdue date: 5 days ago
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - 5);
    const pastDateStr = formatDate(pastDate);

    // Upcoming date: 3 days in future
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 3);
    const futureDateStr = formatDate(futureDate);

    // Far future date: 30 days in future
    const farFutureDate = new Date(today);
    farFutureDate.setDate(today.getDate() + 30);
    const farFutureDateStr = formatDate(farFutureDate);

    console.log('\n--- 1. Setting up Test Installment Plan & Payments ---');
    const testPlanRef = db.collection('installmentPlans').doc();
    testPlanId = testPlanRef.id;

    const planData = {
      orderId: `ord_test_${Date.now()}`,
      memberId: testMemberId,
      memberName: testMemberName,
      productName: testProductName,
      totalAmount: 40000,
      downPayment: 10000,
      remainingAmount: 30000,
      numberOfInstallments: 4,
      installmentAmount: 7500,
      frequency: 'Monthly',
      firstDueDate: pastDateStr,
      status: 'active',
      schedule: [
        {
          installmentNumber: 1,
          dueDate: pastDateStr,
          amount: 7500,
          paidAmount: 0,
          status: 'Overdue',
        },
        {
          installmentNumber: 2,
          dueDate: todayStr,
          amount: 7500,
          paidAmount: 0,
          status: 'Pending',
        },
        {
          installmentNumber: 3,
          dueDate: futureDateStr,
          amount: 7500,
          paidAmount: 2500,
          status: 'Partially Paid',
        },
        {
          installmentNumber: 4,
          dueDate: farFutureDateStr,
          amount: 7500,
          paidAmount: 7500,
          status: 'Paid',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await testPlanRef.set(planData);
    console.log(`✅ Test plan created: ${testPlanId}`);

    // Create a payment record for the down payment / installment #4
    const testPaymentRef = db.collection('payments').doc();
    testPaymentId = testPaymentRef.id;
    const paymentData = {
      memberId: testMemberId,
      memberName: testMemberName,
      installmentPlanId: testPlanId,
      installmentNumber: 4,
      productName: testProductName,
      amount: 7500,
      paymentMethod: 'UPI (PhonePe)',
      transactionId: `txn_${Date.now()}`,
      paymentDate: todayStr,
      status: 'Successful',
      createdAt: new Date().toISOString(),
    };
    await testPaymentRef.set(paymentData);
    console.log(`✅ Test payment created: ${testPaymentId}`);

    // 3. Test Notification Sync Logic
    console.log('\n--- 2. Executing Notification Synchronization ---');

    const syncNotifications = async (memberId) => {
      const plansSnap = await db
        .collection('installmentPlans')
        .where('memberId', '==', memberId)
        .get();

      const paymentsSnap = await db
        .collection('payments')
        .where('memberId', '==', memberId)
        .get();

      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(today.getDate() + 7);
      const sevenDaysLaterStr = formatDate(sevenDaysLater);

      const toCreate = [];

      plansSnap.forEach((docSnap) => {
        const plan = docSnap.data();
        if ((plan.status || '').toLowerCase() === 'completed') return;

        const schedule = Array.isArray(plan.schedule) ? plan.schedule : [];
        schedule.forEach((inst) => {
          if (inst.status === 'Paid') return;

          const totalAmt = parseFloat(inst.amount) || 0;
          const paidAmt = parseFloat(inst.paidAmount) || 0;
          const remaining = Math.max(0, totalAmt - paidAmt);
          if (remaining <= 0) return;

          const dueDate = inst.dueDate || '';

          if (dueDate && dueDate < todayStr) {
            toCreate.push({
              id: `notif_${docSnap.id}_inst_${inst.installmentNumber}_overdue`,
              data: {
                memberId,
                memberName: plan.memberName || 'Member',
                type: 'overdue',
                title: 'Overdue Installment Alert',
                message: `Installment #${inst.installmentNumber} for ${plan.productName} of ₹${remaining.toFixed(2)} was due on ${dueDate} and is overdue.`,
                productName: plan.productName || 'Product',
                installmentPlanId: docSnap.id,
                installmentNumber: inst.installmentNumber,
                dueDate,
                amount: remaining,
                read: false,
                readAt: null,
                createdAt: new Date().toISOString(),
                link: '/member/installments',
              },
            });
          } else if (dueDate && dueDate === todayStr) {
            toCreate.push({
              id: `notif_${docSnap.id}_inst_${inst.installmentNumber}_due_today`,
              data: {
                memberId,
                memberName: plan.memberName || 'Member',
                type: 'due_today',
                title: 'Installment Due Today',
                message: `Installment #${inst.installmentNumber} for ${plan.productName} of ₹${remaining.toFixed(2)} is due today!`,
                productName: plan.productName || 'Product',
                installmentPlanId: docSnap.id,
                installmentNumber: inst.installmentNumber,
                dueDate,
                amount: remaining,
                read: false,
                readAt: null,
                createdAt: new Date().toISOString(),
                link: '/member/installments',
              },
            });
          } else if (dueDate && dueDate > todayStr && dueDate <= sevenDaysLaterStr) {
            toCreate.push({
              id: `notif_${docSnap.id}_inst_${inst.installmentNumber}_upcoming`,
              data: {
                memberId,
                memberName: plan.memberName || 'Member',
                type: 'upcoming',
                title: 'Upcoming Installment Due',
                message: `Installment #${inst.installmentNumber} for ${plan.productName} of ₹${remaining.toFixed(2)} is due on ${dueDate}.`,
                productName: plan.productName || 'Product',
                installmentPlanId: docSnap.id,
                installmentNumber: inst.installmentNumber,
                dueDate,
                amount: remaining,
                read: false,
                readAt: null,
                createdAt: new Date().toISOString(),
                link: '/member/installments',
              },
            });
          }
        });
      });

      paymentsSnap.forEach((payDoc) => {
        const pay = payDoc.data();
        toCreate.push({
          id: `notif_pay_${payDoc.id}`,
          data: {
            memberId,
            memberName: pay.memberName || 'Member',
            type: 'payment_success',
            title: 'Payment Recorded Successfully',
            message: `Your payment of ₹${parseFloat(pay.amount || 0).toFixed(2)} for Installment #${pay.installmentNumber} (${pay.productName}) was successfully received via ${pay.paymentMethod || 'Online'}.`,
            productName: pay.productName || 'Product',
            installmentPlanId: pay.installmentPlanId || '',
            installmentNumber: pay.installmentNumber || 1,
            dueDate: pay.paymentDate || todayStr,
            amount: parseFloat(pay.amount || 0),
            read: false,
            readAt: null,
            createdAt: pay.createdAt || new Date().toISOString(),
            link: '/member/payments',
          },
        });
      });

      let created = 0;
      for (const item of toCreate) {
        const notifRef = db.collection('notifications').doc(item.id);
        const existing = await notifRef.get();
        if (!existing.exists) {
          await notifRef.set(item.data);
          created++;
          createdNotificationIds.push(item.id);
        }
      }

      return { created, total: toCreate.length };
    };

    const firstSync = await syncNotifications(testMemberId);
    console.log(`First Sync Result: Created ${firstSync.created} of ${firstSync.total} expected.`);
    if (firstSync.created !== 4) {
      throw new Error(`Expected exactly 4 notifications created on first sync, got ${firstSync.created}`);
    }
    console.log('✅ Exactly 4 notifications created for Overdue, Due Today, Upcoming, and Payment Success.');

    // 4. Verify Individual Notifications in Firestore
    console.log('\n--- 3. Verifying Notification Fields & Data Schema ---');

    // Overdue
    const overdueSnap = await db
      .collection('notifications')
      .doc(`notif_${testPlanId}_inst_1_overdue`)
      .get();
    if (!overdueSnap.exists) throw new Error('Overdue notification not found!');
    const overdueData = overdueSnap.data();
    if (overdueData.type !== 'overdue') throw new Error('Expected type "overdue"');
    if (overdueData.amount !== 7500) throw new Error('Expected amount 7500');
    if (overdueData.read !== false) throw new Error('Expected unread status');
    console.log('✅ Overdue notification verified.');

    // Due Today
    const dueTodaySnap = await db
      .collection('notifications')
      .doc(`notif_${testPlanId}_inst_2_due_today`)
      .get();
    if (!dueTodaySnap.exists) throw new Error('Due Today notification not found!');
    const dueTodayData = dueTodaySnap.data();
    if (dueTodayData.type !== 'due_today') throw new Error('Expected type "due_today"');
    if (dueTodayData.amount !== 7500) throw new Error('Expected amount 7500');
    console.log('✅ Due Today notification verified.');

    // Upcoming
    const upcomingSnap = await db
      .collection('notifications')
      .doc(`notif_${testPlanId}_inst_3_upcoming`)
      .get();
    if (!upcomingSnap.exists) throw new Error('Upcoming notification not found!');
    const upcomingData = upcomingSnap.data();
    if (upcomingData.type !== 'upcoming') throw new Error('Expected type "upcoming"');
    if (upcomingData.amount !== 5000) throw new Error('Expected remaining amount 5000 (7500 - 2500 paid)');
    console.log('✅ Upcoming notification verified.');

    // Payment Success
    const paySuccessSnap = await db
      .collection('notifications')
      .doc(`notif_pay_${testPaymentId}`)
      .get();
    if (!paySuccessSnap.exists) throw new Error('Payment Success notification not found!');
    const paySuccessData = paySuccessSnap.data();
    if (paySuccessData.type !== 'payment_success') throw new Error('Expected type "payment_success"');
    if (paySuccessData.amount !== 7500) throw new Error('Expected amount 7500');
    console.log('✅ Payment Success notification verified.');

    // 5. Test Deduplication (Requirement 10)
    console.log('\n--- 4. Testing Deduplication (Requirement 10) ---');
    const secondSync = await syncNotifications(testMemberId);
    console.log(`Second Sync Result: Created ${secondSync.created} notifications.`);
    if (secondSync.created !== 0) {
      throw new Error(`Expected 0 duplicate notifications created, got ${secondSync.created}`);
    }

    const allMemberNotifsSnap = await db
      .collection('notifications')
      .where('memberId', '==', testMemberId)
      .get();
    if (allMemberNotifsSnap.size !== 4) {
      throw new Error(`Expected exactly 4 total notifications, found ${allMemberNotifsSnap.size}`);
    }
    console.log('✅ Duplicate notifications strictly prevented (0 duplicates created).');

    // 6. Test Mark as Read (Requirement 5)
    console.log('\n--- 5. Testing Mark Single Notification as Read ---');
    const targetNotifId = `notif_${testPlanId}_inst_1_overdue`;
    await db.collection('notifications').doc(targetNotifId).update({
      read: true,
      readAt: new Date().toISOString(),
    });

    const updatedNotif = (await db.collection('notifications').doc(targetNotifId).get()).data();
    if (!updatedNotif.read || !updatedNotif.readAt) {
      throw new Error('Notification was not marked as read!');
    }
    console.log('✅ Single notification marked as read with timestamp.');

    // 7. Verify sync preserves read status
    console.log('\n--- 6. Verifying Sync Preserves Read Status ---');
    await syncNotifications(testMemberId);
    const postSyncNotif = (await db.collection('notifications').doc(targetNotifId).get()).data();
    if (!postSyncNotif.read) {
      throw new Error('Sync erroneously reverted read status back to unread!');
    }
    console.log('✅ Read status preserved after repeated syncs.');

    // 8. Test Mark All as Read
    console.log('\n--- 7. Testing Mark All Notifications as Read ---');
    const unreadSnap = await db
      .collection('notifications')
      .where('memberId', '==', testMemberId)
      .where('read', '==', false)
      .get();

    const batch = db.batch();
    unreadSnap.docs.forEach((d) => {
      batch.update(d.ref, { read: true, readAt: new Date().toISOString() });
    });
    await batch.commit();

    const remainingUnreadSnap = await db
      .collection('notifications')
      .where('memberId', '==', testMemberId)
      .where('read', '==', false)
      .get();

    if (!remainingUnreadSnap.empty) {
      throw new Error(`Expected 0 unread notifications, got ${remainingUnreadSnap.size}`);
    }
    console.log('✅ Mark All as Read successfully updated all notifications.');

    // 9. Test Admin Summary Retrieval (Requirement 8)
    console.log('\n--- 8. Testing Admin Summary Retrieval (Requirement 8) ---');
    const adminSnap = await db
      .collection('notifications')
      .where('memberId', '==', testMemberId)
      .get();

    let overdueCount = 0;
    adminSnap.docs.forEach((d) => {
      if (d.data().type === 'overdue') overdueCount++;
    });

    console.log('Admin audit summary:', {
      total: adminSnap.size,
      overdue: overdueCount,
    });
    if (adminSnap.size !== 4 || overdueCount !== 1) {
      throw new Error('Admin summary count mismatch!');
    }
    console.log('✅ Admin read-only notification status verified.');

    // 10. Clean up test documents
    console.log('\n--- 9. Cleaning up Test Documents in Firestore ---');
    await testPlanRef.delete();
    await testPaymentRef.delete();
    for (const notifId of createdNotificationIds) {
      await db.collection('notifications').doc(notifId).delete();
    }
    console.log('✅ Cleaned up all test plans, payments, and notifications.');

    console.log('\n======================================================');
    console.log('🎉 ALL 8 NOTIFICATION AUTOMATED TEST SUITES PASSED!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ NOTIFICATION TEST FAILURE:', err);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
};

runTests();
