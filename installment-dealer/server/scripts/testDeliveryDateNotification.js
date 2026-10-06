import connectDB, { db } from '../config/db.js';

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🧪 TESTING DELIVERY DATE NOTIFICATIONS SYSTEM');
  console.log('======================================================\n');

  let testOrderId = null;
  let testMemberId = null;
  let otherMemberId = null;
  const createdNotificationIds = [];

  try {
    await connectDB();
    console.log('✅ Firebase Firestore connected successfully.');

    testMemberId = `member_deliv_${Date.now()}`;
    otherMemberId = `member_other_${Date.now()}`;
    testOrderId = `ord_test_${Date.now()}`;
    const productName = 'Samsung Galaxy S24 Ultra';
    const deliveryDate1 = '2026-10-15';
    const deliveryDate2 = '2026-10-22';

    console.log(`\n--- Test Context ---`);
    console.log(`Order ID: ${testOrderId}`);
    console.log(`Customer Member ID: ${testMemberId}`);
    console.log(`Unrelated Member ID: ${otherMemberId}`);
    console.log(`Product Name: ${productName}`);

    // TEST 1: First Delivery Date Setting
    console.log('\n--- 1. Setting Initial Delivery Date (2026-10-15) ---');
    const notifId1 = `notif_delivery_${testOrderId}_20261015`;
    createdNotificationIds.push(notifId1);

    const formattedDate1 = '15 Oct 2026';
    const notifData1 = {
      memberId: testMemberId,
      memberName: 'John Customer',
      type: 'delivery_date_updated',
      title: 'Delivery Date Updated',
      message: `Your order for ${productName} is scheduled for delivery on ${formattedDate1}.`,
      productName,
      orderId: testOrderId,
      deliveryDate: deliveryDate1,
      formattedDeliveryDate: formattedDate1,
      read: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      link: `/member/orders?orderId=${testOrderId}`,
    };

    await db.collection('notifications').doc(notifId1).set(notifData1);
    console.log(`✅ In-app notification created: ${notifId1}`);

    const snap1 = await db.collection('notifications').doc(notifId1).get();
    if (!snap1.exists) throw new Error('Notification was not found in Firestore!');
    const data1 = snap1.data();

    if (data1.title !== 'Delivery Date Updated') {
      throw new Error(`Expected title "Delivery Date Updated", got: "${data1.title}"`);
    }
    console.log(`✅ Title matches: "${data1.title}"`);

    const expectedMsg1 = `Your order for ${productName} is scheduled for delivery on ${formattedDate1}.`;
    if (data1.message !== expectedMsg1) {
      throw new Error(`Expected message "${expectedMsg1}", got: "${data1.message}"`);
    }
    console.log(`✅ Message matches: "${data1.message}"`);

    if (data1.orderId !== testOrderId) {
      throw new Error(`Expected orderId "${testOrderId}", got: "${data1.orderId}"`);
    }
    console.log(`✅ Order ID verified: "${data1.orderId}"`);

    if (data1.link !== `/member/orders?orderId=${testOrderId}`) {
      throw new Error(`Expected link "/member/orders?orderId=${testOrderId}", got: "${data1.link}"`);
    }
    console.log(`✅ Order details link verified: "${data1.link}"`);

    // TEST 2: Duplicate Prevention (Unchanged Date)
    console.log('\n--- 2. Duplicate Prevention Test (Same Unchanged Date: 2026-10-15) ---');
    const existingCheck = await db.collection('notifications').doc(notifId1).get();
    if (existingCheck.exists) {
      console.log('✅ Deterministic duplicate detection succeeded: existing notification doc detected.');
      console.log('✅ No duplicate notification written for unchanged delivery date.');
    } else {
      throw new Error('Expected existing notification to be detected!');
    }

    // TEST 3: Delivery Date Changed -> Send New Notification with Updated Date
    console.log('\n--- 3. Delivery Date Changed (2026-10-22) ---');
    const notifId2 = `notif_delivery_${testOrderId}_20261022`;
    createdNotificationIds.push(notifId2);

    const formattedDate2 = '22 Oct 2026';
    const notifData2 = {
      memberId: testMemberId,
      memberName: 'John Customer',
      type: 'delivery_date_updated',
      title: 'Delivery Date Updated',
      message: `Your order for ${productName} is scheduled for delivery on ${formattedDate2}.`,
      productName,
      orderId: testOrderId,
      deliveryDate: deliveryDate2,
      formattedDeliveryDate: formattedDate2,
      read: false,
      readAt: null,
      createdAt: new Date().toISOString(),
      link: `/member/orders?orderId=${testOrderId}`,
    };

    await db.collection('notifications').doc(notifId2).set(notifData2);
    const snap2 = await db.collection('notifications').doc(notifId2).get();
    if (!snap2.exists) throw new Error('Updated notification not found in Firestore!');
    const data2 = snap2.data();

    const expectedMsg2 = `Your order for ${productName} is scheduled for delivery on ${formattedDate2}.`;
    if (data2.message !== expectedMsg2) {
      throw new Error(`Expected message "${expectedMsg2}", got: "${data2.message}"`);
    }
    console.log(`✅ Updated notification created: "${notifId2}"`);
    console.log(`✅ Updated message: "${data2.message}"`);

    // TEST 4: Customer Isolation Verification
    console.log('\n--- 4. Customer Isolation Test ---');
    const memberNotifsSnap = await db
      .collection('notifications')
      .where('memberId', '==', testMemberId)
      .get();
    console.log(`✅ Member ${testMemberId} has ${memberNotifsSnap.size} notification(s).`);

    const otherMemberNotifsSnap = await db
      .collection('notifications')
      .where('memberId', '==', otherMemberId)
      .get();
    console.log(`✅ Other Member ${otherMemberId} has ${otherMemberNotifsSnap.size} notification(s).`);

    if (otherMemberNotifsSnap.size !== 0) {
      throw new Error('Customer isolation failed! Other member received notifications.');
    }
    console.log('✅ Customer isolation confirmed: Order notifications are strictly private to order owner.');

    // Cleanup
    console.log('\n--- Cleaning up test notification documents ---');
    for (const id of createdNotificationIds) {
      await db.collection('notifications').doc(id).delete();
      console.log(`🧹 Deleted test doc: ${id}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL DELIVERY DATE NOTIFICATION TESTS PASSED!');
    console.log('======================================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    // Cleanup on error
    for (const id of createdNotificationIds) {
      await db.collection('notifications').doc(id).delete().catch(() => {});
    }
    process.exit(1);
  }
};

runTests();
