import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { db, auth } from './firebase.js';

const MEMBERS_COLLECTION = 'members';
const USERS_COLLECTION = 'users';

/**
 * Deterministic business Member ID generation from Auth UID
 * e.g., MEM-A8B9C0
 * @param {string} uid
 * @returns {string}
 */
export const generateMemberIdFromUid = (uid) => {
  if (!uid) return 'MEM-0001';
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const sub = clean.slice(0, 6).padEnd(6, 'X');
  return `MEM-${sub}`;
};

/**
 * Standardize mobile number to clean 10-digit Indian mobile format
 * @param {string|number} phone
 * @returns {string}
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  // If 12 digits starting with country code 91, extract the 10 digits
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  // If 11 digits starting with leading 0, extract the 10 digits
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
};

/**
 * Validate format of mobile number (standard 10-digit Indian mobile starting with 6, 7, 8, 9)
 * @param {string|number} phone
 * @returns {{ isValid: boolean, normalized: string, error?: string }}
 */
export const validateMobileFormat = (phone) => {
  const trimmed = String(phone || '').trim();
  if (!trimmed) {
    return { isValid: false, normalized: '', error: 'Mobile number is required.' };
  }

  const normalized = normalizePhoneNumber(trimmed);
  if (normalized.length !== 10) {
    return {
      isValid: false,
      normalized,
      error: 'Please enter a valid 10-digit mobile number (e.g. 9876543210).',
    };
  }

  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: 'Mobile number must be a valid 10-digit number starting with 6, 7, 8, or 9.',
    };
  }

  return { isValid: true, normalized };
};

/**
 * Verify whether a mobile number is already registered to a different member in Firestore.
 * Prevents duplicate mobile numbers across the system.
 *
 * @param {string} phone
 * @param {string|null} currentUid - Firebase Auth UID of the current user (if any)
 * @param {string|null} currentMemberDocId - Firestore document ID in 'members' collection (if any)
 * @returns {Promise<{ isUnique: boolean, message?: string }>}
 */
export const checkMobileNumberUnique = async (phone, currentUid = null, currentMemberDocId = null) => {
  const formatCheck = validateMobileFormat(phone);
  if (!formatCheck.isValid) {
    return { isUnique: false, message: formatCheck.error };
  }

  const normalized = formatCheck.normalized;
  const raw = String(phone || '').trim();

  try {
    // 1. Query 'users' collection
    const usersRef = collection(db, USERS_COLLECTION);
    const qUsersNorm = query(usersRef, where('phone', '==', normalized), limit(5));
    const snapUsersNorm = await getDocs(qUsersNorm);

    for (const d of snapUsersNorm.docs) {
      if (currentUid && d.id === currentUid) continue;
      const data = d.data();
      const name = data.name || 'Another member';
      return {
        isUnique: false,
        message: `The mobile number "${normalized}" is already registered to ${name}. Each member must have a unique mobile number.`,
      };
    }

    if (raw && raw !== normalized) {
      const qUsersRaw = query(usersRef, where('phone', '==', raw), limit(5));
      const snapUsersRaw = await getDocs(qUsersRaw);
      for (const d of snapUsersRaw.docs) {
        if (currentUid && d.id === currentUid) continue;
        const data = d.data();
        const name = data.name || 'Another member';
        return {
          isUnique: false,
          message: `The mobile number "${raw}" is already registered to ${name}. Each member must have a unique mobile number.`,
        };
      }
    }

    // 2. Query 'members' collection
    const membersRef = collection(db, MEMBERS_COLLECTION);
    const qMembersNorm = query(membersRef, where('phone', '==', normalized), limit(5));
    const snapMembersNorm = await getDocs(qMembersNorm);

    for (const d of snapMembersNorm.docs) {
      if (currentMemberDocId && d.id === currentMemberDocId) continue;
      const data = d.data();
      if (currentUid && data.userId === currentUid) continue;
      const name = data.name || 'Another member';
      const memId = data.memberId ? ` (${data.memberId})` : '';
      return {
        isUnique: false,
        message: `The mobile number "${normalized}" is already registered to member ${name}${memId}. Please enter a unique mobile number.`,
      };
    }

    if (raw && raw !== normalized) {
      const qMembersRaw = query(membersRef, where('phone', '==', raw), limit(5));
      const snapMembersRaw = await getDocs(qMembersRaw);
      for (const d of snapMembersRaw.docs) {
        if (currentMemberDocId && d.id === currentMemberDocId) continue;
        const data = d.data();
        if (currentUid && data.userId === currentUid) continue;
        const name = data.name || 'Another member';
        const memId = data.memberId ? ` (${data.memberId})` : '';
        return {
          isUnique: false,
          message: `The mobile number "${raw}" is already registered to member ${name}${memId}. Please enter a unique mobile number.`,
        };
      }
    }

    return { isUnique: true };
  } catch (err) {
    console.warn('Mobile uniqueness check query encountered error:', err);
    // In case of transient network glitch, let it proceed gracefully
    return { isUnique: true };
  }
};

