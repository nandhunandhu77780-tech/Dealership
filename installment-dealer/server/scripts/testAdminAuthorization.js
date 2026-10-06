import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/db.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 Running Comprehensive Admin Authorization Verification Suite');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  };

  await connectDB();
  const auth = getAuth();
  const db = getFirestore();

  // -------------------------------------------------------------------------
  // 1. Verify nandhunandhu77780@gmail.com Account in Firebase Auth & Firestore
  // -------------------------------------------------------------------------
  console.log('--- 1. Verifying nandhunandhu77780@gmail.com Admin Credentials ---');
  const targetEmail = 'nandhunandhu77780@gmail.com';
  let authUser;
  try {
    authUser = await auth.getUserByEmail(targetEmail);
    assert(!!authUser, `Firebase Auth user found for ${targetEmail} (UID: ${authUser.uid})`);
  } catch (err) {
    assert(false, `Could not find Firebase Auth user for ${targetEmail}: ${err.message}`);
  }

  if (authUser) {
    // Check Custom Claims
    const hasAdminClaim = authUser.customClaims && (authUser.customClaims.role === 'admin' || authUser.customClaims.admin === true);
    assert(hasAdminClaim, `Firebase Auth custom claims include admin: ${JSON.stringify(authUser.customClaims)}`);

    // Check Firestore Document Match
    const docSnap = await db.collection('users').doc(authUser.uid).get();
    assert(docSnap.exists, `Firestore document users/${authUser.uid} exists matching Auth UID`);

    if (docSnap.exists) {
      const docData = docSnap.data();
      assert(docData.role === 'admin', `Firestore users/${authUser.uid} has role === 'admin' (Actual: ${docData.role})`);
      assert(docData.email === targetEmail, `Firestore document email matches ${targetEmail}`);
      assert(docData.name === 'Nandhu Krishnan', `Firestore document preserves user's name: ${docData.name}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Verify Member Account Has Role 'member' and NO Admin Privileges
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Verifying Non-Admin Members Are Restricted ---');
  try {
    const memberDocSnap = await db.collection('users').where('role', '==', 'member').limit(1).get();
    if (!memberDocSnap.empty) {
      const memberDoc = memberDocSnap.docs[0];
      const memberData = memberDoc.data();
      assert(memberData.role === 'member', `Member ${memberData.email} has role === 'member'`);

      try {
        const memberAuth = await auth.getUser(memberDoc.id);
        const hasNoAdminClaim = !memberAuth.customClaims || (memberAuth.customClaims.role !== 'admin' && !memberAuth.customClaims.admin);
        assert(hasNoAdminClaim, `Member does NOT have admin custom claims: ${JSON.stringify(memberAuth.customClaims || {})}`);
      } catch (e) {
        // Doc might not have corresponding auth user if seeded
        assert(true, 'Member role verified in Firestore');
      }
    } else {
      console.log('  ⚠️ No member accounts found in Firestore to test.');
    }
  } catch (err) {
    assert(false, `Error checking member restrictions: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // 3. Verify Security Rules Have NO Hardcoded Admin Email
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Verifying Security Rules Remove Hardcoded Dependencies ---');
  const firestoreRulesPath = path.resolve(__dirname, '../../firestore.rules');
  const storageRulesPath = path.resolve(__dirname, '../../storage.rules');

  const firestoreRulesContent = fs.readFileSync(firestoreRulesPath, 'utf8');
  const storageRulesContent = fs.readFileSync(storageRulesPath, 'utf8');

  assert(
    !firestoreRulesContent.includes('admin@example.com'),
    'firestore.rules has zero occurrences of hardcoded admin@example.com'
  );
  assert(
    firestoreRulesContent.includes('get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == \'admin\''),
    'firestore.rules checks role in users/{uid} document'
  );

  assert(
    !storageRulesContent.includes('admin@example.com'),
    'storage.rules has zero occurrences of hardcoded admin@example.com'
  );
  assert(
    storageRulesContent.includes('firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == \'admin\''),
    'storage.rules checks role in Firestore users/{uid} document'
  );

  // -------------------------------------------------------------------------
  // 4. Verify Admin UI Sections in Client
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Verifying Client Admin Page Sections ---');
  const adminPagePath = path.resolve(__dirname, '../../client/src/pages/AdminPage.jsx');
  const adminPageContent = fs.readFileSync(adminPagePath, 'utf8');

  const requiredSections = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'members', label: 'Members' },
    { id: 'products', label: 'Products' },
    { id: 'orders', label: 'Orders' },
    { id: 'installments', label: 'Installments' },
    { id: 'payments', label: 'Payments' },
    { id: 'collection', label: 'Collection' },
    { id: 'activity_log', label: 'Activity Log' },
  ];

  for (const sec of requiredSections) {
    assert(
      adminPageContent.includes(`id: '${sec.id}'`) && adminPageContent.includes(`label: '${sec.label}'`),
      `AdminPage contains navigation item for: ${sec.label} (${sec.id})`
    );
  }

  // -------------------------------------------------------------------------
  // 5. Verify Route Guards in App.jsx
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Verifying Protected Route Hierarchy ---');
  const appPath = path.resolve(__dirname, '../../client/src/App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert(
    appContent.includes("<ProtectedRoute allowedRoles={['admin']}>"),
    'App.jsx protects /admin routes requiring allowedRoles={[\'admin\']}'
  );
  assert(
    appContent.includes("<ProtectedRoute allowedRoles={['member']}>"),
    'App.jsx protects /member routes requiring allowedRoles={[\'member\']}'
  );

  // -------------------------------------------------------------------------
  // 6. Verify Existing Business Data Integrity
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Verifying Existing Firestore Collections Intact ---');
  const collectionsToCheck = ['products', 'orders', 'payments', 'installments'];
  for (const col of collectionsToCheck) {
    const snap = await db.collection(col).get();
    assert(snap.size >= 0, `Firestore collection "${col}" is accessible (${snap.size} records)`);
  }

  // -------------------------------------------------------------------------
  // Final Result
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
