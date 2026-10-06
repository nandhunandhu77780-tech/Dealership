import connectDB from '../config/db.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Script to create or update an Admin or Member user in Firebase Auth and Firestore.
 *
 * Usage:
 *   node scripts/createAdmin.js <email> [password] [name] [role]
 *
 * Example:
 *   node scripts/createAdmin.js user@example.com SecurePass123! "User Name" admin
 *   node scripts/createAdmin.js user@example.com --keep-password "User Name" admin
 */
const run = async () => {
  const args = process.argv.slice(2);
  const email = args[0];

  if (!email) {
    console.error('\nUsage: node scripts/createAdmin.js <email> [password] [name] [role]');
    console.error('Example: node scripts/createAdmin.js admin@domain.com AdminPass123! "Administrator" admin\n');
    process.exit(1);
  }

  const passwordArg = args[1];
  const nameArg = args[2];
  const roleArg = args[3] || 'admin';
  const role = roleArg.toLowerCase();

  if (!['admin', 'member'].includes(role)) {
    console.error('Role must be either "admin" or "member".');
    process.exit(1);
  }

  console.log(`\nConfiguring ${role} account for: ${email}...`);

  try {
    await connectDB();
    const auth = getAuth();
    const db = getFirestore();

    let userRecord;
    let name = nameArg;

    try {
      userRecord = await auth.getUserByEmail(email);
      console.log(`Found existing Firebase Auth user: ${userRecord.uid}`);
      name = name || userRecord.displayName || (role === 'member' ? 'Member User' : 'Administrator');

      const updateData = { displayName: name };
      if (passwordArg && passwordArg !== '--keep-password') {
        updateData.password = passwordArg;
      }
      userRecord = await auth.updateUser(userRecord.uid, updateData);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        const initialPassword = passwordArg && passwordArg !== '--keep-password' ? passwordArg : 'Admin@123456';
        name = name || (role === 'member' ? 'Member User' : 'Administrator');
        userRecord = await auth.createUser({
          email,
          password: initialPassword,
          displayName: name,
        });
        console.log(`Created new Firebase Auth user with UID: ${userRecord.uid}`);
      } else {
        throw err;
      }
    }

    // Write role and profile to Firestore under users/{uid}
    const userDocRef = db.collection('users').doc(userRecord.uid);
    await userDocRef.set(
      {
        name,
        email,
        role,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Set custom user claims on Firebase Auth token
    await auth.setCustomUserClaims(userRecord.uid, {
      role,
      admin: role === 'admin',
    });

    console.log(`\n✅ Successfully configured ${role.toUpperCase()} user!`);
    console.log(`----------------------------------------`);
    console.log(`Email:     ${email}`);
    console.log(`Password:  ${passwordArg ? (passwordArg === '--keep-password' ? '[Unchanged]' : passwordArg) : '[Unchanged / Managed by User]'}`);
    console.log(`Role:      ${role}`);
    console.log(`UID:       ${userRecord.uid}`);
    console.log(`Firestore: users/${userRecord.uid}`);
    console.log(`----------------------------------------\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Failed to configure user: ${error.message}`);
    if (error.message.includes('CONFIGURATION_NOT_FOUND') || error.message.includes('configuration corresponding')) {
      console.error(
        '\n👉 Important: Firebase Authentication has not been enabled yet in your Firebase Console.' +
        '\n   1. Open: https://console.firebase.google.com/project/project-karthi-b0f29/authentication' +
        '\n   2. Click "Get Started"' +
        '\n   3. Under Sign-in method, click "Email/Password" -> Enable "Email/Password" -> Click "Save".' +
        '\n   4. Re-run this command: npm run create-user'
      );
    }
    process.exit(1);
  }
};

run();