/**
 * Validation helper for member editable profile fields
 * Name and Mobile Number are REQUIRED fields.
 *
 * @param {object} param0
 * @param {string} param0.name
 * @param {string} param0.phone
 * @param {string} [param0.address]
 * @returns {{ isValid: boolean, errors: { name?: string, phone?: string, address?: string } }}
 */
export const validateProfileInput = ({ name = '', phone = '', address = '' }) => {
  const errors = {};
  const trimmedName = (name || '').trim();
  const trimmedAddress = (address || '').trim();

  // 1. Name validation (Required)
  if (!trimmedName) {
    errors.name = 'Full Name is required.';
  } else if (trimmedName.length < 2) {
    errors.name = 'Full Name must be at least 2 characters long.';
  } else if (trimmedName.length > 100) {
    errors.name = 'Full Name must not exceed 100 characters.';
  }

  // 2. Mobile validation (Required & Format Verified)
  const mobileRes = validateMobileFormat(phone);
  if (!mobileRes.isValid) {
    errors.phone = mobileRes.error;
  }

  // 3. Address validation (Optional, but if given, enforce bounds)
  if (trimmedAddress && trimmedAddress.length > 500) {
    errors.address = 'Address cannot exceed 500 characters.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Retrieve comprehensive member profile from users/{uid} and linked members/{id}
 * @param {import('firebase/auth').User} user
 * @returns {Promise<object>}
 */
export const getMemberProfile = async (user) => {
  if (!user || !user.uid) {
    throw new Error('Authentication is required to fetch profile');
  }

  const uid = user.uid;
  const userEmail = (user.email || '').toLowerCase();

  // 1. Fetch user document from users/{uid}
  let userDocData = null;
  try {
    const userDocRef = doc(db, USERS_COLLECTION, uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      userDocData = userDocSnap.data();
    }
  } catch (err) {
    console.warn('Could not read users collection document:', err);
  }

  // 2. Fetch linked member document from members collection if present
  let memberDocData = null;
  let memberDocId = null;

  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);

    // Search by userId == uid
    const qUserId = query(membersRef, where('userId', '==', uid), limit(1));
    const snapUserId = await getDocs(qUserId);

    if (!snapUserId.empty) {
      memberDocId = snapUserId.docs[0].id;
      memberDocData = snapUserId.docs[0].data();
    } else if (userEmail) {
      // Fallback search by email
      const qEmail = query(membersRef, where('email', '==', userEmail), limit(1));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        memberDocId = snapEmail.docs[0].id;
        memberDocData = snapEmail.docs[0].data();
      }
    }
  } catch (err) {
    console.warn('Could not query members collection:', err);
  }

  // 3. Provider detection (Email/Password vs Google)
  const providerData = user.providerData || [];
  const isPasswordUser = providerData.some((p) => p.providerId === 'password');
  const isGoogleUser = providerData.some((p) => p.providerId === 'google.com');

  // 4. Consolidate resolved values
  const name =
    userDocData?.name ||
    memberDocData?.name ||
    user.displayName ||
    (user.email ? user.email.split('@')[0] : 'Member');

  const email = user.email || userDocData?.email || memberDocData?.email || '';

  const memberId =
    memberDocData?.memberId ||
    userDocData?.memberId ||
    generateMemberIdFromUid(uid);

  const phone = userDocData?.phone || memberDocData?.phone || '';
  const address = userDocData?.address || memberDocData?.address || '';
  const status = memberDocData?.status || userDocData?.status || 'active';
  const role = userDocData?.role || 'member';

  // Ensure users/{uid} has memberId and status stored for consistency
  if (userDocData && (!userDocData.memberId || !userDocData.status)) {
    try {
      const userDocRef = doc(db, USERS_COLLECTION, uid);
      await setDoc(
        userDocRef,
        {
          memberId,
          status,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      // Non-critical persistence failure
    }
  }

  return {
    uid,
    name,
    email,
    memberId,
    phone,
    address,
    status,
    role,
    memberDocId,
    isPasswordUser,
    isGoogleUser,
    photoURL: user.photoURL || userDocData?.photoURL || '',
    createdAt: userDocData?.createdAt || memberDocData?.createdAt || new Date().toISOString(),
    updatedAt: userDocData?.updatedAt || memberDocData?.updatedAt || new Date().toISOString(),
  };
};

/**
 * Update editable profile fields (name, phone, address) across users and members collections
 * Validates mobile number format and enforces mobile uniqueness across all members.
 *
 * @param {import('firebase/auth').User|string} user - Firebase User object or UID string
 * @param {object} profileData
 * @param {string} profileData.name
 * @param {string} profileData.phone
 * @param {string} [profileData.address]
 * @returns {Promise<object>} Updated profile
 */
export const updateMemberProfile = async (user, { name, phone, address = '' }) => {
  const uid = typeof user === 'string' ? user : user?.uid;
  if (!uid) {
    throw new Error('Authentication is required to update profile.');
  }

  // 1. Validate fields
  const validation = validateProfileInput({ name, phone, address });
  if (!validation.isValid) {
    const firstError = Object.values(validation.errors)[0];
    throw new Error(firstError);
  }

  const trimmedName = (name || '').trim();
  const normalizedPhone = normalizePhoneNumber(phone);
  const trimmedAddress = (address || '').trim();
  const nowISO = new Date().toISOString();

  // 2. Resolve existing member document ID to prevent false duplicate detection on self
  let linkedMemberDocId = null;
  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);
    const qUserId = query(membersRef, where('userId', '==', uid), limit(1));
    const memberDocSnap = await getDocs(qUserId);
    if (!memberDocSnap.empty) {
      linkedMemberDocId = memberDocSnap.docs[0].id;
    }
  } catch {}

  // 3. Enforce mobile number uniqueness
  const uniquenessCheck = await checkMobileNumberUnique(normalizedPhone, uid, linkedMemberDocId);
  if (!uniquenessCheck.isUnique) {
    throw new Error(uniquenessCheck.message);
  }

  // 4. Update users/{uid} document
  const userDocRef = doc(db, USERS_COLLECTION, uid);
  const userUpdateData = {
    name: trimmedName,
    phone: normalizedPhone,
    address: trimmedAddress,
    profileCompleted: true,
    updatedAt: nowISO,
  };

  await setDoc(userDocRef, userUpdateData, { merge: true });

  // 5. Update linked members document if one exists in members collection
  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);
    let memberDocRef = null;

    if (linkedMemberDocId) {
      memberDocRef = doc(db, MEMBERS_COLLECTION, linkedMemberDocId);
    } else {
      const authEmail = (typeof user === 'object' && user?.email) || '';
      if (authEmail) {
        const qEmail = query(membersRef, where('email', '==', authEmail.toLowerCase()), limit(1));
        const snap = await getDocs(qEmail);
        if (!snap.empty) {
          memberDocRef = doc(db, MEMBERS_COLLECTION, snap.docs[0].id);
        }
      }
    }

    if (memberDocRef) {
      // Update existing member record with new contact info
      await updateDoc(memberDocRef, {
        name: trimmedName,
        phone: normalizedPhone,
        address: trimmedAddress,
        updatedAt: nowISO,
      });
    }
  } catch (err) {
    console.warn('Note: Linked member document update could not be completed:', err);
  }

  // 6. Sync Firebase Auth Display Name
  try {
    if (auth.currentUser && auth.currentUser.uid === uid) {
      await updateProfile(auth.currentUser, {
        displayName: trimmedName,
      });
    }
  } catch (err) {
    console.warn('Could not update Firebase Auth displayName:', err);
  }

  // Return the fresh unified profile
  const userObj = typeof user === 'object' && user?.uid ? user : (auth.currentUser || { uid });
  return await getMemberProfile(userObj);
};

