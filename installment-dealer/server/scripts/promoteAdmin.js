import connectDB from '../config/db.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Promote an existing Firebase Auth account to Admin
 * Usage: node scripts/promoteAdmin.js [email]
 */
const run = async () => {
  const email = process.argv[2] || 'nandhunandhu77780@gmail.com';
  console.log(`\nPromoting user "${email}" to Admin role...`);

  try {
    await connectDB();
    const auth = getAuth();
    const db = getFirestore();

    const user = await auth.getUserByEmail(email);
    console.log(`Found Firebase Auth user: ${user.uid} (${user.email})`);

    // 1. Set custom claims on Firebase Auth
    await auth.setCustomUserClaims(user.uid, {
      role: 'admin',
      admin: true,
    });
    console.log('✅ Set custom claims { role: "admin", admin: true } on Firebase Auth token');

    // 2. Update Firestore users/{uid} document with role: 'admin'
    const userRef = db.collection('users').doc(user.uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const existingData = userSnap.data();
      await userRef.update({
        role: 'admin',
        updatedAt: new Date().toISOString(),
      });
      console.log(`✅ Updated existing Firestore users/${user.uid} to role: admin`);
    } else {
      await userRef.set({
        name: user.displayName || email.split('@')[0],
        email: user.email,
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log(`✅ Created Firestore users/${user.uid} with role: admin`);
    }

    // 3. Verify updated document
    const updatedSnap = await userRef.get();
    const updatedData = updatedSnap.data();
    console.log('\n--- Verified Firestore users/{uid} ---');
    console.log(`UID:   ${user.uid}`);
    console.log(`Email: ${updatedData.email}`);
    console.log(`Role:  ${updatedData.role}`);
    console.log(`Name:  ${updatedData.name}`);

    // 4. Verify refreshed claims
    const refreshedAuth = await auth.getUser(user.uid);
    console.log('\n--- Verified Auth Custom Claims ---');
    console.log(refreshedAuth.customClaims);

    console.log('\n🎉 Admin promotion completed successfully!\n');
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error promoting user to Admin: ${err.message}`);
    process.exit(1);
  }
};

run();
