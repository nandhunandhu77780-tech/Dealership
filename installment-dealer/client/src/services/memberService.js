import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { db } from './firebase.js';
import {
  normalizePhoneNumber,
  validateMobileFormat,
  checkMobileNumberUnique,
} from './profileService.js';

const MEMBERS_COLLECTION = 'members';

/**
 * Generate a default unique Member ID (e.g., MEM-7482)
 * @returns {string}
 */
export const generateMemberId = () => {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `MEM-${randomNum}`;
};

/**
 * Create a new member in Firestore.
 * Requires Full Name and Mobile Number, and enforces uniqueness across all members.
 *
 * @param {object} memberData
 * @param {string} memberData.name
 * @param {string} [memberData.email]
 * @param {string} memberData.phone
 * @param {string} [memberData.address]
 * @param {string} [memberData.memberId]
 * @param {string} [memberData.status='active']
 * @returns {Promise<{ id: string, ...object }>}
 */
export const createMember = async (memberData) => {
  const trimmedName = memberData.name ? memberData.name.trim() : '';
  if (!trimmedName) {
    throw new Error('Full Name is required.');
  }

  // Validate required mobile format
  const mobileCheck = validateMobileFormat(memberData.phone);
  if (!mobileCheck.isValid) {
    throw new Error(mobileCheck.error);
  }
  const normalizedPhone = mobileCheck.normalized;

  // Verify mobile uniqueness across Firestore
  const uniqCheck = await checkMobileNumberUnique(normalizedPhone);
  if (!uniqCheck.isUnique) {
    throw new Error(uniqCheck.message);
  }

  const membersRef = collection(db, MEMBERS_COLLECTION);
  const newMember = {
    name: trimmedName,
    email: memberData.email ? memberData.email.trim().toLowerCase() : '',
    phone: normalizedPhone,
    address: memberData.address ? memberData.address.trim() : '',
    memberId: memberData.memberId ? memberData.memberId.trim().toUpperCase() : generateMemberId(),
    status: memberData.status === 'inactive' ? 'inactive' : 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const docRef = await addDoc(membersRef, newMember);
  return { id: docRef.id, ...newMember };
};

/**
 * Fetch all members from Firestore
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getMembers = async () => {
  const membersRef = collection(db, MEMBERS_COLLECTION);
  try {
    const q = query(membersRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback without index if query ordering fails
    const snapshot = await getDocs(membersRef);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Update an existing member in Firestore.
 * Enforces mobile format and prevents duplicate mobile numbers across members.
 *
 * @param {string} id - Firestore Document ID
 * @param {object} memberData
 * @returns {Promise<void>}
 */
export const updateMember = async (id, memberData) => {
  if (!id) throw new Error('Member document ID is required for update');
  const docRef = doc(db, MEMBERS_COLLECTION, id);

  const updatedFields = {
    ...memberData,
    updatedAt: new Date().toISOString(),
  };

  if (updatedFields.name) updatedFields.name = updatedFields.name.trim();
  if (updatedFields.email) updatedFields.email = updatedFields.email.trim().toLowerCase();
  if (updatedFields.address) updatedFields.address = updatedFields.address.trim();
  if (updatedFields.memberId) updatedFields.memberId = updatedFields.memberId.trim().toUpperCase();

  // If phone is provided or updated, validate format and check uniqueness
  if (updatedFields.phone !== undefined) {
    const mobileCheck = validateMobileFormat(updatedFields.phone);
    if (!mobileCheck.isValid) {
      throw new Error(mobileCheck.error);
    }
    const normalizedPhone = mobileCheck.normalized;

    // Check uniqueness (exclude current member document)
    const uniqCheck = await checkMobileNumberUnique(normalizedPhone, null, id);
    if (!uniqCheck.isUnique) {
      throw new Error(uniqCheck.message);
    }

    updatedFields.phone = normalizedPhone;
  }

  await updateDoc(docRef, updatedFields);

  // If member has linked userId, also sync to users/{userId}
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.userId) {
        const userDocRef = doc(db, 'users', data.userId);
        await setDoc(
          userDocRef,
          {
            name: data.name,
            phone: data.phone,
            address: data.address,
            memberId: data.memberId,
            status: data.status,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    }
  } catch (err) {
    console.warn('Note: Could not sync updated member to users collection:', err);
  }
};

/**
 * Delete a member from Firestore
 * @param {string} id - Firestore Document ID
 * @returns {Promise<void>}
 */
export const deleteMember = async (id) => {
  if (!id) throw new Error('Member document ID is required for deletion');
  const docRef = doc(db, MEMBERS_COLLECTION, id);
  await deleteDoc(docRef);
};

/**
 * Toggle active/inactive status for a member
 * @param {string} id
 * @param {string} currentStatus
 * @returns {Promise<string>} newStatus
 */
export const toggleMemberStatus = async (id, currentStatus) => {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  await updateMember(id, { status: newStatus });
  return newStatus;
};

/**
 * Fetch a member by document ID or look up by memberId / userId
 * @param {string} idOrMemberId
 * @returns {Promise<{ id: string, ...object } | null>}
 */
export const getMemberById = async (idOrMemberId) => {
  if (!idOrMemberId) return null;
  const membersRef = collection(db, MEMBERS_COLLECTION);

  // 1. Direct document get by Firestore doc ID in 'members'
  try {
    const docRef = doc(db, MEMBERS_COLLECTION, idOrMemberId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
  } catch {
    // If idOrMemberId is not a valid doc path, continue to query lookups
  }

  // 2. Query by memberId in 'members' (e.g. 'MEM-1234')
  try {
    const q1 = query(membersRef, where('memberId', '==', idOrMemberId));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      const d = snap1.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch {}

  // 3. Query by userId in 'members' (Firebase Auth UID)
  try {
    const q2 = query(membersRef, where('userId', '==', idOrMemberId));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      const d = snap2.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch {}

  // 4. Query in 'users' collection by document ID (Firebase Auth UID)
  try {
    const userDocRef = doc(db, 'users', idOrMemberId);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      return {
        id: userSnap.id,
        userId: userSnap.id,
        name: uData.name || uData.displayName || '',
        email: uData.email || '',
        phone: uData.phone || '',
        address: uData.address || '',
        memberId: uData.memberId || '',
        status: uData.status || 'active',
        createdAt: uData.createdAt || '',
        updatedAt: uData.updatedAt || '',
        ...uData,
      };
    }
  } catch {}

  // 5. Query in 'users' collection by memberId
  try {
    const usersRef = collection(db, 'users');
    const q3 = query(usersRef, where('memberId', '==', idOrMemberId));
    const snap3 = await getDocs(q3);
    if (!snap3.empty) {
      const d = snap3.docs[0];
      const uData = d.data();
      return {
        id: d.id,
        userId: d.id,
        name: uData.name || uData.displayName || '',
        email: uData.email || '',
        phone: uData.phone || '',
        address: uData.address || '',
        memberId: uData.memberId || '',
        status: uData.status || 'active',
        createdAt: uData.createdAt || '',
        updatedAt: uData.updatedAt || '',
        ...uData,
      };
    }
  } catch {}

  return null;
};