/**
 * Handle First Login / Member Registration profile setup.
 * Requires Full Name and Mobile Number, and optionally Address.
 * Saves details to both users/{uid} and members collection, marking profileCompleted: true.
 *
 * @param {import('firebase/auth').User} user
 * @param {object} param1
 * @param {string} param1.name
 * @param {string} param1.phone
 * @param {string} [param1.address]
 * @returns {Promise<object>} Complete profile
 */
export const saveFirstLoginProfile = async (user, { name, phone, address = '' }) => {
  if (!user || !user.uid) {
    throw new Error('Authentication is required to complete profile setup.');
  }

  const trimmedName = (name || '').trim();
  const trimmedAddress = (address || '').trim();

  // 1. Validation
  if (!trimmedName) {
    throw new Error('Full Name is required.');
  }
  if (trimmedName.length < 2) {
    throw new Error('Full Name must be at least 2 characters long.');
  }

  const mobileRes = validateMobileFormat(phone);
  if (!mobileRes.isValid) {
    throw new Error(mobileRes.error);
  }
  const normalizedPhone = mobileRes.normalized;

  // 2. Uniqueness check across users and members
  const uniquenessCheck = await checkMobileNumberUnique(normalizedPhone, user.uid);
  if (!uniquenessCheck.isUnique) {
    throw new Error(uniquenessCheck.message);
  }

  const nowISO = new Date().toISOString();
  const memberId = generateMemberIdFromUid(user.uid);

  // 3. Persist to users/{uid}
  const userDocRef = doc(db, USERS_COLLECTION, user.uid);
  const userUpdateData = {
    name: trimmedName,
    phone: normalizedPhone,
    address: trimmedAddress,
    memberId,
    profileCompleted: true,
    status: 'active',
    role: 'member',
    updatedAt: nowISO,
  };

  await setDoc(userDocRef, userUpdateData, { merge: true });

  // 4. Sync with members collection (create or update)
  try {
    const membersRef = collection(db, MEMBERS_COLLECTION);
    const qUserId = query(membersRef, where('userId', '==', user.uid), limit(1));
    const snapUserId = await getDocs(qUserId);

    if (!snapUserId.empty) {
      const docRef = doc(db, MEMBERS_COLLECTION, snapUserId.docs[0].id);
      await updateDoc(docRef, {
        name: trimmedName,
        phone: normalizedPhone,
        address: trimmedAddress,
        memberId,
        status: 'active',
        updatedAt: nowISO,
      });
    } else {
      let snapEmail = null;
      if (user.email) {
        const qEmail = query(membersRef, where('email', '==', user.email.toLowerCase()), limit(1));
        snapEmail = await getDocs(qEmail);
      }

      if (snapEmail && !snapEmail.empty) {
        const docRef = doc(db, MEMBERS_COLLECTION, snapEmail.docs[0].id);
        await updateDoc(docRef, {
          userId: user.uid,
          name: trimmedName,
          phone: normalizedPhone,
          address: trimmedAddress,
          memberId,
          status: 'active',
          updatedAt: nowISO,
        });
      } else {
        // Create new linked member document
        await setDoc(doc(membersRef), {
          userId: user.uid,
          name: trimmedName,
          email: (user.email || '').toLowerCase(),
          phone: normalizedPhone,
          address: trimmedAddress,
          memberId,
          status: 'active',
          createdAt: nowISO,
          updatedAt: nowISO,
        });
      }
    }
  } catch (err) {
    console.warn('Could not sync members collection during first login setup:', err);
  }

  // 5. Update Firebase Auth displayName
  try {
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, {
        displayName: trimmedName,
      });
    }
  } catch (err) {
    console.warn('Could not update Firebase displayName:', err);
  }

  return await getMemberProfile(user);
};

/**
 * Change member password for email/password authentication
 * @param {import('firebase/auth').User} user
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {Promise<void>}
 */
export const changeMemberPassword = async (
  user,
  currentPassword,
  newPassword,
  confirmPassword
) => {
  if (!user || !user.email) {
    throw new Error('Authentication is required to change password.');
  }

  if (!currentPassword) {
    throw new Error('Please enter your current password.');
  }

  if (!newPassword) {
    throw new Error('Please enter a new password.');
  }

  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  if (newPassword !== confirmPassword) {
    throw new Error('New password and confirm password do not match.');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password cannot be the same as your current password.');
  }

  // 1. Re-authenticate user with current password
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);

  // 2. Update password
  await updatePassword(user, newPassword);
};
